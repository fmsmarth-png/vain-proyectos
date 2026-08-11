import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export interface Notificacion {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: 'info' | 'warning' | 'error' | 'success';
  usuario_email: string;
  activa: boolean;
  visto: boolean;
  visto_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export function useNotificacionJcaballero() {
  const [notificacion, setNotificacion] = useState<Notificacion | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const fetchNotif = async () => {
      try {
        // Obtener email del usuario actual
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email;
        console.log('[useNotificacionJcaballero] Email actual:', email);

        if (email !== 'jcaballero@vain.cl') {
          console.log('[useNotificacionJcaballero] No es jcaballero, saltando');
          setCargando(false);
          return;
        }

        const { data, error } = await supabase
          .from('notificaciones_admin')
          .select('*')
          .eq('usuario_email', 'jcaballero@vain.cl')
          .eq('activa', true)
          .order('creado_en', { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log('[useNotificacionJcaballero] Data:', data);
        console.log('[useNotificacionJcaballero] Error:', error);

        if (error) {
          console.error('[useNotificacionJcaballero] Error RLS:', error);
        } else {
          setNotificacion(data);
        }
      } catch (e) {
        console.error('[useNotificacionJcaballero] Catch:', e);
      } finally {
        setCargando(false);
      }
    };

    fetchNotif();
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase.channel('notif-jc');

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificaciones_admin' },
        (payload: any) => {
          console.log('[useNotificacionJcaballero] 🔄 Realtime:', payload);
          if (payload.new?.usuario_email === 'jcaballero@vain.cl' && payload.new?.activa) {
            setNotificacion(payload.new);
          }
          if (payload.new?.usuario_email === 'jcaballero@vain.cl' && !payload.new?.activa) {
            setNotificacion(null);
          }
        }
      )
      .subscribe((status: string) => {
        console.log('[useNotificacionJcaballero] Realtime status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { notificacion, cargando };
}

export function useNotificacionesAdmin() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const { data, error } = await supabase
          .from('notificaciones_admin')
          .select('*')
          .order('creado_en', { ascending: false });

        if (error) console.error('[useNotificacionesAdmin] Error:', error);
        setNotificaciones(data || []);
      } catch (e) {
        console.error('[useNotificacionesAdmin] Catch:', e);
      } finally {
        setCargando(false);
      }
    };

    fetchAll();
  }, []);

  useEffect(() => {
    const channel = supabase.channel('notif-admin');

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificaciones_admin' },
        (payload: any) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setNotificaciones((prev) => {
              const idx = prev.findIndex((n) => n.id === payload.new.id);
              if (idx >= 0) {
                return [...prev.slice(0, idx), payload.new, ...prev.slice(idx + 1)];
              }
              return [payload.new, ...prev];
            });
          }
          if (payload.eventType === 'DELETE') {
            setNotificaciones((prev) => prev.filter((n) => n.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { notificaciones, cargando };
}
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

// ====================================
// TIPOS
// ====================================
export interface ObservacionInforme {
  id: string;
  numero_obs: number;        // Calculado: ROW_NUMBER por depto
  proyecto_id: string;       // UUID
  proyecto_codigo: string;   // "AGU", "VGR4"
  depto_numero: number;
  tipo: 'PRE-E' | 'PV';
  estado: 'PENDIENTE' | 'SOLUCIONADO';
  observacion: string;
  ambiente: string | null;
  partida_afectada: string | null;
  causa: string | null;
  usuario_email: string;
  usuario_id: string;        // UUID
  propietario_nombre: string | null;
  propietario_contacto: string | null;
  fecha_creacion: string;  // TIMESTAMP
  fecha_resolucion: string | null;
  semana_creacion: string;  // "12-2026"
  semana_resolucion: string | null;
}

export interface FiltrosObservaciones {
  proyectoId?: string;
  tipo?: 'PRE-E' | 'PV' | 'TODOS';
  estado?: 'PENDIENTE' | 'SOLUCIONADO' | 'TODOS';
  deptoNumero?: number;
  usuarioEmail?: string;
}

// ====================================
// HOOK: useObservacionesInformePV
// ====================================
export function useObservacionesInformePV(filtros: FiltrosObservaciones = {}) {
  const [observaciones, setObservaciones] = useState<ObservacionInforme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // No cargar si no hay deptoNumero (importante para evitar queries innecesarias)
    if (!filtros.deptoNumero) {
      setObservaciones([]);
      setLoading(false);
      return;
    }

    const fetchObservaciones = async () => {
      try {
        setLoading(true);
        setError(null);

        // Query directa a tabla (sin RPC)
        let query = supabase
          .from('observacionesinformepv')
          .select(
            'id, proyecto_id, proyecto_codigo, depto_numero, tipo, estado, observacion, ambiente, partida_afectada, causa, usuario_email, usuario_id, propietario_nombre, propietario_contacto, fecha_creacion, fecha_resolucion, semana_creacion, semana_resolucion'
          );

        // Filtro obligatorio: depto_numero
        query = query.eq('depto_numero', filtros.deptoNumero);

        // Aplicar otros filtros solo si existen
        if (filtros.proyectoId) {
          query = query.eq('proyecto_id', filtros.proyectoId);
        }

        if (filtros.tipo && filtros.tipo !== 'TODOS') {
          query = query.eq('tipo', filtros.tipo);
        }

        if (filtros.estado && filtros.estado !== 'TODOS') {
          query = query.eq('estado', filtros.estado);
        }

        if (filtros.usuarioEmail) {
          query = query.eq('usuario_email', filtros.usuarioEmail.toLowerCase());
        }

        const { data: directData, error: directError } = await query.order('fecha_creacion', { ascending: true });

        if (directError) {
          console.error('Error fetching observaciones:', directError);
          throw directError;
        }

        // Calcular numero_obs por depto
        const obsMap = new Map<number, number>();
        const withNumero = (directData || []).map((obs: any) => {
          const count = (obsMap.get(obs.depto_numero) || 0) + 1;
          obsMap.set(obs.depto_numero, count);
          return {
            ...obs,
            numero_obs: count,
          };
        });

        setObservaciones(withNumero);
      } catch (err) {
        console.error('Error fetching observaciones:', err);
        setError(err instanceof Error ? err : new Error('Error desconocido'));
        setObservaciones([]);
      } finally {
        setLoading(false);
      }
    };

    fetchObservaciones();
  }, [
    filtros.proyectoId,
    filtros.tipo,
    filtros.estado,
    filtros.deptoNumero,
    filtros.usuarioEmail,
  ]);

  return { observaciones, loading, error };
}

// ====================================
// FUNCIÓN: Lectura simple (sin hook)
// ====================================
export async function fetchObservacionesInforme(
  proyectoId: string,
  tipo: 'PRE-E' | 'PV' | 'TODOS' = 'TODOS'
): Promise<ObservacionInforme[]> {
  try {
    let query = supabase
      .from('observacionesinformepv')
      .select(
        'id, proyecto_id, proyecto_codigo, depto_numero, tipo, estado, observacion, ambiente, partida_afectada, causa, usuario_email, usuario_id, propietario_nombre, propietario_contacto, fecha_creacion, fecha_resolucion, semana_creacion, semana_resolucion'
      )
      .eq('proyecto_id', proyectoId);

    if (tipo !== 'TODOS') {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query.order('fecha_creacion', { ascending: true });

    if (error) throw error;

    // Calcular numero_obs por depto
    const obsMap = new Map<number, number>();
    return (data || []).map((obs: any) => {
      const count = (obsMap.get(obs.depto_numero) || 0) + 1;
      obsMap.set(obs.depto_numero, count);
      return {
        id: obs.id,
        numero_obs: count,
        proyecto_id: obs.proyecto_id,
        proyecto_codigo: obs.proyecto_codigo || '',
        depto_numero: obs.depto_numero,
        tipo: obs.tipo,
        estado: obs.estado,
        observacion: obs.observacion,
        ambiente: obs.ambiente || null,
        partida_afectada: obs.partida_afectada || null,
        causa: obs.causa || null,
        usuario_email: obs.usuario_email?.toLowerCase() || '',
        usuario_id: obs.usuario_id || '',
        propietario_nombre: obs.propietario_nombre || null,
        propietario_contacto: obs.propietario_contacto || null,
        fecha_creacion: obs.fecha_creacion,
        fecha_resolucion: obs.fecha_resolucion || null,
        semana_creacion: obs.semana_creacion || '',
        semana_resolucion: obs.semana_resolucion || null,
      };
    });
  } catch (err: any) {
    console.error('Unexpected error in fetchObservacionesInforme:', err);
    return [];
  }
}

// ====================================
// FUNCIÓN: Crear nueva observación
// ====================================
export async function crearObservacionInforme(data: {
  proyecto_id: string;
  proyecto_codigo: string;
  depto_numero: number;
  tipo: 'PRE-E' | 'PV';
  observacion: string;
  ambiente: string | null;
  partida_afectada: string | null;
  causa: string | null;
  usuario_email: string;
  usuario_id: string;
  propietario_nombre: string | null;
  propietario_contacto: string | null;
  fecha_creacion: string;
  semana_creacion: string;
}): Promise<ObservacionInforme | null> {
  try {
    const { data: created, error } = await supabase
      .from('observacionesinformepv')
      .insert({
        proyecto_id: data.proyecto_id,
        proyecto_codigo: data.proyecto_codigo,
        depto_numero: data.depto_numero,
        tipo: data.tipo,
        estado: 'PENDIENTE',
        observacion: data.observacion,
        ambiente: data.ambiente,
        partida_afectada: data.partida_afectada,
        causa: data.causa,
        usuario_email: data.usuario_email.toLowerCase(),
        usuario_id: data.usuario_id,
        propietario_nombre: data.propietario_nombre,
        propietario_contacto: data.propietario_contacto,
        fecha_creacion: data.fecha_creacion,
        semana_creacion: data.semana_creacion,
      })
      .select()
      .maybeSingle();

    if (error || !created) {
      console.error('Error creating observacion:', error);
      return null;
    }

    return {
      id: created.id,
      numero_obs: 1,
      proyecto_id: created.proyecto_id,
      proyecto_codigo: created.proyecto_codigo,
      depto_numero: created.depto_numero,
      tipo: created.tipo,
      estado: created.estado,
      observacion: created.observacion,
      ambiente: created.ambiente,
      partida_afectada: created.partida_afectada,
      causa: created.causa,
      usuario_email: created.usuario_email,
      usuario_id: created.usuario_id,
      propietario_nombre: created.propietario_nombre,
      propietario_contacto: created.propietario_contacto,
      fecha_creacion: created.fecha_creacion,
      fecha_resolucion: created.fecha_resolucion || null,
      semana_creacion: created.semana_creacion,
      semana_resolucion: created.semana_resolucion || null,
    };
  } catch (err: any) {
    console.error('Unexpected error in crearObservacionInforme:', err);
    return null;
  }
}

// ====================================
// FUNCIÓN: Actualizar estado observación
// ====================================
export async function actualizarObservacionInforme(
  obsId: string,
  updates: Partial<Pick<ObservacionInforme, 'estado' | 'fecha_resolucion' | 'semana_resolucion'>>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('observacionesinformepv')
      .update({
        estado: updates.estado,
        fecha_resolucion: updates.fecha_resolucion,
        semana_resolucion: updates.semana_resolucion,
      })
      .eq('id', obsId);

    if (error) {
      console.error('Error updating observacion:', error);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('Unexpected error in actualizarObservacionInforme:', err);
    return false;
  }
}
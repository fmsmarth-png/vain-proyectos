import React, { useState, useEffect } from 'react';
import { IonModal } from '@ionic/react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useNotificacionJcaballero } from '../hooks/useNotificaciones';
import { supabase } from '../supabase';

const CONFIG = {
  success: { color: '#3fa64c', bg: 'rgba(63,166,76,0.12)', border: 'rgba(63,166,76,0.3)', Icon: CheckCircle2 },
  warning: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', Icon: AlertTriangle },
  error:   { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', Icon: XCircle },
  info:    { color: '#4c86e6', bg: 'rgba(76,134,230,0.12)', border: 'rgba(76,134,230,0.3)', Icon: Info },
};

export const NotificacionModal: React.FC = () => {
  const { notificacion, cargando } = useNotificacionJcaballero();
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if (!cargando && notificacion) setMostrar(true);
  }, [notificacion, cargando]);

  // Marca la notificación como vista y cierra el modal
  const marcarVisto = async () => {
    setMostrar(false);
    if (!notificacion || notificacion.visto) return;

    const { error } = await supabase
      .from('notificaciones_admin')
      .update({ visto: true, visto_en: new Date().toISOString() })
      .eq('id', notificacion.id);

    if (error) {
      console.error('[NotificacionModal] Error al marcar visto:', error);
    } else {
      console.log('[NotificacionModal] ✅ Marcada como vista');
    }
  };

  if (!notificacion) return null;

  const cfg = CONFIG[notificacion.tipo] || CONFIG.info;
  const Icon = cfg.Icon;

  return (
    <IonModal
      isOpen={mostrar}
      onDidDismiss={marcarVisto}
      style={{
        '--width': '90%',
        '--max-width': '420px',
        '--height': 'auto',
        '--border-radius': '20px',
        '--background': '#000000',
        '--box-shadow': '0 20px 60px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{
        background: '#000000',
        border: `0.5px solid ${cfg.border}`,
        borderRadius: 20,
        overflow: 'hidden',
      }}>
        {/* Barra superior de acento */}
        <div style={{ height: 4, background: cfg.color, width: '100%' }} />

        <div style={{ padding: '32px 28px' }}>
          {/* Botón cerrar */}
          <button
            onClick={marcarVisto}
            style={{
              position: 'absolute', top: 20, right: 20,
              background: 'rgba(255,255,255,0.05)', border: 'none',
              borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} color="#75797f" />
          </button>

          {/* Ícono */}
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: cfg.bg, border: `0.5px solid ${cfg.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <Icon size={30} color={cfg.color} strokeWidth={2} />
          </div>

          {/* Título */}
          <h2 style={{
            margin: '0 0 12px 0', fontSize: 20, fontWeight: 600,
            color: '#f2f3f5', lineHeight: 1.3,
          }}>
            {notificacion.titulo}
          </h2>

          {/* Mensaje */}
          <p style={{
            margin: '0 0 24px 0', fontSize: 15, lineHeight: 1.6,
            color: '#a9adb3',
          }}>
            {notificacion.mensaje}
          </p>

          {/* Fecha */}
          <div style={{
            fontSize: 11, color: '#4a4d52', marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
            {new Date(notificacion.actualizado_en).toLocaleString('es-CL', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </div>

          {/* Botón */}
          <button
            onClick={marcarVisto}
            style={{
              width: '100%', height: 50, borderRadius: 12,
              background: cfg.color, border: 'none', color: '#000000',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseDown={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseUp={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Entendido
          </button>
        </div>
      </div>
    </IonModal>
  );
};
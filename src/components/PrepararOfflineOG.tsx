// src/components/PrepararOfflineOG.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Botón "Preparar modo offline" para RevisionOG  ‹FMS›
//
// Descarga los planos e imágenes de ambiente a IndexedDB (vía ogImageDB.ts) para
// poder inspeccionar sin conexión en terreno. Muestra estado actual (cantidad +
// fecha), progreso real durante la descarga y resultado.
//
// Drop-in: colocar <PrepararOfflineOG /> debajo del selector de proyecto en la
// pantalla `inicio` de RevisionOG.tsx. Lee el tema por su cuenta (useTheme), no
// requiere props.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import {
  descargarTodasLasImagenesOG,
  contarImagenesDescargadas,
  fechaDescargaImagenes,
} from '../utils/ogImageDB';

const PrepararOfflineOG: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [descargando, setDescargando] = useState(false);
  const [prog, setProg]               = useState<{ hechas: number; total: number }>({ hechas: 0, total: 0 });
  const [cantidad, setCantidad]       = useState<number>(0);
  const [fecha, setFecha]             = useState<Date | null>(null);
  const [resultado, setResultado]     = useState<string>('');

  // ── tokens ────────────────────────────────────────────────────────────────
  const card          = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary = dark ? '#6b7280'  : '#64748b';
  const textMuted     = dark ? '#444444'  : '#94a3b8';
  const azul          = dark ? '#60a5fa'  : '#1d4ed8';
  const verde         = dark ? '#4ade80'  : '#15803d';
  const rojo          = dark ? '#f87171'  : '#b91c1c';

  const cargarEstado = async () => {
    setCantidad(await contarImagenesDescargadas());
    setFecha(await fechaDescargaImagenes());
  };

  // Montaje: garantiza que el estado refleje lo ya descargado en arranque en frío
  useEffect(() => { cargarEstado(); }, []);

  useIonViewDidEnter(() => { cargarEstado(); });

  const handleDescargar = async () => {
    if (descargando) return;
    setResultado('');
    setDescargando(true);
    setProg({ hechas: 0, total: 0 });
    try {
      const r = await descargarTodasLasImagenesOG((hechas, total) => {
        setProg({ hechas, total });
      });
      setResultado(
        r.fail > 0
          ? `Descarga completa con avisos: ${r.ok} guardadas, ${r.fail} fallaron.`
          : `✓ ${r.ok} imágenes listas para usar offline.`,
      );
      await cargarEstado();
    } catch (e) {
      console.error('[PrepararOfflineOG]', e);
      setResultado('No se pudo completar la descarga. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setDescargando(false);
    }
  };

  const fechaTxt = fecha
    ? fecha.toLocaleString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const pct       = prog.total > 0 ? Math.round((prog.hechas / prog.total) * 100) : 0;
  const conAvisos = resultado.includes('fallaron') || resultado.startsWith('No se pudo');

  return (
    <div style={{
      background: card, borderRadius: 16, border: `0.5px solid ${border}`,
      padding: '14px 14px', marginBottom: 10,
    }}>
      <div style={{
        fontSize: 9, color: textMuted, textTransform: 'uppercase',
        letterSpacing: '1.5px', fontWeight: 600, marginBottom: 10,
      }}>
        Modo offline
      </div>

      <div style={{ fontSize: 13, color: textSecondary, lineHeight: 1.5, marginBottom: 12 }}>
        Descarga los planos e imágenes de ambiente a este dispositivo para inspeccionar
        sin conexión en terreno. Hazlo con red antes de salir.
      </div>

      {/* Estado actual */}
      {!descargando && (
        <div style={{ fontSize: 12, color: cantidad > 0 ? verde : textMuted, marginBottom: 12 }}>
          {cantidad > 0
            ? `✓ ${cantidad} imágenes guardadas${fechaTxt ? ` · ${fechaTxt}` : ''}`
            : 'Aún no has descargado imágenes.'}
        </div>
      )}

      {/* Progreso */}
      {descargando && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: textPrimary, marginBottom: 6 }}>
            Descargando… {prog.hechas}/{prog.total || '…'}
          </div>
          <div style={{ height: 6, borderRadius: 999, background: border, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`, background: azul,
              transition: 'width .2s ease',
            }} />
          </div>
        </div>
      )}

      <button
        onClick={handleDescargar}
        disabled={descargando}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: descargando ? 'transparent' : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
          color: descargando ? textSecondary : '#ffffff',
          border: descargando ? `0.5px solid ${border}` : 'none',
          borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 700,
          width: '100%', cursor: descargando ? 'default' : 'pointer',
        }}
      >
        {descargando
          ? 'Descargando…'
          : (cantidad > 0 ? '↻ Actualizar imágenes offline' : '⬇️ Preparar modo offline')}
      </button>

      {resultado && !descargando && (
        <div style={{
          fontSize: 12, color: conAvisos ? rojo : textSecondary,
          marginTop: 10, textAlign: 'center',
        }}>
          {resultado}
        </div>
      )}
    </div>
  );
};

export default PrepararOfflineOG;
        
// src/components/PrepararOfflineOG.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Botón "Preparar modo offline" para RevisionOG  ‹FMS›
//
// Descarga a este dispositivo TODO lo necesario para inspeccionar sin conexión:
//   1) Planos e imágenes de ambiente → IndexedDB (vía ogImageDB.ts)
//   2) Datos estructurales: proyectos, torres y departamentos → IndexedDB
//      (vía ogDataDB.ts) — así el SELECTOR (proyecto → torre → depto) también
//      funciona sin red, no solo la pantalla posterior a elegir el depto.
//
// Recibe `proyectos` (los MISMOS que muestra el selector = solo los asignados al
// usuario) para cachear exactamente ese set y que offline == online.
//
// Drop-in: <PrepararOfflineOG proyectos={proyectos} /> debajo del selector de
// proyecto en la pantalla `inicio` de RevisionOG.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import {
  descargarTodasLasImagenesOG,
  contarImagenesDescargadas,
  fechaDescargaImagenes,
} from '../utils/ogImageDB';
import {
  descargarDatosOG,
  contarDatosDescargados,
  ProyectoOffline,
} from '../utils/ogDataDB';

interface Props {
  proyectos: any[]; // los asignados al usuario, tal cual los muestra el selector
}

const PrepararOfflineOG: React.FC<Props> = ({ proyectos = [] }) => {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [descargando, setDescargando] = useState(false);
  const [prog, setProg]               = useState<{ hechas: number; total: number }>({ hechas: 0, total: 0 });
  const [faseData, setFaseData]       = useState<string>('');   // etiqueta durante descarga de datos
  const [cantidad, setCantidad]       = useState<number>(0);    // imágenes
  const [datos, setDatos]             = useState<{ proyectos: number; torres: number; departamentos: number }>(
    { proyectos: 0, torres: 0, departamentos: 0 },
  );
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
    setDatos(await contarDatosDescargados());
  };

  // Montaje: garantiza que el estado refleje lo ya descargado en arranque en frío
  useEffect(() => { cargarEstado(); }, []);

  useIonViewDidEnter(() => { cargarEstado(); });

  const handleDescargar = async () => {
    if (descargando) return;
    setResultado('');
    setDescargando(true);
    setProg({ hechas: 0, total: 0 });
    setFaseData('');
    try {
      // 1) Imágenes (planos + ambientes)
      const r = await descargarTodasLasImagenesOG((hechas, total) => {
        setProg({ hechas, total });
      });

      // 2) Datos estructurales (proyectos → torres → departamentos)
      setFaseData('Guardando datos de proyectos…');
      const d = await descargarDatosOG(proyectos as ProyectoOffline[], (p) => {
        if (p.fase === 'proyectos')       setFaseData(`Guardando proyectos… ${p.actual}`);
        else if (p.fase === 'torres')     setFaseData(`Guardando torres… ${p.actual}`);
        else if (p.fase === 'departamentos') setFaseData(`Guardando departamentos… ${p.actual}`);
      });

      const avisoImg = r.fail > 0 ? ` · ⚠️ ${r.fail} imágenes fallaron` : '';
      setResultado(
        `✓ Listo offline: ${r.ok} imágenes · ${d.departamentos} deptos en ${d.proyectos} proyecto${d.proyectos !== 1 ? 's' : ''}.${avisoImg}`,
      );
      await cargarEstado();
    } catch (e) {
      console.error('[PrepararOfflineOG]', e);
      setResultado('No se pudo completar la descarga. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setDescargando(false);
      setFaseData('');
    }
  };

  const fechaTxt = fecha
    ? fecha.toLocaleString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const pct       = prog.total > 0 ? Math.round((prog.hechas / prog.total) * 100) : 0;
  const conAvisos = resultado.includes('fallaron') || resultado.startsWith('No se pudo');
  const hayAlgo   = cantidad > 0 || datos.departamentos > 0;

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
        Descarga a este dispositivo los planos, las imágenes de ambiente y los datos de
        proyectos, torres y departamentos, para inspeccionar sin conexión en terreno.
        Hazlo con red antes de salir.
      </div>

      {/* Estado actual */}
      {!descargando && (
        <div style={{ fontSize: 12, color: hayAlgo ? verde : textMuted, marginBottom: 12 }}>
          {hayAlgo
            ? `✓ ${cantidad} imágenes · ${datos.departamentos} deptos (${datos.proyectos} proy)${fechaTxt ? ` · ${fechaTxt}` : ''}`
            : 'Aún no has preparado el modo offline.'}
        </div>
      )}

      {/* Progreso */}
      {descargando && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: textPrimary, marginBottom: 6 }}>
            {faseData ? faseData : `Descargando imágenes… ${prog.hechas}/${prog.total || '…'}`}
          </div>
          <div style={{ height: 6, borderRadius: 999, background: border, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: faseData ? '100%' : `${pct}%`, background: azul,
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
          : (hayAlgo ? '↻ Actualizar datos offline' : '⬇️ Preparar modo offline')}
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

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
import { useOffline } from '../Context/OfflineContext'; // ← FMS: check de conexión
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
import { descargarCacheOG } from '../utils/Ogcache'; // ← FMS: cache de datos (catálogo, tolerancias, planos) en localStorage

interface Props {
  proyectos: any[]; // los asignados al usuario, tal cual los muestra el selector
}

const PrepararOfflineOG: React.FC<Props> = ({ proyectos = [] }) => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { online } = useOffline(); // ← FMS: para prevenir descarga sin red

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

    // Validación 1: necesita conexión para descargar
    if (!online) {
      setResultado('Sin conexión. Conéctate a internet para preparar el modo offline.');
      return;
    }

    // Validación 2: necesita proyectos para cachear el selector
    if (!proyectos || proyectos.length === 0) {
      setResultado('No hay proyectos para descargar. Espera a que cargue el selector o verifica tus proyectos asignados.');
      return;
    }

    setResultado('');
    setDescargando(true);
    setProg({ hechas: 0, total: 0 });
    setFaseData('');
    try {
      // 1) Imágenes (planos + ambientes) → IndexedDB
      const r = await descargarTodasLasImagenesOG((hechas, total) => {
        setProg({ hechas, total });
      });

      // 2) Datos estructurales (proyectos → torres → departamentos) → IndexedDB
      setFaseData('Guardando datos de proyectos…');
      const d = await descargarDatosOG(proyectos as ProyectoOffline[], (p) => {
        if (p.fase === 'proyectos')       setFaseData(`Guardando proyectos… ${p.actual}`);
        else if (p.fase === 'torres')     setFaseData(`Guardando torres… ${p.actual}`);
        else if (p.fase === 'departamentos') setFaseData(`Guardando departamentos… ${p.actual}`);
      });

      // 3) Cache de catálogo/tolerancias/planos/ambientes → localStorage
      //    CRÍTICO: esto llena lo que verifica hayCacheOG(). Sin este paso,
      //    el banner "Sin cache" aparece aunque las imágenes y datos estén bajados.
      setFaseData('Guardando catálogo y tolerancias…');
      const cacheOk = await descargarCacheOG(true); // forzar = true para refrescar siempre
      if (!cacheOk) {
        console.warn('[PrepararOfflineOG] descargarCacheOG devolvió false');
      }

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

      {/* Aviso sin conexión */}
      {!descargando && !online && (
        <div style={{
          fontSize: 12, color: rojo, marginBottom: 12,
          background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2',
          border: `0.5px solid ${dark ? 'rgba(239,68,68,0.15)' : '#fecaca'}`,
          borderRadius: 10, padding: '8px 12px',
        }}>
          📶 Sin conexión — conéctate a internet para preparar el modo offline.
        </div>
      )}

      {/* Progreso */}
      {descargando && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: textPrimary, marginBottom: 6 }}>
            {faseData ? faseData : `Descargando imágenes… ${prog.hechas}/${prog.total || '…'}`}
          </div>
          <div style={{ height: 6, borderRadius: 999, background: border, overflow: 'hidden', position: 'relative' }}>
            {faseData ? (
              // Fase de datos: barra indeterminada animada (no sabemos % exacto)
              <div style={{
                height: '100%', width: '40%', background: azul,
                borderRadius: 999,
                animation: 'ogIndeterminado 1.2s ease-in-out infinite',
              }} />
            ) : (
              // Fase de imágenes: progreso real
              <div style={{
                height: '100%', width: `${pct}%`, background: azul,
                transition: 'width .2s ease',
              }} />
            )}
          </div>
          <style>{`
            @keyframes ogIndeterminado {
              0%   { transform: translateX(-100%); }
              100% { transform: translateX(250%); }
            }
          `}</style>
        </div>
      )}

      <button
        onClick={handleDescargar}
        disabled={descargando || !online}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: (descargando || !online) ? 'transparent' : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
          color: (descargando || !online) ? textSecondary : '#ffffff',
          border: (descargando || !online) ? `0.5px solid ${border}` : 'none',
          borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 700,
          width: '100%', cursor: (descargando || !online) ? 'default' : 'pointer',
          opacity: (!online && !descargando) ? 0.6 : 1,
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
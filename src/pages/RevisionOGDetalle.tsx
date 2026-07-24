// src/pages/RevisionOGDetalle.tsx
// Módulo Revisión Tolerancias OG — Pantalla 2: Selector visual de ambiente
// Muestra el plano general del depto con botones superpuestos por ambiente.
// Al tocar un ambiente navega a RevisionOGAmbiente.tsx (zoom + elementos).
// FMS · Junio 2026
// Offline: pasa cacheOk al navegar, muestra aviso si no hay cache
//
// FIX (jul 2026 · navegación OG): la selección ya NO llega por location.state
//   (no sobrevive al back del router → pantalla blanca / rebote al dashboard).
//   Se lee desde sessionStorage ('og_seleccion') que setea RevisionOG, y al
//   avanzar al ambiente se hace merge de la clave 'ambiente' sobre esa misma
//   selección en vez de pasarla por state.

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { useIonViewDidEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';
import { hayCacheOG, getPlanoCache, getAmbientesPlanoCache } from '../utils/Ogcache';       // ← FMS offline OG
import { getImagenUrlDB } from '../utils/ogImageDB';                                         // ← FMS offline OG (imágenes IndexedDB)
import { useOffline } from '../Context/OfflineContext'; // ← FMS offline OG

// ── Dimensiones originales del plano base ────────────────────────────────────
const PLANO_W = 674;
const PLANO_H = 961;

interface NavState {
  proyecto: { id: string; nombre: string };
  torre:    { id: string; nombre: string };
  depto:    { id: string; numero: string; id_obra?: string; plano_version_id?: string };
  cerrado:  boolean;
}

interface PlanoAmbiente {
  id: string;
  titulo: string;
  ambiente_cod: string;
  grupo_imagen: string | null;
  pos_x_base: number;
  pos_y_base: number;
  ancho_base: number;
  alto_base: number;
  orden: number;
}

// ── Selección OG persistida (reemplaza a location.state) ─────────────────────
const leerSeleccionOG = (): NavState | null => {
  try { return JSON.parse(sessionStorage.getItem('og_seleccion') || 'null'); }
  catch { return null; }
};

const RevisionOGDetalle: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const history = useHistory();
  const mounted = useRef(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const { online } = useOffline(); // ← FMS offline OG

  // ── tokens ────────────────────────────────────────────────────────────────
  const bg          = dark ? '#000000' : '#f0f4f8';
  const cardGrad    = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border      = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb'  : '#0f172a';
  const textMuted   = dark ? '#444444'  : '#94a3b8';
  const toolbar     = dark ? '#000000'  : '#1e3a5f';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const rojo        = dark ? '#f87171' : '#b91c1c';
  const rojoBg      = dark ? 'rgba(239,68,68,0.06)' : '#fef2f2';
  const rojoBord    = dark ? 'rgba(239,68,68,0.15)' : '#fecaca';
  const amarillo    = dark ? '#fbbf24' : '#a16207';   // ← FMS offline OG
  const amarilloBg  = dark ? 'rgba(251,191,36,0.06)' : '#fffbeb'; // ← FMS offline OG
  const amarilloBord = dark ? 'rgba(251,191,36,0.2)' : '#fde68a'; // ← FMS offline OG

  // ── selección (desde sessionStorage, re-hidratada en cada montaje) ─────────
  const sel = leerSeleccionOG();
  const proyecto = sel?.proyecto;
  const torre    = sel?.torre;
  const depto     = sel?.depto;
  const cerrado   = sel?.cerrado ?? false;

  // ── state ─────────────────────────────────────────────────────────────────
  const [planoUrl, setPlanoUrl]         = useState<string | null>(null);
  const [planoBlob, setPlanoBlob]       = useState<string | null>(null); // blob URL local (legacy)
  const [ambientes, setAmbientes]       = useState<PlanoAmbiente[]>([]);
  const [cargando, setCargando]         = useState(true);
  const [imgSize, setImgSize]           = useState<{ w: number; h: number } | null>(null);
  const [contenedorW, setContenedorW]   = useState(0);
  const [cacheOk]                       = useState(hayCacheOG()); // ← FMS offline OG

  // Revocar blob URLs al desmontar para evitar memory leak.
  // Con IndexedDB (data: URLs) esto queda como no-op seguro: revokeObjectURL
  // sobre un data: URL no hace nada. Se mantiene por compatibilidad.
  useEffect(() => {
    return () => {
      if (planoBlob) URL.revokeObjectURL(planoBlob);
    };
  }, [planoBlob]);

  // ── medir contenedor — con reintento para Android ─────────────────────────
  const medirContenedor = useCallback(() => {
    if (!contenedorRef.current) return;
    const w = contenedorRef.current.offsetWidth;
    if (w > 0) {
      setContenedorW(w);
    } else {
      setTimeout(() => {
        if (contenedorRef.current) {
          setContenedorW(contenedorRef.current.offsetWidth);
        }
      }, 100);
    }
  }, []);

  // ── init ──────────────────────────────────────────────────────────────────
  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; inicializar(); }
  });

  const inicializar = async () => {
    if (!depto?.plano_version_id) { setCargando(false); return; }
    setCargando(true);
    try {
      let urlParaCargar: string | null = null;

      if (online) {
        const { data: plano } = await supabase
          .from('og_planos')
          .select('plano_url')
          .eq('plano_version_id', depto.plano_version_id)
          .eq('activo', true)
          .maybeSingle();
        if (plano?.plano_url) urlParaCargar = plano.plano_url;

        const { data: ams } = await supabase
          .from('og_planos_ambientes')
          .select('id, titulo, ambiente_cod, grupo_imagen, pos_x_base, pos_y_base, ancho_base, alto_base, orden')
          .eq('plano_version_id', depto.plano_version_id)
          .eq('activo', true)
          .order('orden');
        setAmbientes(ams || []);
      } else {
        const planoCached = getPlanoCache(depto.plano_version_id);
        if (planoCached) urlParaCargar = planoCached.plano_url;

        const ambsCached = getAmbientesPlanoCache(depto.plano_version_id);
        setAmbientes(ambsCached);
      }

      if (urlParaCargar) {
        // Servir desde IndexedDB si está descargada (offline); si no, URL original (online)
        const src = await getImagenUrlDB(urlParaCargar);
        setPlanoUrl(src);
        setPlanoBlob(null); // data: URLs no requieren revoke (a diferencia de los blob URLs)
      }

      setTimeout(medirContenedor, 150);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    medirContenedor();
    window.addEventListener('resize', medirContenedor);
    return () => window.removeEventListener('resize', medirContenedor);
  }, [medirContenedor]);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgSize({ w: img.offsetWidth, h: img.offsetHeight });
    medirContenedor();
  };

  // ── escalar coordenadas base a tamaño renderizado ─────────────────────────
  const escalarX = (v: number) => contenedorW > 0 ? (v / PLANO_W) * contenedorW : 0;
  const escalarY = (v: number) => {
    if (!contenedorW) return 0;
    const hRendered = (PLANO_H / PLANO_W) * contenedorW;
    return (v / PLANO_H) * hRendered;
  };
  const alturaPlano = contenedorW > 0 ? (PLANO_H / PLANO_W) * contenedorW : 0;

  // ── navegar al ambiente ───────────────────────────────────────────────────
  // FIX: se hace merge de 'ambiente' sobre og_seleccion y push sin state.
  const irAAmbiente = (amb: PlanoAmbiente) => {
    if (cerrado) return;
    if (!cacheOk) return; // sin cache no se puede inspeccionar offline
    const actual = leerSeleccionOG() || ({} as NavState);
    sessionStorage.setItem('og_seleccion', JSON.stringify({
      ...actual,
      ambiente: {
        titulo:           amb.titulo,
        ambiente_cod:     amb.ambiente_cod,
        grupo_imagen:     amb.grupo_imagen,
        plano_version_id: depto?.plano_version_id,
      },
    }));
    history.push('/revision-og/ambiente');
  };

  // ── guard ─────────────────────────────────────────────────────────────────
  if (!proyecto || !torre || !depto) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
            <IonMenuButton slot="start" menu="menu-lateral"
              style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
            <IonTitle style={{ fontSize: 16 }}>Revisión OG</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg } as any}>
          <div style={{ padding: 32, textAlign: 'center', color: textSecondary, marginTop: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📐</div>
            Accede desde el selector de Revisión OG
          </div>
        </IonContent>
      </IonPage>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral"
            style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>📐 Seleccionar Ambiente</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16, paddingBottom: 40 }}>

          {/* Info depto */}
          <div style={{
            background: cardGrad, borderRadius: 16,
            border: `0.5px solid ${border}`, padding: '10px 14px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, color: textSecondary, marginBottom: 2 }}>
              {proyecto.nombre} · Torre {torre.nombre}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary }}>
              Depto {depto.numero}
              {depto.id_obra && (
                <span style={{ fontSize: 13, color: textMuted, fontWeight: 400 }}>
                  {' '}— {depto.id_obra}
                </span>
              )}
            </div>
            {depto.plano_version_id && (
              <div style={{ fontSize: 10, color: textMuted, marginTop: 2, letterSpacing: '0.5px' }}>
                {depto.plano_version_id}
              </div>
            )}
          </div>

          {/* Banner cerrado */}
          {cerrado && (
            <div style={{
              background: rojoBg, border: `0.5px solid ${rojoBord}`,
              borderRadius: 12, padding: '10px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>🔒</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: rojo }}>Departamento cerrado</div>
                <div style={{ fontSize: 11, color: textSecondary }}>Solo lectura</div>
              </div>
            </div>
          )}

          {/* FMS offline OG — banner sin red + sin cache */}
          {!online && !cacheOk && !cerrado && (
            <div style={{
              background: amarilloBg, border: `0.5px solid ${amarilloBord}`,
              borderRadius: 12, padding: '10px 14px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: amarillo }}>📶 Sin conexión y sin cache</div>
              <div style={{ fontSize: 12, color: textSecondary, marginTop: 3 }}>
                Los ambientes del plano no están disponibles offline. Conectate para descargar el cache primero.
              </div>
            </div>
          )}

          {/* FMS offline OG — banner sin red pero CON cache */}
          {!online && cacheOk && !cerrado && (
            <div style={{
              background: amarilloBg, border: `0.5px solid ${amarilloBord}`,
              borderRadius: 12, padding: '8px 14px', marginBottom: 12,
            }}>
              <span style={{ fontSize: 12, color: amarillo, fontWeight: 600 }}>
                📶 Sin red — si descargaste el modo offline verás el plano; si no, toca un ambiente abajo para inspeccionar
              </span>
            </div>
          )}

          {/* Instrucción */}
          {!cargando && planoUrl && (
            <div style={{
              fontSize: 12, color: textSecondary, textAlign: 'center',
              marginBottom: 10, letterSpacing: '0.3px',
            }}>
              Toca un ambiente en el plano para inspeccionarlo
            </div>
          )}

          {/* ── Plano con hotspots ──────────────────────────────── */}
          {cargando ? (
            <div style={{ textAlign: 'center', padding: 48, color: textMuted, fontSize: 13 }}>
              Cargando plano...
            </div>
          ) : !planoUrl ? (
            <>
              <div style={{
                background: cardGrad, borderRadius: 16,
                border: `0.5px solid ${border}`,
                padding: 32, textAlign: 'center', marginBottom: 12,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
                <div style={{ fontSize: 14, color: textSecondary }}>
                  {!online
                    ? 'Sin conexión — el plano no está disponible offline'
                    : 'Sin plano asignado para este tipo de departamento'
                  }
                </div>
                <div style={{ fontSize: 11, color: textMuted, marginTop: 4 }}>
                  {depto.plano_version_id || 'Sin plano_version_id'}
                </div>
              </div>

              {/* FMS offline OG — botones de texto por ambiente cuando no hay plano visual */}
              {!online && cacheOk && ambientes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
                    Ambientes disponibles
                  </div>
                  {ambientes.map(amb => (
                    <button
                      key={amb.id}
                      onClick={() => irAAmbiente(amb)}
                      disabled={cerrado}
                      style={{
                        padding: '12px 16px', borderRadius: 12, border: `0.5px solid ${border}`,
                        background: cardGrad, color: textPrimary, fontSize: 14, fontWeight: 600,
                        cursor: cerrado ? 'not-allowed' : 'pointer', textAlign: 'left',
                      }}
                    >
                      🏠 {amb.titulo}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div
              ref={contenedorRef}
              style={{
                position: 'relative',
                width: '100%',
                borderRadius: 16,
                overflow: 'hidden',
                border: `0.5px solid ${border}`,
                background: dark ? '#0a0a0a' : '#f8fafc',
                height: alturaPlano > 0 ? alturaPlano : 'auto',
                minHeight: alturaPlano > 0 ? undefined : 200,
              }}
            >
              <img
                src={planoUrl}
                alt="Plano departamento"
                onLoad={onImgLoad}
                style={{
                  width: '100%',
                  height: alturaPlano > 0 ? '100%' : 'auto',
                  objectFit: 'fill',
                  display: 'block',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              />

              {contenedorW > 0 && ambientes.map(amb => (
                <button
                  key={amb.id}
                  onClick={() => irAAmbiente(amb)}
                  style={{
                    position: 'absolute',
                    left:   escalarX(amb.pos_x_base),
                    top:    escalarY(amb.pos_y_base),
                    width:  escalarX(amb.ancho_base),
                    height: escalarY(amb.alto_base),
                    background: (cerrado || !cacheOk)
                      ? 'rgba(100,100,100,0.15)'
                      : 'rgba(30, 58, 95, 0.18)',
                    border: (cerrado || !cacheOk)
                      ? '1.5px solid rgba(100,100,100,0.3)'
                      : '1.5px solid rgba(37, 99, 235, 0.5)',
                    borderRadius: 6,
                    cursor: (cerrado || !cacheOk) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 2,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (!cerrado && cacheOk) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(37,99,235,0.35)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!cerrado && cacheOk) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'rgba(30, 58, 95, 0.18)';
                    }
                  }}
                >
                  <span style={{
                    fontSize: Math.max(8, escalarX(30) * 0.35),
                    fontWeight: 700,
                    color: (cerrado || !cacheOk) ? 'rgba(150,150,150,0.8)' : 'rgba(255,255,255,0.95)',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                    pointerEvents: 'none',
                    wordBreak: 'break-word',
                    maxWidth: '90%',
                  }}>
                    {amb.titulo}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!cargando && planoUrl && ambientes.length === 0 && (
            <div style={{
              marginTop: 10, fontSize: 12, color: textMuted,
              textAlign: 'center', fontStyle: 'italic',
            }}>
              Sin ambientes configurados para este plano
            </div>
          )}

        </div>
      </IonContent>
    </IonPage>
  );
};

export default RevisionOGDetalle;

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
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { useIonViewDidEnter, useIonViewWillEnter } from '@ionic/react';
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
  torre:    { id: string; nombre: string; frente?: string };
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
  const bg          = dark ? '#0B1220' : '#f0f4f8';
  const cardGrad    = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const border      = dark ? '#243550'  : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb'  : '#0f172a';
  const textMuted   = dark ? '#5D728F'  : '#94a3b8';
  const toolbar     = dark ? '#0E1728'  : '#1e3a5f';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const rojo        = dark ? '#f87171' : '#b91c1c';
  const rojoBg      = dark ? 'rgba(239,68,68,0.06)' : '#fef2f2';
  const rojoBord    = dark ? 'rgba(239,68,68,0.15)' : '#fecaca';
  const azul        = dark ? '#60a5fa' : '#1d4ed8';
  const azulBg      = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const azulBord    = dark ? 'rgba(96,165,250,0.2)'  : '#bfdbfe';
  const amarillo    = dark ? '#fbbf24' : '#a16207';   // ← FMS offline OG
  const amarilloBg  = dark ? 'rgba(251,191,36,0.06)' : '#fffbeb'; // ← FMS offline OG
  const amarilloBord = dark ? 'rgba(251,191,36,0.2)' : '#fde68a'; // ← FMS offline OG

  // ── selección (desde sessionStorage, re-hidratada en cada montaje) ─────────
  const sel = leerSeleccionOG();
  const proyecto = sel?.proyecto;
  const torre    = sel?.torre;
  const depto     = sel?.depto;

  // ── state ─────────────────────────────────────────────────────────────────
  const [planoUrl, setPlanoUrl]         = useState<string | null>(null);
  const [planoBlob, setPlanoBlob]       = useState<string | null>(null); // blob URL local (legacy)
  const [ambientes, setAmbientes]       = useState<PlanoAmbiente[]>([]);
  const [cargando, setCargando]         = useState(true);
  const [imgSize, setImgSize]           = useState<{ w: number; h: number } | null>(null);
  const [contenedorW, setContenedorW]   = useState(0);
  const [cacheOk]                       = useState(hayCacheOG()); // ← FMS offline OG

  // ── state — cerrado / admin / ambientes con obs ─────────────────────────────
  const [cerrado, setCerrado]                     = useState(false);
  const [cerrando, setCerrando]                   = useState(false);
  const [esAdmin, setEsAdmin]                     = useState(false);
  const [usuario, setUsuario]                     = useState<any>(null);
  const [ambientesConObs, setAmbientesConObs]     = useState<Set<string>>(new Set());

  // Se puede interactuar (seleccionar ambiente) si estamos online, o si estamos
  // offline pero con cache descargado. Solo se bloquea offline + sin cache.
  const puedeInteractuar = online || cacheOk;

  // Revocar blob URLs al desmontar para evitar memory leak.
  // Con IndexedDB (data: URLs) esto queda como no-op seguro: revokeObjectURL
  // sobre un data: URL no hace nada. Se mantiene por compatibilidad.
  useEffect(() => {
    return () => {
      if (planoBlob) URL.revokeObjectURL(planoBlob);
    };
  }, [planoBlob]);

  // ── medir contenedor — robusto para Android/Ionic ─────────────────────────
  // Mide el ancho real disponible. Prioriza la imagen interna (siempre tiene
  // ancho natural al cargar); si no, el contenedor o su padre. Reintenta con
  // requestAnimationFrame porque IonContent puede no tener layout al 1er intento.
  const medirContenedor = useCallback(() => {
    let intentos = 0;
    const intentar = () => {
      const el = contenedorRef.current;
      if (el) {
        // 1) ancho del contenedor
        let w = el.getBoundingClientRect().width || el.offsetWidth;
        // 2) si colapsó a 0, medir la imagen interna
        if (!w) {
          const img = el.querySelector('img');
          if (img) w = img.getBoundingClientRect().width || (img as HTMLImageElement).offsetWidth;
        }
        // 3) último recurso: el padre
        if (!w && el.parentElement) {
          w = el.parentElement.getBoundingClientRect().width;
        }
        if (w > 0) {
          setContenedorW(w);
          return;
        }
      }
      if (intentos < 15) {
        intentos++;
        requestAnimationFrame(intentar);
      }
    };
    requestAnimationFrame(intentar);
  }, []);

  // ── init ──────────────────────────────────────────────────────────────────
  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; inicializar(); }
  });

  // Refrescar ambientes con obs al volver de OGAmbiente
  useIonViewWillEnter(() => {
    if (mounted.current && depto) {
      cargarAmbientesConObs();
      cargarEstadoCerrado();
    }
  });

  const cargarAmbientesConObs = async () => {
    if (!depto || !online) return;
    const { data } = await supabase
      .from('og_registros')
      .select('ambiente')
      .eq('departamento_id', depto.id);
    const set = new Set<string>();
    (data || []).forEach((r: any) => { if (r.ambiente) set.add(r.ambiente); });
    setAmbientesConObs(set);
  };

  const cargarEstadoCerrado = async () => {
    if (!depto || !online) return;
    const { data } = await supabase
      .from('og_inspecciones_depto')
      .select('estado')
      .eq('departamento_id', depto.id)
      .maybeSingle();
    setCerrado(data?.estado === 'cerrado');
  };

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
        const src = await getImagenUrlDB(urlParaCargar);
        setPlanoUrl(src || urlParaCargar);  // Fallback a URL original si getImagenUrlDB devuelve null
        setPlanoBlob(null);
      }

      setTimeout(medirContenedor, 150);
    } finally {
      setCargando(false);
    }

    // Cargar usuario, estado cerrado, y ambientes con obs
    if (online) {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (email) {
        const { data: u } = await supabase
          .from('usuarios')
          .select('id, nombre, rol')
          .eq('email', email.toLowerCase())
          .maybeSingle();
        setUsuario(u);
        setEsAdmin(u?.rol === 'administrador');
      }
    }
    await cargarEstadoCerrado();
    await cargarAmbientesConObs();
  };

  // Conectar ResizeObserver cuando el contenedor del plano aparece en el DOM.
  // Depende de planoUrl y cargando: cuando el plano se renderiza, este efecto
  // vuelve a correr con contenedorRef.current ya montado.
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;

    medirContenedor();

    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width || el.offsetWidth;
      if (w > 0) setContenedorW(w);
    });
    ro.observe(el);

    window.addEventListener('resize', medirContenedor);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', medirContenedor);
    };
  }, [medirContenedor, planoUrl, cargando]);

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
    // Solo bloquear si estamos OFFLINE y sin cache. Online siempre puede navegar.
    if (!online && !cacheOk) return;
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

  // ── cerrar / reabrir depto ─────────────────────────────────────────────────
  const cerrarDepto = async () => {
    if (!depto || !proyecto || !torre || !usuario) return;
    const ok = window.confirm(`¿Cerrar el depto ${depto.numero}? No se podrán agregar más observaciones.`);
    if (!ok) return;
    setCerrando(true);
    try {
      await supabase.from('og_inspecciones_depto').upsert({
        proyecto_id:     proyecto.id,
        torre_id:        torre.id,
        departamento_id: depto.id,
        estado:          'cerrado',
        cerrado_por:     usuario.id,
        fecha_cierre:    new Date().toISOString(),
      }, { onConflict: 'proyecto_id,torre_id,departamento_id' });
      setCerrado(true);
    } finally {
      setCerrando(false);
    }
  };

  const reabrirDepto = async () => {
    if (!depto || !proyecto || !torre) return;
    setCerrando(true);
    try {
      await supabase.from('og_inspecciones_depto').upsert({
        proyecto_id:     proyecto.id,
        torre_id:        torre.id,
        departamento_id: depto.id,
        estado:          'abierto',
        cerrado_por:     null,
        fecha_cierre:    null,
      }, { onConflict: 'proyecto_id,torre_id,departamento_id' });
      setCerrado(false);
    } finally {
      setCerrando(false);
    }
  };

  const irAResumen = () => {
    if (!proyecto || !torre || !depto) return;
    sessionStorage.setItem('og_seleccion', JSON.stringify({
      proyecto, torre, depto,
    }));
    history.push('/revision-og/resumen');
  };

  // ── guard ─────────────────────────────────────────────────────────────────
  if (!proyecto || !torre || !depto) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
            <button slot="start" onClick={() => history.goBack()}
              style={{ background: 'transparent', border: 'none', color: dark ? '#6E86A6' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>
              ‹
            </button>
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
          <button slot="start" onClick={() => history.goBack()}
            style={{ background: 'transparent', border: 'none', color: dark ? '#6E86A6' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>
            ‹
          </button>
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
              {proyecto.nombre} · Torre {torre.nombre} · Depto {depto.numero}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary }}>
              {torre.frente || torre.nombre} · {depto.id_obra || depto.numero}
            </div>
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

          {/* Leyenda ambientes + Botones */}
          {!cargando && (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10, justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, border: '2px solid rgba(37,99,235,0.5)', background: 'rgba(30,58,95,0.18)' }} />
                  <span style={{ fontSize: 11, color: textSecondary }}>Sin revisar</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, border: '2px solid rgba(74,222,128,0.7)', background: 'rgba(74,222,128,0.25)' }} />
                  <span style={{ fontSize: 11, color: textSecondary }}>Con obs ({ambientesConObs.size})</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={irAResumen}
                  disabled={ambientesConObs.size === 0}
                  style={{
                    height: 42, borderRadius: 12,
                    border: `0.5px solid ${ambientesConObs.size > 0 ? (dark ? 'rgba(30,58,95,0.5)' : '#bfdbfe') : border}`,
                    background: ambientesConObs.size > 0 ? azulBg : 'transparent',
                    color: ambientesConObs.size > 0 ? azul : textMuted,
                    fontSize: 13, fontWeight: 600,
                    cursor: ambientesConObs.size > 0 ? 'pointer' : 'not-allowed',
                  }}
                >
                  📊 Resumen
                </button>

                {esAdmin && !cerrado && (
                  <button
                    onClick={cerrarDepto}
                    disabled={cerrando}
                    style={{
                      height: 42, borderRadius: 12,
                      border: `0.5px solid ${rojoBord}`, background: rojoBg,
                      color: rojo, fontSize: 13, fontWeight: 600,
                      cursor: cerrando ? 'not-allowed' : 'pointer', opacity: cerrando ? 0.6 : 1,
                    }}
                  >
                    {cerrando ? 'Procesando...' : '🔒 Cerrar depto'}
                  </button>
                )}

                {esAdmin && cerrado && (
                  <button
                    onClick={reabrirDepto}
                    disabled={cerrando}
                    style={{
                      height: 42, borderRadius: 12,
                      border: `0.5px solid ${border}`, background: 'transparent',
                      color: textSecondary, fontSize: 13, fontWeight: 600,
                      cursor: cerrando ? 'not-allowed' : 'pointer',
                    }}
                  >
                    🔓 Reabrir
                  </button>
                )}
              </div>
            </>
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

              {contenedorW > 0 && ambientes.map(amb => {
                const tieneObs = ambientesConObs.has(amb.titulo);
                return (
                <button
                  key={amb.id}
                  onClick={() => irAAmbiente(amb)}
                  style={{
                    position: 'absolute',
                    left:   escalarX(amb.pos_x_base),
                    top:    escalarY(amb.pos_y_base),
                    width:  escalarX(amb.ancho_base),
                    height: escalarY(amb.alto_base),
                    background: (cerrado || !puedeInteractuar)
                      ? 'rgba(100,100,100,0.15)'
                      : tieneObs
                        ? 'rgba(74,222,128,0.25)'
                        : 'rgba(30, 58, 95, 0.18)',
                    border: (cerrado || !puedeInteractuar)
                      ? '1.5px solid rgba(100,100,100,0.3)'
                      : tieneObs
                        ? '2px solid rgba(74,222,128,0.7)'
                        : '1.5px solid rgba(37, 99, 235, 0.5)',
                    borderRadius: 6,
                    cursor: (cerrado || !puedeInteractuar) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 2,
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{
                    fontSize: Math.max(8, escalarX(30) * 0.35),
                    fontWeight: 700,
                    color: (cerrado || !puedeInteractuar) ? 'rgba(150,150,150,0.8)' : 'rgba(255,255,255,0.95)',
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
                );
              })}
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
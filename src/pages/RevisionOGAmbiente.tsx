// src/pages/RevisionOGAmbiente.tsx
// Módulo Revisión Tolerancias OG — Pantalla 3: Inspección de ambiente
// Imagen del ambiente con hotspots, selección de elemento, registro de fallas.
// FMS · Junio 2026
// Offline: tolerancias desde ogCache, guardado encola en ogOfflineQueue si sin red
//
// FIX (jul 2026 · navegación OG): la selección (proyecto/torre/depto/cerrado/ambiente)
//   ya NO llega por location.state (se perdía al volver atrás → blanco / dashboard).
//   Se lee desde sessionStorage ('og_seleccion'), que dejan seteada RevisionOG
//   (proyecto/torre/depto) y RevisionOGDetalle (merge de 'ambiente').

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';
import { getToleranciaCache, getImagenAmbienteCache, getElementosAmbienteCache } from '../utils/Ogcache';          // ← FMS offline OG
import { getImagenUrlDB } from '../utils/ogImageDB';                                                                // ← FMS offline OG (imágenes IndexedDB)
import { encolarRegistroOG, blobABase64 } from '../utils/Ogofflinequeue'; // ← FMS offline OG
import { useOffline }                   from '../Context/OfflineContext';  // ← FMS offline OG
import { comprimirImagen }              from '../utils/comprimirImagen';   // ← FMS offline OG

// ── Interfaces ────────────────────────────────────────────────────────────────

interface NavState {
  proyecto:  { id: string; nombre: string };
  torre:     { id: string; nombre: string };
  depto:     { id: string; numero: string; id_obra?: string; plano_version_id?: string; tipo_depto?: string };
  cerrado:   boolean;
  ambiente:  {
    titulo:           string;
    ambiente_cod:     string;
    grupo_imagen:     string | null;
    plano_version_id: string;
  };
}

interface ImagenAmbiente {
  imagen_url: string;
  ancho_orig: number;
  alto_orig:  number;
}

interface Elemento {
  id:            string;
  elemento:      string;
  tipo_elemento: string;
  subtipo_cod:   string | null;
  pos_x:         number;
  pos_y:         number;
  ancho:         number;
  alto:          number;
}

// ── Selección OG persistida (reemplaza a location.state) ─────────────────────
const leerSeleccionOG = (): NavState | null => {
  try { return JSON.parse(sessionStorage.getItem('og_seleccion') || 'null'); }
  catch { return null; }
};

// ── Tab / tipos de revisión ───────────────────────────────────────────────────
const TABS = ['Muros', 'Vanos'] as const;
type Tab = typeof TABS[number];

const TIPOS_POR_TAB: Record<Tab, { label: string; revision: string; item: string }[]> = {
  Muros: [
    { label: 'Planeidad', revision: 'MURO',   item: 'PLANEIDAD' },
    { label: 'Cornisa',   revision: 'MURO',   item: 'CORNISA'   },
    { label: 'Otros',     revision: 'MURO',   item: 'OTROS'     },
  ],
  Vanos: [
    { label: 'Plomo', revision: 'VANO', item: 'PLOMO' },
    { label: 'Ancho', revision: 'VANO', item: 'ANCHO' },
    { label: 'Losa',  revision: 'VANO', item: 'LOSA'  },
  ],
};

const getRevisionReal = (
  elemento: string,
  tabActivo: Tab,
  tipoRevision: string
): string => {
  if (elemento.toUpperCase().startsWith('PIERNA')) return 'PIERNA';
  if (tabActivo === 'Muros') return 'MURO';
  return tipoRevision;
};

// ── Componente ────────────────────────────────────────────────────────────────

const RevisionOGAmbiente: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const lastGrupo = useRef<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null); // ← FMS: ref estable para input foto
  const { online } = useOffline(); // ← FMS offline OG

  // ── tokens ──────────────────────────────────────────────────────────────────
  const bg            = dark ? '#000000' : '#f0f4f8';
  const cardGrad      = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb'  : '#0f172a';
  const textMuted     = dark ? '#444444'  : '#94a3b8';
  const toolbar       = dark ? '#000000'  : '#1e3a5f';
  const textSecondary = dark ? '#6b7280'  : '#64748b';
  const inputBg       = dark ? '#111111'  : '#ffffff';
  const inputBorder   = dark ? '#1e1e1e'  : '#cbd5e1';
  const rojo          = dark ? '#f87171'  : '#b91c1c';
  const rojoBg        = dark ? 'rgba(239,68,68,0.06)' : '#fef2f2';
  const rojoBord      = dark ? 'rgba(239,68,68,0.15)' : '#fecaca';
  const azul          = dark ? '#60a5fa'  : '#1d4ed8';
  const azulBg        = dark ? 'rgba(96,165,250,0.08)' : '#eff6ff';
  const azulBord      = dark ? 'rgba(96,165,250,0.2)'  : '#bfdbfe';
  const verde         = dark ? '#4ade80'  : '#15803d';
  const verdeBg       = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord     = dark ? 'rgba(74,222,128,0.2)'  : '#bbf7d0';
  const amarillo      = dark ? '#fbbf24'  : '#a16207'; // ← FMS
  const amarilloBg    = dark ? 'rgba(251,191,36,0.06)' : '#fffbeb'; // ← FMS
  const amarilloBord  = dark ? 'rgba(251,191,36,0.2)'  : '#fde68a'; // ← FMS

  // ── selección (desde sessionStorage, re-hidratada en cada montaje) ───────────
  const sel = leerSeleccionOG();
  const proyecto = sel?.proyecto;
  const torre    = sel?.torre;
  const depto    = sel?.depto;
  const cerrado  = sel?.cerrado ?? false;
  const ambiente = sel?.ambiente;

  const grupoImagenCompleto = ambiente?.grupo_imagen ?? null;

  // ── state — imagen + elementos ───────────────────────────────────────────────
  const [imagen, setImagen]           = useState<ImagenAmbiente | null>(null);
  const [imagenBlobUrl, setImagenBlobUrl] = useState<string | null>(null); // ← blob URL local (legacy)
  const [elementos, setElementos]     = useState<Elemento[]>([]);
  const [cargando, setCargando]       = useState(true);
  const [contenedorW, setContenedorW] = useState(0);

  // Revocar blob URL al desmontar.
  // Con IndexedDB (data: URLs) queda como no-op seguro. Se mantiene por compatibilidad.
  useEffect(() => {
    return () => { if (imagenBlobUrl) URL.revokeObjectURL(imagenBlobUrl); };
  }, [imagenBlobUrl]);

  // ── state — selección ────────────────────────────────────────────────────────
  const [elSel, setElSel]             = useState<Elemento | null>(null);
  const [tabActivo, setTabActivo]     = useState<Tab>('Muros');
  const [tipoSel, setTipoSel]         = useState<typeof TIPOS_POR_TAB[Tab][number] | null>(null);
  const [tolerancias, setTolerancia]  = useState<string[]>([]);
  const [tolSel, setTolSel]           = useState<string>('');
  const [cargandoTols, setCargandoTols] = useState(false);

  // ── state — registro ─────────────────────────────────────────────────────────
  const [comentario, setComentario]   = useState('');
  const [fotoPreview, setFotoPreview] = useState<string | null>(null); // ← FMS: preview local
  const [fotoBlob, setFotoBlob]       = useState<Blob | null>(null);   // ← FMS: blob comprimido
  const [guardando, setGuardando]     = useState(false);
  const [status, setStatus]           = useState<{ msg: string; ok: boolean } | null>(null);

  // ── medir contenedor ─────────────────────────────────────────────────────────
  const medirContenedor = useCallback(() => {
    if (!contenedorRef.current) return;
    const w = contenedorRef.current.offsetWidth;
    if (w > 0) {
      setContenedorW(w);
    } else {
      setTimeout(() => {
        if (contenedorRef.current)
          setContenedorW(contenedorRef.current.offsetWidth);
      }, 100);
    }
  }, []);

  // ── init ─────────────────────────────────────────────────────────────────────
  useIonViewDidEnter(() => {
    if (grupoImagenCompleto && grupoImagenCompleto !== lastGrupo.current) {
      lastGrupo.current = grupoImagenCompleto;
      inicializar();
    }
    // getSession() lee del localStorage — no requiere red, funciona offline
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) userIdRef.current = session.user.id;
    });
  });

  const inicializar = async () => {
    if (!grupoImagenCompleto) { setCargando(false); return; }
    setCargando(true);
    setImagen(null);
    setElementos([]);
    resetSeleccion();
    try {
      let imgData: ImagenAmbiente | null = null;

      if (online) {
        const { data: img } = await supabase
          .from('og_imagenes_ambiente')
          .select('imagen_url, ancho_orig, alto_orig')
          .eq('grupo_imagen', grupoImagenCompleto)
          .eq('activo', true)
          .maybeSingle();
        if (img) imgData = img;

        const { data: els } = await supabase
          .from('og_elementos_ambiente')
          .select('id, elemento, tipo_elemento, subtipo_cod, pos_x, pos_y, ancho, alto')
          .eq('grupo_imagen', grupoImagenCompleto)
          .eq('activo', true)
          .order('tipo_elemento');
        setElementos(els || []);
      } else {
        imgData = getImagenAmbienteCache(grupoImagenCompleto);
        setElementos(getElementosAmbienteCache(grupoImagenCompleto));
      }

      if (imgData) {
        // Servir desde IndexedDB si está descargada (offline); si no, URL original (online)
        const src = await getImagenUrlDB(imgData.imagen_url);
        setImagen({ ...imgData, imagen_url: src });
        setImagenBlobUrl(null); // data: URLs no requieren revoke
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

  // ── reset helpers ─────────────────────────────────────────────────────────────
  const resetSeleccion = () => {
    setElSel(null);
    setTipoSel(null);
    setTolerancia([]);
    setTolSel('');
    setComentario('');
    limpiarFoto();
    setStatus(null);
  };

  const resetRegistro = () => {
    setTolSel('');
    setComentario('');
    limpiarFoto();
  };

  // ← FMS: limpiar foto correctamente (revocar objectURL para evitar memory leak)
  const limpiarFoto = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoPreview(null);
    setFotoBlob(null);
    if (fotoInputRef.current) fotoInputRef.current.value = '';
  };

  // ── al tocar elemento en el plano ────────────────────────────────────────────
  const onElementoClick = (el: Elemento) => {
    if (cerrado) return;
    if (elSel?.id === el.id) {
      resetSeleccion();
      return;
    }
    setElSel(el);
    setTipoSel(null);
    setTolerancia([]);
    setTolSel('');
    setComentario('');
    limpiarFoto();
    setStatus(null);

    if (el.tipo_elemento === 'Muros') setTabActivo('Muros');
    else setTabActivo('Vanos');
  };

  // ── al tocar tipo de revisión ─────────────────────────────────────────────────
  // FMS offline OG: lee del cache local primero; si no hay resultado cae a Supabase (online).
  const onTipoClick = async (tipo: typeof TIPOS_POR_TAB[Tab][number]) => {
    if (!elSel || !ambiente) return;
    setTipoSel(tipo);
    setTolSel('');
    setStatus(null);
    setCargandoTols(true);
    try {
      const revisionReal = getRevisionReal(elSel.elemento, tabActivo, tipo.revision);

      // 1. Intentar desde cache local (disponible online y offline)
      const fromCache = getToleranciaCache({
        revision:     revisionReal,
        itemRevision: tipo.item,
        elemento:     elSel.elemento,
        ambiente:     ambiente.titulo,
      });

      console.log(`[OGAmb] getToleranciaCache — revision="${revisionReal}" item="${tipo.item}" elemento="${elSel.elemento}" ambiente="${ambiente.titulo}" → ${fromCache.length} resultados`);

      if (fromCache.length > 0) {
        setTolerancia(fromCache.map(r => r.tolerancia).filter(Boolean));
        return;
      }

      // 2. Fallback a Supabase si hay red y el cache no tenía resultado
      //    (puede pasar si el cache tiene < 24h pero el catálogo fue actualizado)
      if (online) {
        const { data } = await supabase
          .from('og_catalogo')
          .select('tolerancia')
          .eq('elemento', elSel.elemento)
          .eq('revision', revisionReal)
          .eq('item_revision', tipo.item)
          .eq('ambiente', ambiente.titulo)
          .eq('activo', true);
        setTolerancia((data || []).map((d: any) => d.tolerancia).filter(Boolean));
      } else {
        // Sin red y sin cache → lista vacía con mensaje claro
        setTolerancia([]);
      }
    } finally {
      setCargandoTols(false);
    }
  };

  // ── selección de foto ─────────────────────────────────────────────────────────
  // FMS offline OG: comprime inmediatamente con comprimirImagen, guarda el Blob.
  // El preview es local (objectURL). La subida a Storage se hace en guardarObservacion.
  const onFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Preview inmediato
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoPreview(URL.createObjectURL(file));
    // Comprimir en background
    const blob = await comprimirImagen(file);
    setFotoBlob(blob);
  };

  // ── guardar observación ───────────────────────────────────────────────────────
  // FMS offline OG:
  //   ONLINE  → sube foto a Storage (bucket fotos-registros) + INSERT directo en og_registros
  //   OFFLINE → convierte foto a base64 + encola en ogOfflineQueue (flush al reconectarse)
  const guardarObservacion = async () => {
    if (!elSel || !tipoSel || !tolSel || !proyecto || !torre || !depto || !ambiente) return;
    setGuardando(true);
    setStatus(null);
    try {
      const revisionReal = getRevisionReal(elSel.elemento, tabActivo, tipoSel.revision);

      if (!online) {
        // ── MODO OFFLINE ────────────────────────────────────────────────────
        let foto_base64: string | null = null;
        if (fotoBlob) {
          foto_base64 = await blobABase64(fotoBlob);
        }

        // getSession() lee del localStorage — no requiere red, funciona offline
        const userId = userIdRef.current ||
          (await supabase.auth.getSession()).data.session?.user?.id || '';

        encolarRegistroOG({
          proyecto_id:      proyecto.id,
          torre_id:         torre.id,
          departamento_id:  depto.id,
          tipo_depto:       depto.tipo_depto ?? '',
          plano_version_id: ambiente.plano_version_id,
          ambiente:         ambiente.titulo,
          tipo_elemento:    elSel.tipo_elemento,
          tipo_revision:    revisionReal,
          subtipo_cod:      tipoSel.item,
          elemento:         elSel.elemento,
          tolerancia:       tolSel,
          comentario:       comentario || '',
          foto_url:         null,
          foto_base64,
          usuario_id:       userId,
          sesion_id:        `${depto.id}_${ambiente.ambiente_cod}_${Date.now()}`,
        });

        setStatus({ msg: '✓ Guardado offline — se sincronizará al reconectarte', ok: true });
        resetRegistro();
        return;
      }

      // ── MODO ONLINE ─────────────────────────────────────────────────────────
      let foto_url: string | null = null;

      if (fotoBlob) {
        const path = `og/${depto.id}/${ambiente.ambiente_cod}_${Date.now()}.jpg`;
        const { error: storageErr } = await supabase.storage
          .from('fotos-registros')
          .upload(path, fotoBlob, { contentType: 'image/jpeg', upsert: false });
        if (!storageErr) {
          const { data: { publicUrl } } = supabase.storage
            .from('fotos-registros')
            .getPublicUrl(path);
          foto_url = publicUrl;
        }
      }

      const { error } = await supabase.from('og_registros').insert({
        proyecto_id:      proyecto.id,
        torre_id:         torre.id,
        departamento_id:  depto.id,
        tipo_depto:       depto.tipo_depto ?? null,
        plano_version_id: ambiente.plano_version_id,
        ambiente:         ambiente.titulo,
        tipo_elemento:    elSel.tipo_elemento,
        tipo_revision:    revisionReal,
        subtipo_cod:      tipoSel.item,
        elemento:         elSel.elemento,
        tolerancia:       tolSel,
        comentario:       comentario || null,
        foto_url,
        usuario_id:       userIdRef.current,
        sesion_id:        `${depto.id}_${ambiente.ambiente_cod}_${Date.now()}`,
      });
      if (error) throw error;

      setStatus({ msg: '✓ Observación registrada', ok: true });
      resetRegistro();
    } catch (e: any) {
      setStatus({ msg: 'Error: ' + (e.message || 'desconocido'), ok: false });
    } finally {
      setGuardando(false);
    }
  };

  // ── escalado ──────────────────────────────────────────────────────────────────
  const alturaImagen = imagen && contenedorW > 0
    ? (imagen.alto_orig / imagen.ancho_orig) * contenedorW
    : 0;

  const escalar = (v: number, orig: number, rendered: number) =>
    orig > 0 ? (v / orig) * rendered : 0;

  // ── color hotspot ─────────────────────────────────────────────────────────────
  const colorHotspot = (el: Elemento) => {
    const sel = elSel?.id === el.id;
    if (sel) return { bg: 'rgba(245,158,11,0.35)', border: 'rgba(245,158,11,0.9)' };
    switch (el.tipo_elemento) {
      case 'Muros': return { bg: 'rgba(37,99,235,0.18)',  border: 'rgba(37,99,235,0.7)'  };
      case 'Vanos': return { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.7)' };
      case 'Losas': return { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.7)' };
      default:      return { bg: 'rgba(100,100,100,0.18)',border: 'rgba(100,100,100,0.5)'};
    }
  };

  // ── guard ─────────────────────────────────────────────────────────────────────
  if (!proyecto || !torre || !depto || !ambiente) {
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
            Accede desde el selector de ambiente
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const puedeGuardar = !!elSel && !!tipoSel && !!tolSel && !guardando;
  const tipos = TIPOS_POR_TAB[tabActivo];

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral"
            style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>
            📐 {ambiente.titulo}
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16, paddingBottom: 60 }}>

          {/* Info depto */}
          <div style={{
            background: cardGrad, borderRadius: 16,
            border: `0.5px solid ${border}`, padding: '10px 14px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, color: textSecondary, marginBottom: 2 }}>
              {proyecto.nombre} · Torre {torre.nombre} · Depto {depto.numero}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary }}>
              {ambiente.titulo}
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

          {/* FMS offline OG — banner modo offline */}
          {!online && (
            <div style={{
              background: amarilloBg, border: `0.5px solid ${amarilloBord}`,
              borderRadius: 12, padding: '8px 14px', marginBottom: 12,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: amarillo }}>📶 Sin conexión</span>
              <div style={{ fontSize: 12, color: textSecondary, marginTop: 3 }}>
                Las observaciones se guardarán localmente y se sincronizarán al reconectarte.
                {!imagen && ' El plano no está disponible offline.'}
              </div>
            </div>
          )}

          {/* ── Plano con hotspots ─────────────────────────────────────────── */}
          {cargando ? (
            <div style={{ textAlign: 'center', padding: 48, color: textMuted, fontSize: 13 }}>
              Cargando ambiente...
            </div>
          ) : !imagen ? (
            <div style={{
              background: cardGrad, borderRadius: 16,
              border: `0.5px solid ${border}`, padding: 32, textAlign: 'center',
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
              <div style={{ fontSize: 14, color: textSecondary }}>
                {!online ? 'Plano no disponible offline' : 'Sin imagen configurada'}
              </div>
              <div style={{ fontSize: 11, color: textMuted, marginTop: 4 }}>{grupoImagenCompleto}</div>
            </div>
          ) : (
            <div
              ref={contenedorRef}
              style={{
                position: 'relative', width: '100%', borderRadius: 16,
                overflow: 'hidden', border: `0.5px solid ${border}`,
                background: dark ? '#0a0a0a' : '#f8fafc',
                height: alturaImagen > 0 ? alturaImagen : 'auto',
                minHeight: alturaImagen > 0 ? undefined : 200,
              }}
            >
              <img
                src={imagen.imagen_url}
                alt={ambiente.titulo}
                onLoad={medirContenedor}
                style={{
                  width: '100%',
                  height: alturaImagen > 0 ? '100%' : 'auto',
                  objectFit: 'fill', display: 'block',
                  userSelect: 'none', WebkitUserSelect: 'none',
                }}
              />

              {contenedorW > 0 && elementos
                .filter(el => {
                  if (tabActivo === 'Muros') return el.tipo_elemento === 'Muros';
                  if (tabActivo === 'Vanos') return el.tipo_elemento === 'Vanos' || el.tipo_elemento === 'Losas' || el.tipo_elemento === 'Piernas';
                  return true;
                })
                .map(el => {
                  const col = colorHotspot(el);
                  const isSel = elSel?.id === el.id;
                  return (
                    <button
                      key={el.id}
                      onClick={() => onElementoClick(el)}
                      title={el.elemento}
                      style={{
                        position: 'absolute',
                        left:   escalar(el.pos_x,  imagen.ancho_orig, contenedorW),
                        top:    escalar(el.pos_y,  imagen.alto_orig,  alturaImagen),
                        width:  escalar(el.ancho,  imagen.ancho_orig, contenedorW),
                        height: escalar(el.alto,   imagen.alto_orig,  alturaImagen),
                        background: col.bg,
                        border: `${isSel ? 2 : 1.5}px solid ${col.border}`,
                        borderRadius: 4, cursor: cerrado ? 'default' : 'pointer',
                        padding: 0, boxSizing: 'border-box',
                        transition: 'all 0.15s',
                      }}
                    />
                  );
                })}
            </div>
          )}

          {/* Leyenda */}
          {!cargando && imagen && (
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { tipo: 'Muros', col: 'rgba(37,99,235,0.7)'   },
                { tipo: 'Vanos', col: 'rgba(245,158,11,0.7)'  },
                { tipo: 'Losas', col: 'rgba(16,185,129,0.7)'  },
              ].map(({ tipo, col }) => {
                const count = elementos.filter(e => e.tipo_elemento === tipo).length;
                if (!count) return null;
                return (
                  <div key={tipo} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, border: `2px solid ${col}`, background: col.replace('0.7', '0.18') }} />
                    <span style={{ fontSize: 11, color: textSecondary }}>{tipo} ({count})</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Panel de registro ────────────────────────────────────────────── */}
          {elSel && (
            <div style={{
              marginTop: 14, background: cardGrad, borderRadius: 16,
              border: `0.5px solid ${azulBord}`, overflow: 'hidden',
            }}>

              {/* Elemento seleccionado */}
              <div style={{
                padding: '10px 14px', background: azulBg,
                borderBottom: `0.5px solid ${azulBord}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 10, color: azul, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>
                    Elemento seleccionado
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary, marginTop: 2 }}>
                    {elSel.elemento}
                  </div>
                </div>
                <button
                  onClick={resetSeleccion}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: textMuted, padding: 4 }}
                >✕</button>
              </div>

              <div style={{ padding: '12px 14px' }}>

                {/* Tabs Muros / Vanos */}
                <div style={{
                  display: 'flex', gap: 0, marginBottom: 12,
                  background: dark ? '#0a0a0a' : '#f1f5f9',
                  borderRadius: 10, padding: 3,
                }}>
                  {TABS.map(tab => (
                    <button
                      key={tab}
                      onClick={() => {
                        setTabActivo(tab);
                        setTipoSel(null);
                        setTolerancia([]);
                        setTolSel('');
                      }}
                      style={{
                        flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        background: tabActivo === tab ? '#1e3a5f' : 'transparent',
                        color: tabActivo === tab ? '#ffffff' : textMuted,
                        transition: 'all 0.15s',
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Botones tipo revisión */}
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: '1px', marginBottom: 6, fontWeight: 600 }}>
                  TIPO DE REVISIÓN
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {tipos.map(tipo => {
                    const activo = tipoSel?.item === tipo.item && tipoSel?.revision === tipo.revision;
                    return (
                      <button
                        key={`${tipo.revision}_${tipo.item}`}
                        onClick={() => onTipoClick(tipo)}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          border: `1px solid ${activo ? azul : inputBorder}`,
                          background: activo ? azulBg : 'transparent',
                          color: activo ? azul : textSecondary,
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {tipo.label}
                      </button>
                    );
                  })}
                </div>

                {/* Dropdown tolerancias */}
                {tipoSel && (
                  <>
                    <div style={{ fontSize: 10, color: textMuted, letterSpacing: '1px', marginBottom: 6, fontWeight: 600 }}>
                      FALLA / TOLERANCIA
                    </div>
                    {cargandoTols ? (
                      <div style={{ fontSize: 12, color: textMuted, marginBottom: 12 }}>Cargando...</div>
                    ) : tolerancias.length === 0 ? (
                      <div style={{ fontSize: 12, color: textMuted, marginBottom: 12, fontStyle: 'italic' }}>
                        {!online
                          ? 'Sin red y sin resultado en cache para este elemento/tipo'
                          : 'Sin tolerancias para este elemento/tipo'
                        }
                      </div>
                    ) : (
                      <select
                        value={tolSel}
                        onChange={e => setTolSel(e.target.value)}
                        style={{
                          width: '100%', boxSizing: 'border-box', marginBottom: 12,
                          border: `0.5px solid ${tolSel ? azul : inputBorder}`,
                          borderRadius: 10, padding: '10px 12px', fontSize: 14,
                          background: inputBg, color: tolSel ? textPrimary : textMuted,
                          outline: 'none', height: 44,
                        }}
                      >
                        <option value="">— Selecciona tolerancia —</option>
                        {tolerancias.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    )}
                  </>
                )}

                {/* Comentario */}
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: '1px', marginBottom: 6, fontWeight: 600 }}>
                  COMENTARIO <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
                </div>
                <textarea
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  placeholder="Agrega un comentario..."
                  rows={2}
                  style={{
                    width: '100%', boxSizing: 'border-box', marginBottom: 12,
                    border: `0.5px solid ${inputBorder}`, borderRadius: 10,
                    padding: '10px 12px', fontSize: 13,
                    background: inputBg, color: textPrimary,
                    outline: 'none', resize: 'none', fontFamily: 'inherit',
                  }}
                />

                {/* Foto — FMS: usa ref estable + comprimirImagen + preview local */}
                <div style={{ fontSize: 10, color: textMuted, letterSpacing: '1px', marginBottom: 6, fontWeight: 600 }}>
                  FOTO <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `0.5px solid ${inputBorder}`, background: inputBg,
                    fontSize: 13, color: textSecondary, flex: 1, justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 20 }}>📷</span>
                    {fotoPreview ? 'Cambiar foto' : 'Tomar / Subir foto'}
                    <input
                      ref={fotoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={onFotoChange}
                    />
                  </label>
                  {fotoPreview && (
                    <div style={{ position: 'relative' }}>
                      <img
                        src={fotoPreview}
                        alt="foto"
                        style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: `0.5px solid ${border}` }}
                      />
                      <button
                        onClick={limpiarFoto}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 18, height: 18, borderRadius: '50%',
                          background: rojo, border: 'none', color: '#fff',
                          fontSize: 10, cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >✕</button>
                    </div>
                  )}
                </div>

                {/* Status */}
                {status && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                    fontSize: 13, fontWeight: 600,
                    background: status.ok ? verdeBg : rojoBg,
                    border: `0.5px solid ${status.ok ? verdeBord : rojoBord}`,
                    color: status.ok ? verde : rojo,
                  }}>
                    {status.msg}
                  </div>
                )}

                {/* Botón guardar */}
                <button
                  onClick={guardarObservacion}
                  disabled={!puedeGuardar}
                  style={{
                    width: '100%', height: 48, borderRadius: 12,
                    border: 'none', fontSize: 15, fontWeight: 700,
                    // FMS: color distinto en modo offline para feedback visual
                    background: !puedeGuardar
                      ? (dark ? '#111' : '#e2e8f0')
                      : online
                        ? '#1e3a5f'
                        : '#92400e', // naranja oscuro = modo offline
                    color: puedeGuardar ? '#ffffff' : textMuted,
                    cursor: puedeGuardar ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s',
                  }}
                >
                  {guardando
                    ? 'Guardando...'
                    : online
                      ? '💾 Registrar Observación'
                      : '💾 Guardar offline'
                  }
                </button>

              </div>
            </div>
          )}

          {/* Instrucción si no hay elemento seleccionado */}
          {!cargando && !elSel && (
            <div style={{
              marginTop: 12, fontSize: 12, color: textMuted,
              textAlign: 'center', fontStyle: 'italic',
            }}>
              {imagen
                ? 'Toca un elemento en el plano para registrar una observación'
                : !online
                  ? 'Sin conexión — el plano visual no está disponible'
                  : 'Sin imagen configurada para este ambiente'
              }
            </div>
          )}

        </div>
      </IonContent>
    </IonPage>
  );
};

export default RevisionOGAmbiente;

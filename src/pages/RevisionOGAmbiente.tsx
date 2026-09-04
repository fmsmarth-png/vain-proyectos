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
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { useIonViewDidEnter, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';
import { getToleranciaCache, getImagenAmbienteCache, getElementosAmbienteCache, getReparacionCache } from '../utils/Ogcache';          // ← FMS offline OG
import { getImagenUrlDB } from '../utils/ogImageDB';                                                                // ← FMS offline OG (imágenes IndexedDB)
import { encolarRegistroOG } from '../utils/Ogofflinequeue'; // ← FMS offline OG
import { useOffline }                   from '../Context/OfflineContext';  // ← FMS offline OG
import { comprimirImagen }              from '../utils/comprimirImagen';   // ← FMS offline OG
import { Ruler, Lock, WifiOff, ImageOff, Camera, Save, Check, X } from 'lucide-react';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface NavState {
  proyecto:  { id: string; nombre: string };
  torre:     { id: string; nombre: string; frente?: string };
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

// Tipo de revisión que se preselecciona solo al tocar un elemento, según su
// nombre/categoría — así no hay que elegirlo a mano cada vez:
//   Muro           → Planeidad
//   Pierna (nombre empieza con "PIERNA") → Plomo
//   Vano (el vano en sí, no una pierna)  → Ancho
const tipoPorDefecto = (
  tabActivo: Tab,
  elemento: string,
): typeof TIPOS_POR_TAB[Tab][number] => {
  if (tabActivo === 'Muros') return TIPOS_POR_TAB.Muros[0]; // Planeidad
  const esPierna = elemento.toUpperCase().startsWith('PIERNA');
  return TIPOS_POR_TAB.Vanos.find(t => t.label === (esPierna ? 'Plomo' : 'Ancho'))!;
};

// ── Componente ────────────────────────────────────────────────────────────────

const RevisionOGAmbiente: React.FC = () => {
  const { theme, palette: p } = useTheme();
  const dark = theme === 'dark';
  const history = useHistory();
  const lastGrupo = useRef<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null); // ← FMS: ref estable para input foto
  const { online } = useOffline(); // ← FMS offline OG

  // ── volver a la selección de ambiente (RevisionOGDetalle) ──────────────────
  // El depto sigue seteado en sessionStorage['og_seleccion'], así que Detalle
  // lo re-hidrata solo. No hace falta pasar nada por state.
  const volverADetalle = () => {
    history.goBack();
  };

  // ── tokens ──────────────────────────────────────────────────────────────────
  const bg            = p.bg;
  const cardGrad      = p.card;
  const border        = p.line;
  const textPrimary   = p.textPrimary;
  const textMuted     = p.textMuted;
  const toolbar       = dark ? p.panel : '#1e3a5f';
  const textSecondary = p.textSecondary;
  const inputBg       = p.card2;
  const inputBorder   = p.lineSoft;
  const rojo          = p.kpiRed;
  const rojoBg        = dark ? 'rgba(239,68,68,0.06)' : '#fef2f2';
  const rojoBord      = dark ? 'rgba(239,68,68,0.15)' : '#fecaca';
  const azul          = p.kpiBlue;
  const azulBg        = dark ? 'rgba(59,130,246,0.08)' : '#eff6ff';
  const azulBord      = dark ? 'rgba(59,130,246,0.2)'  : '#bfdbfe';
  const verde         = p.kpiGreen;
  const verdeBg       = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord     = dark ? 'rgba(74,222,128,0.2)'  : '#bbf7d0';
  const amarillo      = p.kpiAmber; // ← FMS
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
  // Código corto (PI/PU/C/Y...) por cada tolerancia del dropdown actual —
  // se muestra al tomar la observación, para reconocer la reparación en
  // terreno sin tener que leer el texto completo de la acción.
  const [codigosTol, setCodigosTol] = useState<Record<string, { accion: string | null; codigo: string | null }>>({});
  const [tolSel, setTolSel]           = useState<string>('');
  const [cargandoTols, setCargandoTols] = useState(false);

  // ── state — registro ─────────────────────────────────────────────────────────
  const [comentario, setComentario]   = useState('');
  const [fotoPreview, setFotoPreview] = useState<string | null>(null); // ← FMS: preview local
  const [fotoBlob, setFotoBlob]       = useState<Blob | null>(null);   // ← FMS: blob comprimido
  const [guardando, setGuardando]     = useState(false);
  const [status, setStatus]           = useState<{ msg: string; ok: boolean } | null>(null);

  // ── state — elementos con observación ya registrada (para marcar en rojo) ───
  const [elementosConObs, setElementosConObs] = useState<Set<string>>(new Set());

  // ── medir contenedor — robusto para Android/Ionic ─────────────────────────
  // Mide el ancho real disponible. Prioriza el contenedor; si colapsó a 0, mide
  // la imagen interna o el padre. Reintenta con requestAnimationFrame porque
  // IonContent puede no tener layout listo al primer intento.
  const medirContenedor = useCallback(() => {
    let intentos = 0;
    const intentar = () => {
      const el = contenedorRef.current;
      if (el) {
        let w = el.getBoundingClientRect().width || el.offsetWidth;
        if (!w) {
          const img = el.querySelector('img');
          if (img) w = img.getBoundingClientRect().width || (img as HTMLImageElement).offsetWidth;
        }
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

  // Refrescar elementos con obs al volver (ej. si se registró una obs y se vuelve)
  useIonViewWillEnter(() => {
    if (lastGrupo.current) cargarElementosConObs();
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
        setImagen({ ...imgData, imagen_url: src || imgData.imagen_url });
        setImagenBlobUrl(null); // data: URLs no requieren revoke
      }

      // Cargar elementos que ya tienen observaciones registradas en este ambiente
      await cargarElementosConObs();

      setTimeout(medirContenedor, 150);
    } finally {
      setCargando(false);
    }
  };

  // Conectar ResizeObserver cuando el contenedor de la imagen aparece en el DOM.
  // Depende de imagen y cargando: cuando la imagen se renderiza, este efecto
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
  }, [medirContenedor, imagen, cargando]);

  // ── cargar elementos que ya tienen observaciones registradas ─────────────────
  const cargarElementosConObs = async () => {
    if (!depto || !ambiente) return;
    const set = new Set<string>();
    if (online) {
      const { data } = await supabase
        .from('og_registros')
        .select('elemento')
        .eq('departamento_id', depto.id)
        .eq('ambiente', ambiente.titulo);
      (data || []).forEach((r: any) => set.add(r.elemento));
    }
    setElementosConObs(set);
  };

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

    const tab: Tab = el.tipo_elemento === 'Muros' ? 'Muros' : 'Vanos';
    setTabActivo(tab);

    // Preselecciona el tipo de revisión según el elemento — así no hay que
    // elegirlo a mano cada vez (Muro → Planeidad, Pierna → Plomo, Vano → Ancho).
    // Se le pasan el elemento y el tab recién calculados directo (sin esperar
    // a que elSel/tabActivo terminen de propagarse en el estado).
    onTipoClick(tipoPorDefecto(tab, el.elemento), el, tab);
  };

  // ── al tocar tipo de revisión ─────────────────────────────────────────────────
  // FMS offline OG: lee del cache local primero; si no hay resultado cae a Supabase (online).
  // Acepta overrides de elemento/tab para poder llamarse justo después de
  // seleccionar un elemento nuevo, sin esperar a que el estado (elSel/
  // tabActivo) termine de propagarse — si no, usaría valores obsoletos.
  const onTipoClick = async (
    tipo: typeof TIPOS_POR_TAB[Tab][number],
    elOverride?: Elemento,
    tabOverride?: Tab,
  ) => {
    const elActual = elOverride ?? elSel;
    const tabActual = tabOverride ?? tabActivo;
    if (!elActual || !ambiente) return;
    setTipoSel(tipo);
    setTolSel('');
    setStatus(null);
    setCargandoTols(true);
    try {
      const revisionReal = getRevisionReal(elActual.elemento, tabActual, tipo.revision);

      // 1. Intentar desde cache local (disponible online y offline)
      const fromCache = getToleranciaCache({
        revision:     revisionReal,
        itemRevision: tipo.item,
        elemento:     elActual.elemento,
        ambiente:     ambiente.titulo,
      });

      console.log(`[OGAmb] getToleranciaCache — revision="${revisionReal}" item="${tipo.item}" elemento="${elActual.elemento}" ambiente="${ambiente.titulo}" → ${fromCache.length} resultados`);

      if (fromCache.length > 0) {
        const lista = fromCache.map(r => r.tolerancia).filter(Boolean);
        setTolerancia(lista);
        cargarCodigosTolerancia(revisionReal, tipo.item, lista);
        return;
      }

      // 2. Fallback a Supabase si hay red y el cache no tenía resultado
      //    (puede pasar si el cache tiene < 24h pero el catálogo fue actualizado)
      if (online) {
        const { data } = await supabase
          .from('og_catalogo')
          .select('tolerancia')
          .eq('elemento', elActual.elemento)
          .eq('revision', revisionReal)
          .eq('item_revision', tipo.item)
          .eq('ambiente', ambiente.titulo)
          .eq('activo', true);
        const lista = (data || []).map((d: any) => d.tolerancia).filter(Boolean);
        setTolerancia(lista);
        cargarCodigosTolerancia(revisionReal, tipo.item, lista);
      } else {
        // Sin red y sin cache → lista vacía con mensaje claro
        setTolerancia([]);
        setCodigosTol({});
      }
    } finally {
      setCargandoTols(false);
    }
  };

  // Resuelve el código/acción de cada tolerancia del dropdown actual.
  // Primero intenta con el cache offline; si falta algo y hay red, completa
  // consultando og_tolerancia_reparacion directo (misma orientación
  // intercambiada revision/item_revision que usa Calibrador de Elementos).
  const cargarCodigosTolerancia = async (revision: string, itemRevision: string, lista: string[]) => {
    const mapa: Record<string, { accion: string | null; codigo: string | null }> = {};
    const faltantes: string[] = [];
    lista.forEach(tol => {
      const rep = getReparacionCache(revision, itemRevision, tol);
      if (rep) mapa[tol] = rep; else faltantes.push(tol);
    });
    setCodigosTol(mapa);

    if (faltantes.length > 0 && online) {
      const { data } = await supabase
        .from('og_tolerancia_reparacion')
        .select('revision, item_revision, tolerancia, accion, codigo')
        .in('tolerancia', faltantes);
      if (data) {
        const extra: Record<string, { accion: string | null; codigo: string | null }> = {};
        (data as any[]).forEach(r => {
          const coincideDirecto  = r.revision === revision && r.item_revision === itemRevision;
          const coincideCruzado  = r.revision === itemRevision && r.item_revision === revision;
          if (coincideDirecto || coincideCruzado) extra[r.tolerancia] = { accion: r.accion, codigo: r.codigo };
        });
        setCodigosTol(prev => ({ ...prev, ...extra }));
      }
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
        // getSession() lee del localStorage — no requiere red, funciona offline
        const userId = userIdRef.current ||
          (await supabase.auth.getSession()).data.session?.user?.id || '';

        // await: ahora sí persiste en IndexedDB antes de seguir. Si falla
        // (por ejemplo, disco lleno), el catch de abajo lo muestra en
        // pantalla en vez de que la observación se pierda en silencio.
        await encolarRegistroOG({
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
          foto_blob:        fotoBlob ?? null,
          usuario_id:       userId,
          sesion_id:        `${depto.id}_${ambiente.ambiente_cod}_${Date.now()}`,
        });

        setStatus({ msg: 'Guardado offline — se sincronizará al reconectarte', ok: true });
        setElementosConObs(prev => new Set(prev).add(elSel.elemento));
        resetRegistro();
        return;
      }

      // ── MODO ONLINE ─────────────────────────────────────────────────────────
      try {
        let foto_url: string | null = null;

        if (fotoBlob) {
          const path = `og/${depto.id}/${ambiente.ambiente_cod}_${Date.now()}.jpg`;
          const { error: storageErr } = await supabase.storage
            .from('fotos-registros')
            .upload(path, fotoBlob, { contentType: 'image/jpeg', upsert: false });
          // Antes: si fallaba la subida (señal débil, timeout) esto seguía
          // igual e insertaba la observación SIN foto, en silencio. Ahora se
          // lanza el error para que la observación completa (con su foto)
          // caiga a la cola offline en vez de perder la foto para siempre.
          if (storageErr) throw new Error('No se pudo subir la foto: ' + storageErr.message);
          const { data: { publicUrl } } = supabase.storage
            .from('fotos-registros')
            .getPublicUrl(path);
          foto_url = publicUrl;
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

        setStatus({ msg: 'Observación registrada', ok: true });
      } catch (e: any) {
        // Falló la subida de la foto o el insert (señal cortada a medio
        // camino, típico en obra): en vez de mostrar solo un error y perder
        // la observación, se encola completa (con su foto) para reintentar
        // sola al reconectar — igual que en modo offline explícito.
        console.warn('[RevisionOGAmbiente] Falló guardado online, se encola offline:', e?.message);
        await encolarRegistroOG({
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
          foto_blob:        fotoBlob ?? null,
          usuario_id:       userIdRef.current || '',
          sesion_id:        `${depto.id}_${ambiente.ambiente_cod}_${Date.now()}`,
        });
        setStatus({ msg: 'Guardado offline — se sincronizará al reconectarte', ok: true });
      }

      setElementosConObs(prev => new Set(prev).add(elSel.elemento));
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
    // Rojo si ya tiene observación registrada
    if (elementosConObs.has(el.elemento)) return { bg: 'rgba(239,68,68,0.25)', border: 'rgba(239,68,68,0.85)' };
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
            <button slot="start" onClick={() => history.goBack()}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>
              ‹
            </button>
            <IonTitle style={{ fontSize: 16 }}>Revisión OG</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg } as any}>
          <div style={{ padding: 32, textAlign: 'center', color: textSecondary, marginTop: 60 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <Ruler size={32} strokeWidth={1.5} />
            </div>
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
          <button slot="start" onClick={volverADetalle}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>
            ‹
          </button>
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Ruler size={15} strokeWidth={2.25} /> {ambiente.titulo}
            </span>
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
            <div style={{ fontSize: 11, color: textSecondary, marginBottom: 3 }}>
              {proyecto.nombre} · {torre.frente || torre.nombre} · Depto {depto.numero}
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, color: textPrimary, marginBottom: 2, letterSpacing: '-0.3px' }}>
              {depto.id_obra || `Depto ${depto.numero}`}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: textSecondary }}>
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
              <Lock size={18} strokeWidth={2} color={rojo} />
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
              <span style={{ fontSize: 13, fontWeight: 700, color: amarillo, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <WifiOff size={14} strokeWidth={2.25} /> Sin conexión
              </span>
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
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: textMuted }}>
                <ImageOff size={32} strokeWidth={1.5} />
              </div>
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
                { tipo: 'Con obs', col: 'rgba(239,68,68,0.85)' },
              ].map(({ tipo, col }) => {
                if (tipo === 'Con obs') {
                  if (elementosConObs.size === 0) return null;
                  return (
                    <div key={tipo} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 2, border: `2px solid ${col}`, background: col.replace('0.85', '0.25') }} />
                      <span style={{ fontSize: 11, color: textSecondary }}>Con obs ({elementosConObs.size})</span>
                    </div>
                  );
                }
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

          {/* ── Panel de registro (siempre visible) ────────────────────── */}
          {!cargando && !cerrado && (
            <div style={{
              marginTop: 14, background: cardGrad, borderRadius: 16,
              border: `0.5px solid ${elSel ? azulBord : border}`, overflow: 'hidden',
            }}>

              {/* Header: elemento seleccionado o instrucción */}
              <div style={{
                padding: '10px 14px', background: elSel ? azulBg : 'transparent',
                borderBottom: `0.5px solid ${elSel ? azulBord : border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 10, color: elSel ? azul : textMuted, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>
                    {elSel ? 'Elemento seleccionado' : 'Seleccione elemento'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: elSel ? textPrimary : textMuted, marginTop: 2 }}>
                    {elSel ? elSel.elemento : 'Toque un elemento en el plano'}
                  </div>
                </div>
                {elSel && (
                  <button
                    onClick={resetSeleccion}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, padding: 4, display: 'flex' }}
                  ><X size={18} strokeWidth={2} /></button>
                )}
              </div>

              {/* Tabs Muros / Vanos — siempre visibles para filtrar hotspots */}
              <div style={{ padding: '12px 14px 0' }}>
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
              </div>

              {elSel ? (
              <div style={{ padding: '0 14px 12px' }}>

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
                      <>
                        <select
                          value={tolSel}
                          onChange={e => setTolSel(e.target.value)}
                          style={{
                            width: '100%', boxSizing: 'border-box', marginBottom: tolSel ? 6 : 12,
                            border: `0.5px solid ${tolSel ? azul : inputBorder}`,
                            borderRadius: 10, padding: '10px 12px', fontSize: 14,
                            background: inputBg, color: tolSel ? textPrimary : textMuted,
                            outline: 'none', height: 44,
                          }}
                        >
                          <option value="">— Selecciona tolerancia —</option>
                          {tolerancias.map(t => {
                            const codigo = codigosTol[t]?.codigo;
                            return (
                              <option key={t} value={t}>{t}{codigo ? `  ·  ${codigo}` : ''}</option>
                            );
                          })}
                        </select>
                        {tolSel && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 5,
                              border: `1px solid ${azul}`, color: azul, letterSpacing: '0.3px',
                            }}>
                              {codigosTol[tolSel]?.codigo || '?'}
                            </span>
                            <span style={{ fontSize: 12, color: textSecondary }}>
                              {codigosTol[tolSel]?.accion || 'Reparación por definir'}
                            </span>
                          </div>
                        )}
                      </>
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
                    <Camera size={17} strokeWidth={2} />
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
                          cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      ><X size={12} strokeWidth={2.5} /></button>
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
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {status.ok && <Check size={15} strokeWidth={2.5} />}
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
                      ? (p.card2)
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
                    : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Save size={16} strokeWidth={2} />
                        {online ? 'Registrar Observación' : 'Guardar offline'}
                      </span>
                    )
                  }
                </button>

              </div>
              ) : (
                <div style={{ padding: '16px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: textMuted, fontStyle: 'italic' }}>
                    Seleccione un elemento en el plano para registrar
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </IonContent>
    </IonPage>
  );
};

export default RevisionOGAmbiente;
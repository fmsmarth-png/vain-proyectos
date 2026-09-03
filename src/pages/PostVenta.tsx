import { IonContent, IonPage, IonHeader, IonToolbar, IonTitle, IonButton, IonSpinner, IonModal } from '@ionic/react';
import { useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { comprimirImagen } from '../utils/comprimirImagen';
import FotoAnnotator from '../components/FotoAnnotator';
import { generatePdfPostventa } from '../helpers/pdfPostventa';
import { extraerPapeletaPdf, ObservacionPdf, DatosSolicitud } from '../helpers/extraerPapeletaPdf';
import { nombreSemana, fechaDesdeDdMmAaaa } from '../utils/semanasVain';
import { encolarFinalizacionPostventa } from '../utils/postventaOfflineQueue';
import {
  BorradorLocal, guardarBorradorLocal, leerBorradorLocal, eliminarBorradorLocal,
  sincronizarBorradorConServidor,
} from '../utils/postventaBorradorLocal';
import { encolarFotoPendiente, contarFotosPendientes } from '../utils/postventaFotosPendientes';
import {
  Camera, Image as ImageIcon, Home, RefreshCw, FileText, AlertTriangle,
  WifiOff, CheckCircle2, Save, Plus, User, PenLine, Trash2, Pencil, Check, Info,
} from 'lucide-react';

const SESSION_KEY = 'post_venta_depto_state';
const OTRO = '__OTRO__';

// Guardado automático: el borrador de una visita vive en tablas propias,
// separadas de `observacionesinformepv`. Una visita en progreso NO aparece
// en Revision ni en Reportes hasta que se finaliza (ahí se hace el INSERT
// de siempre). RESUME_KEY es el id de borrador que DetalleDepto pide reanudar.
const RESUME_KEY = 'postventa_papeleta_id';
const T_PAPELETA = 'postventa_papeletas';
const T_BORRADOR = 'postventa_obs_borrador';

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

interface Catalogo { id: string; nombre: string }
interface Causa extends Catalogo { tipo: 'estandar' | 'tercero' | 'nombre_tercero' }

interface RevisionObs {
  id?: string;           // id de la fila en postventa_obs_borrador (guardado automático)
  ambienteSel: string;   // nombre del catálogo, '' o OTRO
  ambienteLibre: string; // usado solo cuando ambienteSel === OTRO
  observacion: string;
  partida: string;
  causa: string;
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'SOLUCIONADO' | 'NO_APLICA' | 'CLIENTE_NO_ATIENDE';
  fotoAntes: string | null;
  fotoDespues: string | null;
  origen?: 'papeleta' | 'derivada' | 'adicional';
  /** Texto de la solicitud del cliente, tal cual quedó guardado (ya
   *  combinado con la partida si venía de la plantilla Aconcagua). Se
   *  carga una sola vez y no se edita después — el render lee esto
   *  directo, sin depender del array obs[] en memoria que se puede
   *  desincronizar al agregar/derivar/quitar observaciones. */
  solicitudCliente: string;
}

const DATOS_VACIOS: DatosSolicitud = {
  condominio: '', depto: '', torre: '', requerimiento: '',
  fechaRegistro: '', fechaAtencion: '', horaAtencion: '',
  formato: 'solicitud',
};

const GRUPOS_CAUSA: { tipo: Causa['tipo']; label: string }[] = [
  { tipo: 'estandar', label: 'Estándar' },
  { tipo: 'tercero', label: 'Terceros' },
  { tipo: 'nombre_tercero', label: 'Especialidad / Cuadrilla' },
];

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

const norm = (s: any) =>
  (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/**
 * El ambiente de la papeleta lo escribe el propietario y es solo contexto:
 * puede confundir baño 1 con baño 2, o referirse a algo que ni siquiera está
 * en el catálogo (estacionamiento, bodega). Por eso nunca se transforma ni se
 * fuerza. Si hay parecido claro con un ambiente del catálogo se pre-selecciona
 * como guía; si no, el inspector elige — incluida la opción "Otro".
 */
const sugerirAmbiente = (textoPdf: string, catalogo: Catalogo[]): string => {
  const t = norm(textoPdf);
  if (!t) return '';
  const exacto = catalogo.find(a => norm(a.nombre) === t);
  if (exacto) return exacto.nombre;
  const parcial = catalogo.find(a => t.includes(norm(a.nombre)) || norm(a.nombre).includes(t));
  return parcial ? parcial.nombre : '';
};

/** Mismo mecanismo que sugerirAmbiente, para la columna PARTIDA de la plantilla Aconcagua. */
const sugerirPartida = (textoPdf: string | undefined, catalogo: Catalogo[]): string => {
  if (!textoPdf) return '';
  const t = norm(textoPdf);
  if (!t) return '';
  const exacto = catalogo.find(a => norm(a.nombre) === t);
  if (exacto) return exacto.nombre;
  const parcial = catalogo.find(a => t.includes(norm(a.nombre)) || norm(a.nombre).includes(t));
  return parcial ? parcial.nombre : '';
};

const formatRut = (value: string): string => {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean;
  const dv = clean.slice(-1);
  const cuerpo = clean.slice(0, -1).replace(/[^0-9]/g, '').slice(0, 8);
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const guardarPdfBlob = async (blob: Blob, fileName: string, subtitulo: string) => {
  if (Capacitor.isNativePlatform()) {
    const dataUrl = await blobToDataUrl(blob);
    const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
    await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    try {
      await Share.share({ title: fileName, text: subtitulo, url: uri, dialogTitle: 'Guardar / compartir informe' });
    } catch {
      // El usuario cerró el diálogo
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }
};

/* ------------------------------------------------------------------ */
/*  Componente                                                         */
/* ------------------------------------------------------------------ */

const PostVenta: React.FC = () => {
  const history = useHistory();
  const location = useLocation<any>();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { online } = useOffline();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const firmaCanvasRef = useRef<HTMLCanvasElement>(null);
  const dibujandoRef = useRef(false);

  /* ---------- contexto de navegación (depto / torre / proyecto) ---------- */
  const resolveNavState = () => {
    if (location.state?.depto) return location.state;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const navState = resolveNavState();
  const depto = navState?.depto ?? null;
  const torre = navState?.torre ?? null;
  const proyecto = navState?.proyecto ?? null;
  const tieneContexto = !!(depto && torre && proyecto);

  useEffect(() => {
    if (location.state?.depto) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(location.state)); } catch {}
    }
  }, [location.state]);

  /* ---------- estado ---------- */
  const [paso, setPaso] = useState<'carga' | 'revision' | 'firma'>('carga');
  const [loading, setLoading] = useState(true);
  const [leyendo, setLeyendo] = useState(false);
  // Cuando es una atención urgente sin papeleta agendada: no hay solicitud del
  // cliente, las observaciones se crean a mano y se guardan con solicitud_cliente null.
  const [sinPapeleta, setSinPapeleta] = useState(false);

  const [ambientes, setAmbientes] = useState<Catalogo[]>([]);
  const [partidas, setPartidas] = useState<Catalogo[]>([]);
  const [causas, setCausas] = useState<Causa[]>([]);
  const [proyectoCodigo, setProyectoCodigo] = useState<string>(proyecto?.codigo ?? '');
  const [propietario, setPropietario] = useState({ nombre: '', rut: '', telefono: '' });
  // Nombre del revisor. Se respalda en localStorage para que siga disponible
  // aunque la consulta a `usuarios` falle o se esté sin conexión.
  const [inspectorNombre, setInspectorNombre] = useState(
    () => localStorage.getItem('detalles_user_nombre') ?? ''
  );
  // Rol del usuario logueado. maestro_postventa solo se suma a visitas ya
  // creadas por un profesional (o inicia una nueva sin papeleta): toma
  // fotos, recopila receptor/firma y cambia el estado de cada observación,
  // pero no edita ambiente/observación/partida/causa, no sube papeletas PDF,
  // y no edita fecha/hora de atención.
  const [usuarioRol, setUsuarioRol] = useState('');
  const esMaestro = usuarioRol === 'maestro_postventa';
  // Titular de post venta del proyecto (Admin → Proyectos). Cuando
  // maestro_postventa finaliza una visita, el informe y la papeleta quedan
  // a nombre de este usuario, no de quien tomó las fotos/firma.
  const [titular, setTitular] = useState<{ id: string | null; nombre: string | null; email: string | null }>(
    { id: null, nombre: null, email: null }
  );

  const [datos, setDatos] = useState<DatosSolicitud>(DATOS_VACIOS);
  const [obs, setObs] = useState<ObservacionPdf[]>([]);
  const [rev, setRev] = useState<RevisionObs[]>([]);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [desajuste, setDesajuste] = useState('');
  const [desajusteOk, setDesajusteOk] = useState(false);

  // Quien recibe la visita (puede o no ser el propietario)
  const [recNombre, setRecNombre] = useState('');
  const [recRut, setRecRut] = useState('');

  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [finalizadoOffline, setFinalizadoOffline] = useState(false);
  // Generación de PDF como acción SEPARADA del cierre (ver generarInformePdf
  // más abajo): el maestro_postventa solo cierra (firma + fotos), y es el
  // profesional quien genera el informe después, desde la vista de solo
  // lectura, ya con todos los datos confirmados en el servidor.
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [errorPdf, setErrorPdf] = useState('');
  // Barra de estado "N fotos sincronizando" — se actualiza con un polling
  // simple mientras la visita está en modo solo lectura, leyendo el
  // contador de la cola dedicada (postventaFotosPendientes). No hace falta
  // nada más sofisticado: son pocas fotos y el ciclo de fondo ya corre solo.
  const [fotosPendientesCount, setFotosPendientesCount] = useState(0);

  const [anotando, setAnotando] = useState<{ idx: number; tipo: 'antes' | 'despues'; src: string } | null>(null);
  // Vista previa amplia de una foto ya tomada, con opción de eliminarla
  // desde ahí mismo — antes solo existía el botón × diminuto en la miniatura.
  const [fotoAmpliada, setFotoAmpliada] = useState<{ idx: number; tipo: 'antes' | 'despues'; src: string } | null>(null);
  // Aviso transitorio cuando otra sesión (ej. el profesional en otro
  // dispositivo) actualizó esta misma visita mientras la tenías abierta.
  const [actualizadoRemoto, setActualizadoRemoto] = useState(false);

  /* ---------- guardado automático ---------- */
  const [papeletaId, setPapeletaId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [reanudando, setReanudando] = useState(false);
  // Ver (no editar) una visita ya COMPLETADA. Distinto de las restricciones
  // por rol (esMaestro): acá NADIE edita nada — ni guarda localmente, ni
  // sincroniza, ni escucha tiempo real. Es una foto fija del informe final.
  // Se inicializa de forma optimista desde el estado de navegación (si
  // VisitasPostVenta.tsx ya sabe que es una visita completada, evita el
  // parpadeo de ver la UI editable antes de que hidratarBorrador confirme
  // contra la base de datos) — pero la única fuente de verdad real sigue
  // siendo `pap.estado === 'COMPLETADA'` en hidratarBorrador: si este flag
  // llegara desactualizado o manipulado, se corrige solo al cargar.
  const [soloLectura, setSoloLectura] = useState<boolean>(() => !!location.state?.soloLectura);
  const [completadaInfo, setCompletadaInfo] = useState<{ fecha: string | null; firmaUrl: string | null }>({ fecha: null, firmaUrl: null });
  // Refs para leer el estado más reciente dentro de callbacks con debounce
  const revRef = useRef<RevisionObs[]>([]);
  const obsRef = useRef<ObservacionPdf[]>([]);
  const datosRef = useRef<DatosSolicitud>(DATOS_VACIOS);
  const recNombreRef = useRef('');
  const recRutRef = useRef('');
  const sinPapeletaRef = useRef(false);
  const usuarioIdRef = useRef<string | null>(null);
  const usuarioEmailRef = useRef<string | null>(null);
  const creadoEnServidorRef = useRef(false);
  const syncTimerRef = useRef<any>(null);
  // Marca de tiempo de la última edición hecha por ESTA persona en ESTE
  // dispositivo (no cuenta cuando el que escribe es la propia fusión
  // remota). Mientras esté "reciente", la fusión en tiempo real se pausa —
  // evita pisar un tecleo en curso con un valor más viejo que llega del
  // servidor justo en ese instante.
  const ultimaEdicionLocalRef = useRef(0);
  const papeletaIdRef = useRef<string | null>(null);
  const receptorTimer = useRef<any>(null);
  const reanudadoRef = useRef(false);
  // Turno vigente de cada slot de foto ("{filaId}:antes" / "{filaId}:despues").
  // Se incrementa cada vez que setFotoYGuardar toca ese slot (tomar, retomar
  // o borrar una foto). La subida a Storage de esa llamada corre en segundo
  // plano; cuando termina, solo se le permite escribir el resultado si su
  // turno sigue siendo el vigente — si mientras tanto se reemplazó la foto
  // en ese mismo slot, la subida vieja se descarta en silencio en vez de
  // pisar la foto nueva (o de escribir una URL de una foto que el usuario ya
  // había borrado).
  const fotoTurnoRef = useRef<Record<string, number>>({});
  useEffect(() => { revRef.current = rev; }, [rev]);
  useEffect(() => { obsRef.current = obs; }, [obs]);
  // Los useEffect de abajo quedan como respaldo defensivo, pero YA NO son la
  // única vía de sincronización de datos/recNombre/recRut/sinPapeleta — ver
  // los setters *Sync más abajo. Antes, cualquier código que llamara a
  // construirBorrador()/persistirBorrador() justo después de un setDatosSync(...)
  // (u otro de los 3) sin pasar un `over` explícito, leía el valor VIEJO del
  // ref (el useEffect corre un ciclo de render después). Eso causó el bug
  // real documentado en postventaBorradorLocal.ts ("fecha_atencion se pone
  // null sola"): se parchó a mano en los sitios donde alguien se acordó de
  // hacerlo (ver hidratarBorrador, crearBorrador), pero cualquier código
  // nuevo que llamara a setDatos sin ese cuidado podía reintroducir el mismo
  // bug. Los setters *Sync actualizan el ref en el mismo tick, siempre, así
  // que ya no depende de que cada callsite se acuerde de hacerlo a mano.
  useEffect(() => { datosRef.current = datos; }, [datos]);
  useEffect(() => { recNombreRef.current = recNombre; }, [recNombre]);
  useEffect(() => { recRutRef.current = recRut; }, [recRut]);
  useEffect(() => { sinPapeletaRef.current = sinPapeleta; }, [sinPapeleta]);
  useEffect(() => { papeletaIdRef.current = papeletaId; }, [papeletaId]);

  const setDatosSync = (updater: DatosSolicitud | ((prev: DatosSolicitud) => DatosSolicitud)) => {
    setDatos(prev => {
      const next = typeof updater === 'function' ? (updater as (p: DatosSolicitud) => DatosSolicitud)(prev) : updater;
      datosRef.current = next;
      return next;
    });
  };
  const setRecNombreSync = (updater: string | ((prev: string) => string)) => {
    setRecNombre(prev => {
      const next = typeof updater === 'function' ? (updater as (p: string) => string)(prev) : updater;
      recNombreRef.current = next;
      return next;
    });
  };
  const setRecRutSync = (updater: string | ((prev: string) => string)) => {
    setRecRut(prev => {
      const next = typeof updater === 'function' ? (updater as (p: string) => string)(prev) : updater;
      recRutRef.current = next;
      return next;
    });
  };
  const setSinPapeletaSync = (updater: boolean | ((prev: boolean) => boolean)) => {
    setSinPapeleta(prev => {
      const next = typeof updater === 'function' ? (updater as (p: boolean) => boolean)(prev) : updater;
      sinPapeletaRef.current = next;
      return next;
    });
  };

  /* ---------- paleta ---------- */
  const bg = dark ? '#0B1220' : '#f0f4f8';
  const cardGrad = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const border = dark ? '#243550' : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted = dark ? '#5D728F' : '#94a3b8';
  const toolbar = dark ? '#0E1728' : '#1e3a5f';
  const inputBg = dark ? '#16233B' : '#ffffff';
  const inputBorder = dark ? '#243550' : '#cbd5e1';
  const accent = dark ? '#60a5fa' : '#2563eb';
  const sepLine = dark
    ? 'linear-gradient(90deg, transparent, #243550, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';

  const labelStyle: React.CSSProperties = {
    fontSize: 9, color: textMuted, display: 'block', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg,
    border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14,
    boxSizing: 'border-box', marginBottom: 12,
  };
  const taStyle: React.CSSProperties = { ...inputStyle, height: 90, padding: '10px 12px', resize: 'none' };
  const cardStyle: React.CSSProperties = {
    background: cardGrad, borderRadius: 16, padding: 16,
    border: `0.5px solid ${border}`, marginBottom: 12,
  };
  const btnPrimary = (disabled: boolean): React.CSSProperties => ({
    width: '100%', height: 48, borderRadius: 12,
    background: disabled
      ? (dark ? 'linear-gradient(135deg, #1E2E4A, #243550)' : '#f1f5f9')
      : (dark ? 'linear-gradient(135deg, #243550, #2E4468)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)'),
    border: disabled ? `0.5px solid ${border}` : 'none',
    color: disabled ? textMuted : '#fff',
    fontSize: 15, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
  });
  const btnGhost: React.CSSProperties = {
    width: '100%', height: 46, borderRadius: 12, background: 'transparent',
    border: `0.5px solid ${border}`, color: textSecondary,
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
  };

  /* ---------- carga inicial ---------- */
  useIonViewDidEnter(() => {
    if (!tieneContexto) { setLoading(false); return; }
    cargar();
  });

  useEffect(() => { if (tieneContexto) cargar(); /* eslint-disable-next-line */ }, []);

  // Actualiza la barra de "fotos sincronizando" cada pocos segundos mientras
  // esta visita está en modo solo lectura (recién cerrada o reabierta para
  // consulta). Se detiene solo cuando el contador llega a 0 o se sale de
  // modo lectura — no necesita nada más elaborado que un polling simple.
  useEffect(() => {
    if (!soloLectura || !papeletaId) return;
    const chequear = () => setFotosPendientesCount(contarFotosPendientes(papeletaId));
    chequear();
    const interval = setInterval(chequear, 4000);
    return () => clearInterval(interval);
  }, [soloLectura, papeletaId]);

  // Si se recupera la señal mientras esta pantalla sigue abierta, intenta
  // reflejar el avance en Supabase al toque en vez de esperar el próximo
  // ciclo de OfflineContext (que igual lo cubre si la pantalla ya se cerró).
  useEffect(() => {
    if (online && papeletaId) {
      const borrador = construirBorrador();
      if (borrador) void sincronizarBorradorConServidor(borrador).then(ok => { if (ok) creadoEnServidorRef.current = true; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const cargar = async () => {
    setLoading(true);
    try {
      const [amb, part, cau, dep, proy] = await Promise.all([
        supabase.from('ambientes').select('id, nombre').order('nombre'),
        supabase.from('partidas').select('id, nombre').order('nombre'),
        supabase.from('causas').select('id, nombre, tipo').order('nombre'),
        supabase.from('departamentos')
          .select('propietario_nombre, acta_propietario_rut, propietario_telefono')
          .eq('id', depto.id).maybeSingle(),
        proyecto?.codigo
          ? Promise.resolve({ data: { codigo: proyecto.codigo } } as any)
          : supabase.from('proyectos').select('codigo').eq('id', proyecto.id).maybeSingle(),
      ]);

      if (amb.data) setAmbientes(amb.data as Catalogo[]);
      if (part.data) setPartidas(part.data as Catalogo[]);
      if (cau.data) setCausas(cau.data as Causa[]);
      if (proy?.data?.codigo) setProyectoCodigo(proy.data.codigo);
      if (dep.data) {
        setPropietario({
          nombre: dep.data.propietario_nombre ?? '',
          rut: dep.data.acta_propietario_rut ?? '',
          telefono: dep.data.propietario_telefono ?? '',
        });
      }

      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (uid) {
        const { data: u } = await supabase
          .from('usuarios').select('nombre, rol').eq('id', uid).maybeSingle();
        if (u?.nombre) {
          const n = String(u.nombre).trim();
          setInspectorNombre(n);
          try { localStorage.setItem('detalles_user_nombre', n); } catch {}
        }
        if (u?.rol) setUsuarioRol(String(u.rol));
      }

      // Titular de post venta del proyecto — se cachea en localStorage para
      // que un maestro_postventa que trabaja offline (sin poder consultar
      // Supabase en este instante) igual sepa a quién atribuir la visita,
      // siempre que haya abierto este proyecto al menos una vez con señal.
      if (proyecto?.id) {
        const cacheKey = `pv_titular_${proyecto.id}`;
        let resuelto: { id: string; nombre: string | null; email: string | null } | null = null;
        try {
          const { data: proyRow } = await supabase
            .from('proyectos').select('titular_postventa_id').eq('id', proyecto.id).maybeSingle();
          const titularId = proyRow?.titular_postventa_id ?? null;
          if (titularId) {
            const { data: tUser } = await supabase
              .from('usuarios').select('id, nombre, email').eq('id', titularId).maybeSingle();
            if (tUser) {
              resuelto = { id: tUser.id, nombre: tUser.nombre ?? null, email: (tUser.email ?? '').toLowerCase() || null };
            }
          }
        } catch { /* sin conexión: se intenta el respaldo local de abajo */ }

        if (resuelto) {
          setTitular(resuelto);
          try { localStorage.setItem(cacheKey, JSON.stringify(resuelto)); } catch {}
        } else {
          try {
            const cache = localStorage.getItem(cacheKey);
            if (cache) setTitular(JSON.parse(cache));
          } catch {}
        }
      }
      // ¿Venimos a reanudar un borrador desde DetalleDepto?
      const pid = sessionStorage.getItem(RESUME_KEY);
      if (pid && !reanudadoRef.current) {
        reanudadoRef.current = true;
        await hidratarBorrador(pid, (amb.data as Catalogo[]) ?? []);
      }
    } catch (e) {
      console.error('Error cargando catálogos:', e);
    }
    setLoading(false);
  };

  const salir = () => history.goBack();

  const reiniciar = () => {
    clearTimeout(receptorTimer.current);
    clearTimeout(syncTimerRef.current);
    reanudadoRef.current = false;
    creadoEnServidorRef.current = false;
    papeletaIdRef.current = null;
    sessionStorage.removeItem(RESUME_KEY);
    setPapeletaId(null); setSaveState('idle');
    setDatosSync(DATOS_VACIOS); setObs([]); setRev([]); setAbierta(null);
    setDesajuste(''); setDesajusteOk(false);
    setRecNombreSync(''); setRecRutSync('');
    setFirmaDataUrl(null); setError(''); setPaso('carga');
    setSinPapeletaSync(false);
    setSoloLectura(false);
    setCompletadaInfo({ fecha: null, firmaUrl: null });
  };

  const usarDatosPropietario = () => {
    const n = propietario.nombre;
    const r = formatRut(propietario.rut);
    setRecNombreSync(n);
    setRecRutSync(r);
    guardarReceptorDebounced(n, r);
  };

  /* ---------- lectura del PDF ---------- */
  const seleccionarPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (esMaestro) return;
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    // iOS WebView/Safari puede reportar MIME vacío o 'application/octet-stream' para PDFs
    const esPdf = file.type === 'application/pdf'
      || file.name.toLowerCase().endsWith('.pdf');
    if (!esPdf) { setError('Solo se aceptan archivos PDF'); return; }

    setLeyendo(true); setError('');
    try {
      const { datos: d, observaciones } = await extraerPapeletaPdf(file);

      console.log(`=== ${file.name} ===`);
      console.log(`Req ${d.requerimiento} · Torre ${d.torre} · Depto ${d.depto} · Registro ${d.fechaRegistro} · Atención ${d.fechaAtencion} ${d.horaAtencion} · ${observaciones.length} obs`);
      observaciones.forEach(o => console.log(`  #${o.numero} [${o.ambiente}] → ${o.descripcion}`));

      if (observaciones.length === 0) {
        setError('No se extrajeron observaciones del PDF. Verifica el formato.');
        setLeyendo(false); return;
      }

      // La papeleta debe corresponder al departamento desde el que se entró
      const errores: string[] = [];
      if (norm(d.depto) !== norm(depto.numero)) {
        errores.push(`la papeleta es del depto ${d.depto || '—'} y estás en el ${depto.numero}`);
      }
      if (norm(d.torre) !== norm(torre.nombre)) {
        errores.push(`la papeleta es de la torre ${d.torre || '—'} y estás en la ${torre.nombre}`);
      }
      setDesajuste(errores.join(' · '));
      setDesajusteOk(false);

      const revsIniciales: RevisionObs[] = observaciones.map(o => ({
        ambienteSel: sugerirAmbiente(o.ambiente, ambientes),
        ambienteLibre: '',
        observacion: '',
        partida: sugerirPartida(o.partida, partidas),
        causa: '',
        estado: 'PENDIENTE' as const,
        fotoAntes: null, fotoDespues: null,
        origen: 'papeleta' as const,
        solicitudCliente: contextoObs(o),
      }));
      setDatosSync(d);
      setObs(observaciones);
      setRev(revsIniciales);
      setAbierta(0);
      setPaso('revision');
      // Crea el borrador en la BD → desde aquí todo se guarda solo.
      iniciarBorrador(d, observaciones, revsIniciales, false);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo leer el PDF');
    }
    setLeyendo(false);
  };

  /* ---------- atención sin papeleta (urgencia no agendada) ---------- */
  // Crea una observación en blanco para el mismo formulario de siempre. La
  // solicitud del cliente no aplica: se guardará como null al finalizar.
  const obsVacia = (n: number = 1): ObservacionPdf => ({
    numero: String(n), ambiente: '', descripcion: '',
  } as ObservacionPdf);

  const revVacia = (origen: RevisionObs['origen'] = 'adicional'): RevisionObs => ({
    ambienteSel: '', ambienteLibre: '',
    observacion: '', partida: '', causa: '',
    estado: 'PENDIENTE' as const,
    fotoAntes: null, fotoDespues: null,
    origen,
    solicitudCliente: '',
  });

  const iniciarSinPapeleta = () => {
    const o = [obsVacia(1)];
    const r = [revVacia('adicional')];
    setSinPapeletaSync(true);
    setDatosSync(DATOS_VACIOS);
    setDesajuste(''); setDesajusteOk(false);
    setObs(o);
    setRev(r);
    setAbierta(0);
    setError('');
    setPaso('revision');
    iniciarBorrador(DATOS_VACIOS, o, r, true);
  };

  const agregarObs = () => {
    if (esMaestro || soloLectura) return;
    const nObs = obsVacia(obs.length + 1);
    const nRev: RevisionObs = { ...revVacia('adicional'), id: nuevoId() };
    const idx = obs.length;
    const nextObs = [...obs, nObs];
    const nextRev = [...rev, nRev];
    setObs(nextObs); obsRef.current = nextObs;
    setRev(nextRev); revRef.current = nextRev;
    setAbierta(idx);
    void persistirBorrador({ rev: nextRev, obs: nextObs });
  };

  // Con papeleta: separa un problema adicional dentro de la MISMA solicitud del
  // cliente. La nueva obs hereda la descripción del PDF de la obs padre para que
  // solicitud_cliente quede igual. Se inserta justo después de su padre.
  const derivarObs = (idxPadre: number) => {
    if (esMaestro || soloLectura) return;
    const nObs = { ...obs[idxPadre] };
    const nRev: RevisionObs = {
      ...revVacia('derivada'),
      id: nuevoId(),
      ambienteSel: rev[idxPadre].ambienteSel,
      ambienteLibre: rev[idxPadre].ambienteLibre,
      solicitudCliente: rev[idxPadre].solicitudCliente,
    };
    const nextObs = [...obs]; nextObs.splice(idxPadre + 1, 0, nObs);
    const nextRev = [...rev]; nextRev.splice(idxPadre + 1, 0, nRev);
    setObs(nextObs); obsRef.current = nextObs;
    setRev(nextRev); revRef.current = nextRev;
    setAbierta(idxPadre + 1);
    void persistirBorrador({ rev: nextRev, obs: nextObs });
  };

  // Con papeleta: agrega un trabajo NO registrado en la papeleta (se hizo en la
  // misma visita). No tiene solicitud del cliente → se guarda con null.
  const agregarAdicional = () => {
    if (esMaestro || soloLectura) return;
    const nObs = obsVacia(obs.length + 1);
    const nRev: RevisionObs = { ...revVacia('adicional'), id: nuevoId() };
    const idx = obs.length;
    const nextObs = [...obs, nObs];
    const nextRev = [...rev, nRev];
    setObs(nextObs); obsRef.current = nextObs;
    setRev(nextRev); revRef.current = nextRev;
    setAbierta(idx);
    void persistirBorrador({ rev: nextRev, obs: nextObs });
  };

  const quitarObs = (idx: number) => {
    if (esMaestro || soloLectura) return;
    if (obs.length <= 1) return; // siempre queda al menos una
    const id = rev[idx]?.id;
    const nextObs = obs.filter((_, i) => i !== idx);
    const nextRev = rev.filter((_, i) => i !== idx);
    setObs(nextObs); obsRef.current = nextObs;
    setRev(nextRev); revRef.current = nextRev;
    setAbierta(null);
    void persistirBorrador({ rev: nextRev, obs: nextObs });
    // Best-effort: si esa fila ya se había reflejado en Supabase, se borra
    // allá también. Si falla por estar offline, no se pierde nada del lado
    // local (ya se quitó de aquí); solo puede quedar una fila huérfana en el
    // borrador remoto hasta la próxima revisión manual — caso raro.
    if (id && online) {
      supabase.from(T_BORRADOR).delete().eq('id', id).then(() => {}, () => {});
    }
  };

  const ambienteFinal = (r: RevisionObs) =>
    (r.ambienteSel === OTRO ? r.ambienteLibre : r.ambienteSel).trim();

  /** Combina PARTIDA + OBSERVACIÓN (ej. "CIELO: FILTRA") para la plantilla
   *  Aconcagua (orden_visita). En la plantilla vieja o.partida no existe. */
  const contextoObs = (o: ObservacionPdf) =>
    o.partida ? `${o.partida}: ${o.descripcion}` : o.descripcion;

  const nuevoId = (): string =>
    (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  /* ------------------------------------------------------------------ */
  /*  Guardado LOCAL-FIRST del borrador (crear / actualizar / reanudar)  */
  /*                                                                      */
  /*  Cada edición se guarda PRIMERO en IndexedDB (siempre funciona, no  */
  /*  depende de la red) y, aparte, con su propio debounce, se intenta   */
  /*  reflejar en Supabase para que la tarjeta de "visita en progreso"   */
  /*  en DetalleDepto se vea al día. Si ese reflejo falla (sin señal),   */
  /*  no se pierde nada: el dato ya está a salvo en el borrador local y  */
  /*  el ciclo global de OfflineContext lo reintenta solo más adelante,  */
  /*  esté o no esta pantalla abierta.                                   */
  /* ------------------------------------------------------------------ */

  const idxPorId = (id: string) => revRef.current.findIndex(r => r.id === id);

  // Arma el snapshot completo del borrador a partir del estado actual, con
  // overrides puntuales para no depender de que React ya haya re-renderizado
  // cuando se llama justo después de un setX() (los refs se actualizan en un
  // efecto, un paso después).
  const construirBorrador = (over: {
    rev?: RevisionObs[]; obs?: ObservacionPdf[]; datos?: DatosSolicitud;
    recNombre?: string; recRut?: string; sinPapeleta?: boolean;
  } = {}): BorradorLocal | null => {
    const pid = papeletaIdRef.current;
    if (!pid) return null;
    const revActual = over.rev ?? revRef.current;
    const obsActual = over.obs ?? obsRef.current;
    const sinPapeletaActual = over.sinPapeleta ?? sinPapeletaRef.current;
    const datosActual = over.datos ?? datosRef.current;
    return {
      id: pid,
      depto_id: depto.id,
      proyecto_id: proyecto.id,
      proyecto_codigo: proyectoCodigo || proyecto.codigo || null,
      torre_codigo: torre.nombre,
      depto_numero: depto.numero,
      sin_papeleta: sinPapeletaActual,
      n_requerimiento: sinPapeletaActual ? null : (datosActual.requerimiento || null),
      fecha_registro: datosActual.fechaRegistro || null,
      fecha_atencion: datosActual.fechaAtencion || null,
      hora_atencion: datosActual.horaAtencion || null,
      condominio: datosActual.condominio || null,
      receptor_nombre: over.recNombre ?? recNombreRef.current,
      receptor_rut: over.recRut ?? recRutRef.current,
      usuario_id: usuarioIdRef.current,
      usuario_email: usuarioEmailRef.current,
      usuario_nombre: inspectorNombre || null,
      filas: revActual.filter(r => r.id).map((r, i) => ({
        id: r.id!,
        orden: i,
        origen: r.origen ?? 'papeleta',
        solicitud_cliente: (sinPapeletaActual || r.origen === 'adicional') ? null : (obsActual[i]?.descripcion ?? null),
        solicitud_ambiente: obsActual[i]?.ambiente ?? null,
        ambiente: ambienteFinal(r) || null,
        observacion: r.observacion.trim() || null,
        partida_afectada: r.partida || null,
        causa: r.causa || null,
        estado: r.estado,
        foto_antes: r.fotoAntes ?? null,
        foto_despues: r.fotoDespues ?? null,
      })),
      estado: 'EN_PROGRESO',
      creadoEnServidor: creadoEnServidorRef.current,
      actualizado_en: new Date().toISOString(),
    };
  };

  // Guarda el snapshot en IndexedDB de inmediato (sin debounce: es barato y
  // siempre funciona) y programa, aparte, un intento de reflejarlo en
  // Supabase con un pequeño debounce para no saturar la red con cada tecleo.
  const persistirBorrador = async (
    over: Parameters<typeof construirBorrador>[0] = {},
    esEdicionLocal: boolean = true,
  ) => {
    if (esEdicionLocal) ultimaEdicionLocalRef.current = Date.now();
    const borrador = construirBorrador(over);
    if (!borrador) return; // aún no se ha creado el borrador (crearBorrador no ha corrido)
    try {
      await guardarBorradorLocal(borrador);
      setSaveState('saved');
    } catch (e) {
      console.error('[PostVenta] No se pudo guardar el borrador local:', e);
      setSaveState('error');
      return; // si ni siquiera el guardado local funcionó, no tiene sentido intentar la red
    }
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (!online) return; // se reintentará solo al reconectar (OfflineContext)
      void sincronizarBorradorConServidor(borrador).then(ok => {
        if (ok) creadoEnServidorRef.current = true;
      });
    }, 700);
  };

  // Fuerza el guardado local + intento de sync antes de finalizar.
  const flushGuardadoFilas = async () => {
    clearTimeout(syncTimerRef.current);
    await persistirBorrador();
    if (online) await sincronizarBorradorConServidor(construirBorrador()!);
  };

  // Sube una foto al bucket y devuelve la URL pública. Si falla (sin conexión),
  // el llamador guarda el data URL directo como respaldo.
  const subirFotoBorrador = async (dataUrl: string): Promise<string> => {
    const blob = await fetch(dataUrl).then(r => r.blob());
    const nombre = `pv_${depto.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
    const path = `postventa-borradores/${nombre}`;
    const { error } = await supabase.storage
      .from('fotos-registros')
      .upload(path, new File([blob], nombre, { type: 'image/jpeg' }), { upsert: true });
    if (error) throw error;
    return supabase.storage.from('fotos-registros').getPublicUrl(path).data.publicUrl;
  };

  const urlADataUrl = async (u: string): Promise<string | undefined> => {
    try {
      if (u.startsWith('data:')) return u;
      const blob = await fetch(u).then(r => r.blob());
      return await blobToDataUrl(blob);
    } catch { return undefined; }
  };

  // Campos que maestro_postventa no puede tocar: solo tiene fotos, estado y
  // el receptor (nombre/rut/firma, manejados aparte).
  const CAMPOS_BLOQUEADOS_MAESTRO: (keyof RevisionObs)[] =
    ['ambienteSel', 'ambienteLibre', 'observacion', 'partida', 'causa'];

  // Edición con guardado automático (local-first) del borrador.
  const setCampo = (idx: number, campo: keyof RevisionObs, valor: any) => {
    if (soloLectura) return;
    if (esMaestro && CAMPOS_BLOQUEADOS_MAESTRO.includes(campo)) return;
    setRev(prev => {
      const next = prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r));
      revRef.current = next; // fresco de inmediato, sin esperar el efecto
      void persistirBorrador({ rev: next });
      return next;
    });
  };

  // Preview instantáneo + guardado local inmediato + subida a Storage en
  // segundo plano. Sin conexión: el data URL queda guardado como respaldo en
  // el borrador local y se reemplaza por la URL de Storage cuando se pueda.
  const setFotoYGuardar = async (idx: number, tipo: 'antes' | 'despues', dataUrl: string | null) => {
    if (soloLectura) return;
    const campo = tipo === 'antes' ? 'fotoAntes' : 'fotoDespues';

    // Identifica el slot por id de FILA, no por índice (el índice puede
    // correrse si se agregan/derivan filas mientras una subida sigue en
    // vuelo). Se toma el turno ANTES de cualquier await, para que capture
    // exactamente el estado "esta llamada es la más reciente para este
    // slot" en el instante en que se llamó.
    const filaId = revRef.current[idx]?.id ?? String(idx);
    const key = `${filaId}:${tipo}`;
    const miTurno = (fotoTurnoRef.current[key] ?? 0) + 1;
    fotoTurnoRef.current[key] = miTurno;

    setCampoLocal(idx, campo, dataUrl);
    const next = revRef.current.map((r, i) => (i === idx ? { ...r, [campo]: dataUrl } : r));
    revRef.current = next;
    await persistirBorrador({ rev: next });

    if (!dataUrl || !online) return; // sin conexión, el data URL local ya quedó a salvo arriba
    try {
      const url = await subirFotoBorrador(dataUrl);

      // Si mientras esta subida estaba en vuelo alguien retomó o borró la
      // foto de este mismo slot, ese turno ya avanzó — esta subida quedó
      // obsoleta y no debe escribir nada (evita pisar la foto nueva, o
      // resucitar una foto que el usuario ya había borrado).
      if (fotoTurnoRef.current[key] !== miTurno) return;

      const i = idxPorId(filaId);
      if (i >= 0) {
        setCampoLocal(i, campo, url);
        const next2 = revRef.current.map((r, j) => (j === i ? { ...r, [campo]: url } : r));
        revRef.current = next2;
        await persistirBorrador({ rev: next2 });
      }
    } catch {
      /* sin conexión a mitad de camino: se conserva el data URL como respaldo */
    }
  };

  // Cambio puro en memoria (sin persistir) — usado como paso intermedio por
  // setFotoYGuardar, que persiste explícitamente después.
  function setCampoLocal(idx: number, campo: keyof RevisionObs, valor: any) {
    setRev(prev => prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)));
  }

  // Crea el borrador LOCAL apenas se inicia la visita: el id se genera en el
  // cliente (no depende de la red), así que la visita queda protegida desde
  // el primer instante, incluso si se inicia completamente sin conexión.
  // El reflejo en Supabase se intenta aparte, en segundo plano.
  const iniciarBorrador = async (
    d: DatosSolicitud,
    observaciones: ObservacionPdf[],
    revs: RevisionObs[],
    esSinPapeleta: boolean,
  ) => {
    const pid = nuevoId();
    const revsConId = revs.map(r => ({ ...r, id: r.id ?? nuevoId() }));

    try {
      const { data: sess } = await supabase.auth.getSession();
      usuarioIdRef.current = sess?.session?.user?.id ?? null;
      usuarioEmailRef.current = (sess?.session?.user?.email ?? '').toLowerCase() || null;
    } catch { /* offline: sigue sin usuario resuelto, se completa al sincronizar */ }

    creadoEnServidorRef.current = false;
    setPapeletaId(pid);
    papeletaIdRef.current = pid;
    setRev(revsConId);
    revRef.current = revsConId;
    setObs(observaciones);
    obsRef.current = observaciones;
    sinPapeletaRef.current = esSinPapeleta;
    datosRef.current = d;

    await persistirBorrador({ rev: revsConId, obs: observaciones, sinPapeleta: esSinPapeleta, datos: d });
  };

  const guardarReceptorDebounced = (nombre: string, rut: string) => {
    if (soloLectura || !papeletaIdRef.current) return;
    clearTimeout(receptorTimer.current);
    receptorTimer.current = setTimeout(() => {
      void persistirBorrador({ recNombre: nombre, recRut: rut });
    }, 300);
  };

  // Reconstruye ambienteSel / ambienteLibre a partir del ambiente guardado.
  const reconstruirAmbiente = (guardado: string | null, catalogo: Catalogo[]) => {
    const val = (guardado ?? '').trim();
    if (!val) return { sel: '', libre: '' };
    const match = catalogo.find(a => norm(a.nombre) === norm(val));
    return match ? { sel: match.nombre, libre: '' } : { sel: OTRO, libre: val };
  };

  // Reanuda un borrador EN_PROGRESO: primero intenta desde el borrador LOCAL
  // (IndexedDB) — funciona sin conexión y siempre trae lo último tecleado,
  // incluso si nunca llegó a reflejarse en Supabase. Si no hay copia local
  // (dispositivo distinto, reinstalación de la app), cae a Supabase como
  // respaldo — y de ahí en adelante ya queda protegido localmente también.
  const hidratarBorrador = async (pid: string, catalogo: Catalogo[]) => {
    setReanudando(true);
    try {
      const local = leerBorradorLocal(pid);

      // FIX: antes, si había copia local, se usaba SIEMPRE sin verificar el
      // servidor — un dispositivo que se quedó con un borrador viejo (por
      // ejemplo, de cuando la visita todavía estaba en progreso) la seguía
      // mostrando editable para siempre, aunque la visita ya se hubiera
      // finalizado o borrado desde otro lado. Se pregunta primero al
      // servidor (sin depender de la bandera `online`, que puede no estar
      // sincronizada exactamente en este punto del ciclo de vida — se deja
      // que el propio try/catch maneje el caso real de estar sin conexión):
      // si el servidor ya dice COMPLETADA, se descarta la copia local y se
      // entra en modo solo lectura de verdad, sin importar qué tenga
      // guardado este dispositivo.
      let estadoServidor: string | null = null;
      if (local) {
        try {
          const { data: chequeo } = await supabase
            .from(T_PAPELETA).select('estado').eq('id', pid).maybeSingle();
          estadoServidor = chequeo?.estado ?? null;
          console.log('[hidratarBorrador] estado local:', local.estado, '| estado servidor:', estadoServidor);
        } catch (e) {
          console.warn('[hidratarBorrador] No se pudo consultar el estado remoto:', e);
        }
      }

      // Si la copia local quedó marcada COMPLETADA (caso raro: normalmente
      // se borra al finalizar), se ignora y se cae al camino remoto de más
      // abajo, que sí arma el modo solo lectura correctamente.
      if (local && local.estado !== 'COMPLETADA' && estadoServidor !== 'COMPLETADA') {
        setSoloLectura(false); // corrige el flag optimista si venía mal desde la navegación
        creadoEnServidorRef.current = local.creadoEnServidor;
        usuarioIdRef.current = local.usuario_id;
        usuarioEmailRef.current = local.usuario_email;
        setSinPapeletaSync(local.sin_papeleta);
        setDatosSync({
          condominio: local.condominio ?? '', depto: String(local.depto_numero ?? ''), torre: local.torre_codigo ?? '',
          requerimiento: local.n_requerimiento ?? '', fechaRegistro: local.fecha_registro ?? '',
          fechaAtencion: local.fecha_atencion ?? '', horaAtencion: local.hora_atencion ?? '',
          formato: 'solicitud', // el borrador no persiste el formato de origen; no se usa tras la carga inicial
        });
        setRecNombreSync(local.receptor_nombre ?? '');
        setRecRutSync(local.receptor_rut ?? '');
        setPapeletaId(pid);
        papeletaIdRef.current = pid;

        setObs(local.filas.map((h, i) => ({
          numero: String(i + 1), ambiente: h.solicitud_ambiente ?? '', descripcion: h.solicitud_cliente ?? '',
        } as ObservacionPdf)));

        setRev(local.filas.map(h => {
          const a = reconstruirAmbiente(h.ambiente, catalogo);
          return {
            id: h.id,
            ambienteSel: a.sel, ambienteLibre: a.libre,
            observacion: h.observacion ?? '',
            partida: h.partida_afectada ?? '',
            causa: h.causa ?? '',
            estado: (h.estado ?? 'PENDIENTE') as RevisionObs['estado'],
            fotoAntes: h.foto_antes ?? null,
            fotoDespues: h.foto_despues ?? null,
            origen: h.origen as RevisionObs['origen'],
            solicitudCliente: h.solicitud_cliente ?? '',
          } as RevisionObs;
        }));

        setAbierta(0);
        setPaso('revision');
        setSaveState('saved');
        // Aprovecha para intentar ponerse al día con el servidor si hay señal.
        if (online) void sincronizarBorradorConServidor(local);
        sessionStorage.removeItem(RESUME_KEY);
        setReanudando(false);
        return;
      }

      // Sin copia local ÚTIL: reanudación desde otro dispositivo, app
      // reinstalada, o (FIX) la copia local que había quedó descartada
      // porque el servidor ya la tiene COMPLETADA — se purga acá para que
      // no siga estorbando en aperturas o sincronizaciones futuras.
      if (local && estadoServidor === 'COMPLETADA') {
        try { await eliminarBorradorLocal(pid); } catch {}
      }

      const { data: pap } = await supabase.from(T_PAPELETA).select('*').eq('id', pid).maybeSingle();
      if (!pap) { sessionStorage.removeItem(RESUME_KEY); setReanudando(false); return; }

      // Una visita ya COMPLETADA se muestra en modo solo lectura — nunca se
      // reabre para editar (no se crea/toca ningún borrador local, no se
      // sincroniza, no escucha tiempo real). Es un informe cerrado.
      const esVisitaCerrada = pap.estado === 'COMPLETADA';
      setSoloLectura(esVisitaCerrada);
      setCompletadaInfo({ fecha: pap.fecha_completada ?? null, firmaUrl: pap.receptor_firma_url ?? null });

      const { data: hijos } = await supabase.from(T_BORRADOR)
        .select('*').eq('papeleta_id', pid)
        .order('orden', { ascending: true }).order('created_at', { ascending: true });
      const filas = hijos ?? [];

      creadoEnServidorRef.current = true;
      usuarioIdRef.current = pap.usuario_id ?? null;
      usuarioEmailRef.current = pap.usuario_email ?? null;
      setSinPapeletaSync(!!pap.sin_papeleta);
      sinPapeletaRef.current = !!pap.sin_papeleta;
      const datosHidratados: DatosSolicitud = {
        condominio: pap.condominio ?? '', depto: pap.depto_numero ?? '', torre: pap.torre_codigo ?? '',
        requerimiento: pap.n_requerimiento ?? '', fechaRegistro: pap.fecha_registro ?? '',
        fechaAtencion: pap.fecha_atencion ?? '', horaAtencion: pap.hora_atencion ?? '',
        formato: 'solicitud', // el borrador guardado no persiste el formato de origen; no se usa tras la carga inicial
      };
      setDatosSync(datosHidratados);
      datosRef.current = datosHidratados;
      const recNombreHidratado = pap.receptor_nombre ?? '';
      const recRutHidratado = pap.receptor_rut ?? '';
      setRecNombreSync(recNombreHidratado);
      setRecRutSync(recRutHidratado);
      recNombreRef.current = recNombreHidratado;
      recRutRef.current = recRutHidratado;
      setPapeletaId(pid);
      papeletaIdRef.current = pid;

      const obsHidratados = filas.map((h: any, i: number) => ({
        numero: String(i + 1),
        ambiente: h.solicitud_ambiente ?? '',
        descripcion: h.solicitud_cliente ?? '',
      } as ObservacionPdf));
      setObs(obsHidratados);
      obsRef.current = obsHidratados;

      const revsHidratados = filas.map((h: any) => {
        const a = reconstruirAmbiente(h.ambiente, catalogo);
        return {
          id: h.id,
          ambienteSel: a.sel, ambienteLibre: a.libre,
          observacion: h.observacion ?? '',
          partida: h.partida_afectada ?? '',
          causa: h.causa ?? '',
          estado: (h.estado ?? 'PENDIENTE') as RevisionObs['estado'],
          fotoAntes: h.foto_antes ?? null,
          fotoDespues: h.foto_despues ?? null,
          origen: (h.origen ?? 'papeleta') as RevisionObs['origen'],
          solicitudCliente: h.solicitud_cliente ?? '',
        } as RevisionObs;
      });
      setRev(revsHidratados);
      revRef.current = revsHidratados;

      setAbierta(0);
      setPaso('revision');
      setSaveState('saved');

      // Una visita cerrada nunca crea ni toca un borrador local: no hay
      // nada que guardar, editar ni sincronizar. Solo se muestra.
      if (!esVisitaCerrada) {
        // A partir de ahora esta visita también queda protegida localmente.
        // FIX: se pasan los valores recién leídos de Supabase explícitos
        // (obs/datos/sinPapeleta/recNombre/recRut), en vez de dejar que
        // construirBorrador() use los refs — esos refs recién se actualizan en
        // un useEffect posterior al setDatos/setSinPapeleta/etc. de arriba, así
        // que en este punto todavía reflejan el valor ANTERIOR (vacío, en una
        // reanudación fresca). Sin este fix, el guardado local (y el upsert a
        // Supabase que dispara en segundo plano) se hacía con fecha_atencion
        // vacía, borrando silenciosamente la fecha recién creada — la
        // observación se seguía viendo bien en Detalle Depto, pero la papeleta
        // desaparecía del Calendario (que sí exige fecha_atencion).
        // FIX 2: el mismo problema afectaba a `obs` (obsRef.current seguía
        // vacío en este punto): al no pasarlo explícito, construirBorrador()
        // caía a obsRef.current vacío y escribía solicitud_cliente = null
        // para TODAS las filas apenas otra cuenta/dispositivo sin copia local
        // (ej. maestro_postventa) entraba a la visita — la observación del
        // cliente se veía bien un instante y luego se pisaba con null.
        await persistirBorrador({
          rev: revsHidratados,
          obs: obsHidratados,
          datos: datosHidratados,
          sinPapeleta: !!pap.sin_papeleta,
          recNombre: recNombreHidratado,
          recRut: recRutHidratado,
        });
      }
    } catch {
      setSaveState('error');
    }
    sessionStorage.removeItem(RESUME_KEY);
    setReanudando(false);
  };

  /* ------------------------------------------------------------------ */
  /*  Actualización en tiempo real                                       */
  /*                                                                      */
  /*  Si el profesional y el maestro tienen la MISMA visita abierta a la */
  /*  vez (cada uno en su dispositivo), cada uno edita campos DISTINTOS: */
  /*  el profesional ambiente/observación/partida/causa/fecha/hora, el   */
  /*  maestro fotos/receptor/estado. El riesgo real no es "quién escribe */
  /*  al final" — es que la próxima sincronización de UNO pise sin       */
  /*  querer el campo que el OTRO acaba de guardar, porque su copia      */
  /*  local todavía no se enteró del cambio ajeno (sincronizarBorrador-  */
  /*  ConServidor sube el borrador COMPLETO, no campo por campo). Por    */
  /*  eso acá se fusiona campo a campo lo que llega del servidor con lo  */
  /*  que ya hay en pantalla, en vez de reemplazar todo entero: así la   */
  /*  próxima vez que ESTE dispositivo sincronice (por su propia         */
  /*  edición), ya lleva también lo último que puso el otro.             */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!papeletaId || soloLectura) return;

    // Ventana de silencio: si hubo una edición local hace menos de esto,
    // se pospone la fusión en vez de aplicarla — evita pisar un tecleo en
    // curso con un valor más viejo que llega del servidor justo en ese
    // instante. No se pierde el cambio remoto, solo se retrasa unos
    // segundos hasta que la persona deje de escribir.
    const VENTANA_SILENCIO_MS = 2000;

    let debounceTimer: any = null;
    const refrescarDesdeServidor = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const desdeUltimaEdicion = Date.now() - ultimaEdicionLocalRef.current;
        if (desdeUltimaEdicion < VENTANA_SILENCIO_MS) {
          // Sigue "reciente": reintenta más tarde en vez de aplicar ahora.
          debounceTimer = setTimeout(refrescarDesdeServidor, VENTANA_SILENCIO_MS - desdeUltimaEdicion);
          return;
        }
        try {
          const [{ data: pap }, { data: filasRemotas }] = await Promise.all([
            supabase.from(T_PAPELETA).select('*').eq('id', papeletaId).maybeSingle(),
            supabase.from(T_BORRADOR).select('*').eq('papeleta_id', papeletaId)
              .order('orden', { ascending: true }).order('created_at', { ascending: true }),
          ]);
          if (!pap) return; // la visita se eliminó desde otro lado

          let cambioAlgo = false;

          // Fusión por fila: toma del servidor solo lo que haya cambiado,
          // preservando cualquier campo local que el servidor no traiga
          // (nunca debería pasar con columnas NOT NULL-ables normales, pero
          // el `?? r.campo` es la red de seguridad si algo llega vacío).
          const nextRev = revRef.current.map(r => {
            const remota = (filasRemotas ?? []).find((f: any) => f.id === r.id);
            if (!remota) return r;
            const a = reconstruirAmbiente(remota.ambiente, ambientes);
            // Se toma el valor del servidor tal cual, SIN "?? r.campo" de
            // respaldo: ese respaldo enmascaraba las eliminaciones (borrar
            // una foto también la deja en null, y `??` no distingue "sin
            // información nueva" de "se borró a propósito" — el valor viejo
            // local terminaba resucitando en el próximo guardado). La
            // ventana de silencio de más arriba ya protege una edición
            // local reciente; una vez que la fusión decide seguir, el
            // servidor manda.
            const fusionada: RevisionObs = {
              ...r,
              ambienteSel: a.sel,
              ambienteLibre: a.libre,
              observacion: remota.observacion ?? '',
              partida: remota.partida_afectada ?? '',
              causa: remota.causa ?? '',
              estado: (remota.estado ?? r.estado) as RevisionObs['estado'],
              fotoAntes: remota.foto_antes ?? null,
              fotoDespues: remota.foto_despues ?? null,
            };
            if (
              fusionada.ambienteSel !== r.ambienteSel || fusionada.ambienteLibre !== r.ambienteLibre ||
              fusionada.observacion !== r.observacion || fusionada.partida !== r.partida ||
              fusionada.causa !== r.causa || fusionada.estado !== r.estado ||
              fusionada.fotoAntes !== r.fotoAntes || fusionada.fotoDespues !== r.fotoDespues
            ) cambioAlgo = true;
            return fusionada;
          });

          // Filas nuevas creadas desde el otro dispositivo (ej. "Separar
          // otro problema" o "Agregar adicional") que acá todavía no existen.
          const idsLocales = new Set(nextRev.map(r => r.id));
          (filasRemotas ?? []).forEach((h: any) => {
            if (!h.id || idsLocales.has(h.id)) return;
            cambioAlgo = true;
            const a = reconstruirAmbiente(h.ambiente, ambientes);
            nextRev.push({
              id: h.id, ambienteSel: a.sel, ambienteLibre: a.libre,
              observacion: h.observacion ?? '', partida: h.partida_afectada ?? '',
              causa: h.causa ?? '', estado: (h.estado ?? 'PENDIENTE') as RevisionObs['estado'],
              fotoAntes: h.foto_antes ?? null, fotoDespues: h.foto_despues ?? null,
              origen: (h.origen ?? 'papeleta') as RevisionObs['origen'],
              solicitudCliente: h.solicitud_cliente ?? '',
            });
          });

          const recNombreFusionado = (pap.receptor_nombre ?? '') !== recNombreRef.current
            ? (pap.receptor_nombre ?? '') : recNombreRef.current;
          const recRutFusionado = (pap.receptor_rut ?? '') !== recRutRef.current
            ? (pap.receptor_rut ?? '') : recRutRef.current;
          if (recNombreFusionado !== recNombreRef.current || recRutFusionado !== recRutRef.current) cambioAlgo = true;

          const fechaFusionada = pap.fecha_atencion ?? '';
          const horaFusionada = pap.hora_atencion ?? '';
          if (fechaFusionada !== datosRef.current.fechaAtencion || horaFusionada !== datosRef.current.horaAtencion) cambioAlgo = true;

          if (!cambioAlgo) return;

          const datosFusionados = { ...datosRef.current, fechaAtencion: fechaFusionada, horaAtencion: horaFusionada };
          setRev(nextRev);
          setRecNombreSync(recNombreFusionado);
          setRecRutSync(recRutFusionado);
          setDatosSync(datosFusionados);

          // Guarda la fusión en el borrador local (IndexedDB) y reintenta
          // reflejarla en el servidor — ya con lo propio Y lo ajeno juntos,
          // para que la próxima sincronización de este dispositivo no pise
          // lo que el otro acaba de guardar. `false` = esto NO es una
          // edición local: no debe reiniciar la ventana de silencio, o dos
          // dispositivos fusionando en bucle nunca dejarían de posponerse
          // el uno al otro.
          void persistirBorrador({
            rev: nextRev, datos: datosFusionados,
            recNombre: recNombreFusionado, recRut: recRutFusionado,
          }, false);

          setActualizadoRemoto(true);
          setTimeout(() => setActualizadoRemoto(false), 2500);
        } catch {
          /* si falla el refresco, se mantiene lo que ya había en pantalla */
        }
      }, 400);
    };

    const canalPapeleta = supabase
      .channel(`postventa_papeleta_${papeletaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: T_PAPELETA, filter: `id=eq.${papeletaId}` }, refrescarDesdeServidor)
      .subscribe();

    const canalObs = supabase
      .channel(`postventa_obs_${papeletaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: T_BORRADOR, filter: `papeleta_id=eq.${papeletaId}` }, refrescarDesdeServidor)
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(canalPapeleta);
      supabase.removeChannel(canalObs);
    };
  }, [papeletaId, ambientes, soloLectura]);

  const seleccionarFoto = async (idx: number, tipo: 'antes' | 'despues', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let dataUrl: string;
    try {
      dataUrl = await blobToDataUrl(await comprimirImagen(file));
    } catch {
      dataUrl = await blobToDataUrl(file);
    }
    await setFotoYGuardar(idx, tipo, dataUrl);
  };

  const confirmarAnotacion = async (blob: Blob) => {
    if (!anotando) return;
    const { idx, tipo } = anotando;
    setAnotando(null);
    let dataUrl: string;
    try {
      const f = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      dataUrl = await blobToDataUrl(await comprimirImagen(f));
    } catch {
      dataUrl = await blobToDataUrl(blob);
    }
    await setFotoYGuardar(idx, tipo, dataUrl);
  };

  // Una observación queda lista con ambiente + comentario del inspector.
  // Las fotos son opcionales: hay casos donde no aplica reparación y solo se
  // deja constancia por escrito.
  const completa = (r: RevisionObs) =>
    !!ambienteFinal(r) && !!r.observacion.trim();

  const irAFirma = () => {
    if (soloLectura) return;
    if (desajuste && !desajusteOk) { setError('Confirma la advertencia sobre el departamento antes de continuar'); return; }

    if (esMaestro && !titular.id) {
      setError('Este proyecto no tiene un profesional titular de post venta configurado. Pide a un administrador que lo asigne en Admin → Proyectos.');
      return;
    }

    const faltante = rev.findIndex(r => !completa(r));
    if (faltante !== -1) {
      setError(
        esMaestro
          ? 'Esta visita tiene observaciones sin completar. Pídele al profesional que las termine antes de continuar.'
          : `Observación ${faltante + 1}: falta el ambiente o el comentario del inspector`
      );
      setAbierta(faltante);
      return;
    }
    if (!recNombre.trim() || !recRut.trim()) { setError('Nombre y RUT de quien recibe son obligatorios'); return; }
    setError('');
    setPaso('firma');
  };

  /* ---------- firma ---------- */
  useEffect(() => {
    if (paso !== 'firma') return;
    const timer = setTimeout(() => {
      const canvas = firmaCanvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d'); if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 2 * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setFirmaDataUrl(null);

      const prevent = (ev: TouchEvent) => ev.preventDefault();
      canvas.addEventListener('touchstart', prevent, { passive: false });
      canvas.addEventListener('touchmove', prevent, { passive: false });
      return () => {
        canvas.removeEventListener('touchstart', prevent);
        canvas.removeEventListener('touchmove', prevent);
      };
    }, 300);
    return () => clearTimeout(timer);
  }, [paso]);

  const getPos = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = firmaCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const iniciarDibujo = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault(); dibujandoRef.current = true;
    const ctx = firmaCanvasRef.current?.getContext('2d'); if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const dibujar = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    if (!dibujandoRef.current) return; e.preventDefault();
    const ctx = firmaCanvasRef.current?.getContext('2d'); if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const terminarDibujo = () => {
    dibujandoRef.current = false;
    const canvas = firmaCanvasRef.current;
    if (canvas) setFirmaDataUrl(canvas.toDataURL('image/png'));
  };
  const limpiarFirma = () => {
    const canvas = firmaCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    setFirmaDataUrl(null);
  };

  /* ---------- guardar ---------- */
  const finalizar = async () => {
    if (!firmaDataUrl) { setError('La firma de quien recibe es obligatoria'); return; }

    setGuardando(true); setError(''); setFinalizadoOffline(false);
    try {
      // Asegura que lo último tecleado quede persistido antes de cerrar.
      await flushGuardadoFilas();

      // ── Fotos que sigan locales: intento rápido, nunca bloquea ──
      // Antes, si una foto no había terminado de subirse a Storage (seguía
      // como data URL local), o se dejaba cerrar igual perdiéndola en
      // silencio (esto pasó de verdad con una visita real), o se bloqueaba
      // el cierre hasta que subiera — pero eso deja al maestro_postventa
      // esperando incómodo con el cliente ahí mismo, por algo que no tiene
      // ningún efecto visible para él en este momento (cerrar es solo un
      // cambio de estado interno, no genera nada físico todavía).
      //
      // Ahora: se intenta subir cada foto pendiente UNA vez, rápido — la
      // mayoría de las veces esto es invisible (1-2 segundos). Si alguna no
      // logra subir (sin señal, error puntual), se encola en
      // postventaFotosPendientes (Blob real a salvo en el dispositivo, cola
      // dedicada, no depende del borrador ni toca el estado de la visita) y
      // el ciclo de fondo de OfflineContext la reintenta sola después. El
      // cierre SIEMPRE continúa, tenga o no éxito este intento.
      const fotosParaEncolar: { filaId: string; tipo: 'antes' | 'despues'; dataUrl: string }[] = [];
      if (online) {
        const pendientesDeSubir = revRef.current
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => (r.fotoAntes?.startsWith('data:')) || (r.fotoDespues?.startsWith('data:')));

        for (const { r, i } of pendientesDeSubir) {
          let next = revRef.current;
          if (r.fotoAntes?.startsWith('data:')) {
            try {
              const url = await subirFotoBorrador(r.fotoAntes);
              next = next.map((x, j) => (j === i ? { ...x, fotoAntes: url } : x));
              if (r.id) await supabase.from(T_BORRADOR).update({ foto_antes: url }).eq('id', r.id);
            } catch {
              if (r.id) fotosParaEncolar.push({ filaId: r.id, tipo: 'antes', dataUrl: r.fotoAntes });
            }
          }
          if (r.fotoDespues?.startsWith('data:')) {
            try {
              const url = await subirFotoBorrador(r.fotoDespues);
              next = next.map((x, j) => (j === i ? { ...x, fotoDespues: url } : x));
              if (r.id) await supabase.from(T_BORRADOR).update({ foto_despues: url }).eq('id', r.id);
            } catch {
              if (r.id) fotosParaEncolar.push({ filaId: r.id, tipo: 'despues', dataUrl: r.fotoDespues });
            }
          }
          revRef.current = next;
          setRev(next);
        }
      } else {
        // Sin conexión: ni se intenta, se encola directo.
        for (const r of revRef.current) {
          if (!r.id) continue;
          if (r.fotoAntes?.startsWith('data:')) fotosParaEncolar.push({ filaId: r.id, tipo: 'antes', dataUrl: r.fotoAntes });
          if (r.fotoDespues?.startsWith('data:')) fotosParaEncolar.push({ filaId: r.id, tipo: 'despues', dataUrl: r.fotoDespues });
        }
      }

      if (papeletaId) {
        for (const f of fotosParaEncolar) {
          try { await encolarFotoPendiente(papeletaId, f.filaId, f.tipo, f.dataUrl); }
          catch (e) { console.error('[PostVenta] No se pudo encolar foto pendiente:', e); }
        }
      }

      // FIX: se borra el borrador LOCAL acá, ANTES de escribir en el
      // servidor (no al final, como antes). Mientras el borrador siguiera
      // existiendo localmente marcado EN_PROGRESO, el ciclo de
      // sincronización de fondo de OfflineContext podía correr justo en esa
      // ventana y volver a subir estado: 'EN_PROGRESO' — pisando el estado:
      // 'COMPLETADA' que este mismo finalizar() recién había escrito (sin
      // tocar fecha_completada/firma, que esa sincronización de fondo no
      // incluye en su payload — por eso esos campos quedaban bien pero el
      // estado se resucitaba solo). Si más abajo el guardado termina yendo
      // por la cola offline, esa cola (postventaOfflineQueue, un store
      // IndexedDB aparte) igual completa el cierre correctamente — no
      // depende de este borrador de avance. Las fotos que hayan quedado
      // pendientes ya están a salvo en su propia cola (arriba), así que
      // borrar este borrador general no les afecta.
      if (papeletaId) await eliminarBorradorLocal(papeletaId);

      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;
      if (!user?.id) throw new Error('No se pudo identificar el usuario');

      // Si un maestro_postventa cierra la visita, el informe y la papeleta
      // quedan a nombre del profesional titular de post venta del proyecto
      // (Admin → Proyectos), no de quien tomó las fotos y la firma.
      // irAFirma() ya bloqueó el avance si no hay titular configurado, así
      // que acá titular.id siempre existe cuando esMaestro es true. Como
      // `filas` lleva estos 3 campos, la atribución queda correcta tanto si
      // el guardado sale online como si termina encolado offline (ver
      // flushColaPostventa en postventaOfflineQueue.ts, que reconstruye la
      // papeleta leyendo estos mismos campos de la primera fila).
      const attribUserId = (esMaestro && titular.id) ? titular.id : user.id;
      const attribUserEmail = (esMaestro && titular.id) ? (titular.email ?? '') : (user.email ?? '').toLowerCase();
      const attribUserNombre = (esMaestro && titular.id) ? (titular.nombre ?? '') : inspectorNombre;

      // La fecha de atención es la fecha real de la visita, no el día en que se
      // carga la papeleta. La semana VAIN se calcula desde ahí, no desde hoy.
      const fechaVisita = fechaDesdeDdMmAaaa(datos.fechaAtencion) ?? new Date();
      const fechaCreacion = fechaVisita.toISOString();
      const semanaCreacion = nombreSemana(fechaVisita);

      if (!semanaCreacion) {
        console.warn('Fecha fuera del calendario de semanas VAIN:', datos.fechaAtencion);
      }

      // Blob de la firma, listo para subir a Storage o para guardar en la cola
      // offline si no hay (o se pierde) la conexión.
      const firmaBlobLocal = await fetch(firmaDataUrl).then(r => r.blob());

      // Firma → storage. Solo se intenta si hay conexión; si falla o estamos
      // offline, el Blob local se guarda en la cola y se sube al reconectar
      // (mientras tanto, el PDF de abajo ya la incluye embebida igual).
      let firmaUrl: string | null = null;
      if (online && firmaBlobLocal.size > 0) {
        try {
          const nombre = `firma_pv_${depto.id}_${Date.now()}.png`;
          const { error: upErr } = await supabase.storage
            .from('fotos-registros')
            .upload(`firmas/${nombre}`, firmaBlobLocal, { contentType: 'image/png', upsert: true });
          if (!upErr) {
            firmaUrl = supabase.storage.from('fotos-registros').getPublicUrl(`firmas/${nombre}`).data.publicUrl;
          }
        } catch { /* se reintenta en la cola offline más abajo */ }
      }

      // Los datos del propietario NO se repiten acá: viven en `departamentos`
      // y se alcanzan por departamento_id. Lo que sí es propio de esta visita
      // es quien la recibió y su firma.
      const filas = obs.map((o, i) => {
        const esAdicional = rev[i].origen === 'adicional';
        return {
          proyecto_id: proyecto.id,
          proyecto_codigo: proyectoCodigo || '',
          torre_codigo: torre.nombre,
          depto_numero: depto.numero,
          departamento_id: depto.id,
          tipo: 'PV' as const,
          estado: rev[i].estado,
          // Trabajo no registrado en la papeleta → sin número de requerimiento.
          n_requerimiento: (sinPapeleta || esAdicional) ? null : (datos.requerimiento || null),
          // Sin solicitud del cliente para urgencias y trabajos adicionales.
          // Las derivadas heredan la descripción del padre (viene en o.descripcion).
          solicitud_cliente: (sinPapeleta || esAdicional) ? null : rev[i].solicitudCliente,
          observacion: rev[i].observacion.trim(),
          ambiente: ambienteFinal(rev[i]),
          partida_afectada: rev[i].partida || null,
          causa: rev[i].causa || null,
          receptor_nombre: recNombre.trim(),
          receptor_rut: recRut.trim(),
          receptor_firma_url: firmaUrl,
          usuario_id: attribUserId,
          usuario_email: attribUserEmail,
          usuario_nombre: attribUserNombre || null,
          fecha_creacion: fechaCreacion,
          semana_creacion: semanaCreacion,
        };
      });

      // NOTA: el PDF ya NO se genera acá. Antes se generaba en este mismo
      // instante, embebiendo lo que hubiera en memoria en ese momento — si
      // algo no había terminado de subirse (ver validación de fotos más
      // arriba) o el maestro_postventa escribía algo apurado, el PDF podía
      // quedar con datos a medias sin que nadie lo notara hasta después.
      // Ahora el maestro_postventa solo CIERRA (firma + fotos ya validadas
      // arriba); el PDF se genera como acción separada, más tarde, desde la
      // vista de solo lectura (ver generarInformePdf) — típicamente por el
      // profesional en oficina, leyendo datos ya confirmados en el servidor.
      // Antes, si esto fallaba por falta de señal, toda la visita (incluida
      // la firma ya capturada) se perdía con un error en pantalla. Ahora, si
      // no hay conexión o la subida falla, se encola completa en el
      // dispositivo y se sincroniza sola al reconectar.
      let guardadoOnline = false;
      if (online) {
        try {
          const { error: insErr } = await supabase.from('observacionesinformepv').insert(filas);
          if (insErr) throw new Error(insErr.message);

          // Cierra el borrador: la visita queda COMPLETADA y deja de aparecer
          // como "en progreso" en DetalleDepto.
          //
          // FIX: antes esto era un .update(), que asume que la fila de
          // postventa_papeletas ya existe. Con el borrador local-first, esa
          // fila solo se crea cuando el sync de fondo (sincronizarBorradorConServidor)
          // logra conectarse — si la visita fue corta y con señal débil todo
          // el tiempo, esa fila puede NO existir todavía al momento de
          // finalizar. Un update sobre una fila inexistente no da error, pero
          // tampoco crea nada: las observaciones quedaban guardadas, pero la
          // papeleta (de la que depende el Calendario) nunca aparecía.
          // Un upsert con el payload COMPLETO garantiza que la fila exista sí
          // o sí, la haya creado antes el sync de fondo o no.
          if (papeletaId) {
            const borradorActual = construirBorrador();
            const { error: errPap } = await supabase.from(T_PAPELETA).upsert({
              id: papeletaId,
              proyecto_id: borradorActual?.proyecto_id ?? proyecto.id,
              proyecto_codigo: borradorActual?.proyecto_codigo ?? (proyectoCodigo || proyecto.codigo || null),
              torre_codigo: borradorActual?.torre_codigo ?? torre.nombre,
              depto_numero: borradorActual?.depto_numero ?? depto.numero,
              departamento_id: depto.id,
              sin_papeleta: borradorActual?.sin_papeleta ?? sinPapeleta,
              n_requerimiento: borradorActual?.n_requerimiento ?? (sinPapeleta ? null : (datos.requerimiento || null)),
              fecha_registro: borradorActual?.fecha_registro ?? (datos.fechaRegistro || null),
              fecha_atencion: borradorActual?.fecha_atencion ?? (datos.fechaAtencion || null),
              hora_atencion: borradorActual?.hora_atencion ?? (datos.horaAtencion || null),
              condominio: borradorActual?.condominio ?? (datos.condominio || null),
              usuario_id: esMaestro ? attribUserId : (borradorActual?.usuario_id ?? attribUserId),
              usuario_email: esMaestro ? attribUserEmail : (borradorActual?.usuario_email ?? attribUserEmail),
              usuario_nombre: esMaestro ? (attribUserNombre || null) : (borradorActual?.usuario_nombre ?? (attribUserNombre || null)),
              estado: 'COMPLETADA',
              fecha_completada: new Date().toISOString(),
              receptor_nombre: recNombre.trim() || null,
              receptor_rut: recRut.trim() || null,
              receptor_firma_url: firmaUrl,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
            if (errPap) throw new Error(errPap.message);
          }
          guardadoOnline = true;
        } catch (e) {
          console.warn('[PostVenta] No se pudo guardar en el servidor, se encola offline:', e);
        }
      }

      if (!guardadoOnline) {
        // Si la firma ya se subió a Storage (firmaUrl no es null) no hace
        // falta reintentar la subida del Blob; si no, se sube al sincronizar.
        // Se agregan los campos de cabecera de la papeleta a cada fila (la
        // cola los necesita para poder recrear postventa_papeletas completa
        // si esa fila nunca llegó a existir en el servidor — ver
        // flushColaPostventa en postventaOfflineQueue.ts).
        const filasParaCola = filas.map(f => ({
          ...f,
          sin_papeleta: sinPapeleta,
          fecha_registro: datos.fechaRegistro || null,
          fecha_atencion: datos.fechaAtencion || null,
          hora_atencion: datos.horaAtencion || null,
          condominio: datos.condominio || null,
        }));
        await encolarFinalizacionPostventa(papeletaId, filasParaCola, firmaUrl ? null : firmaBlobLocal);
        setFinalizadoOffline(true);
      }

      // El borrador local ya se eliminó al principio de esta función (ver
      // FIX más arriba) — la visita queda cerrada en el servidor o en la
      // cola de finalización offline, que la lleva completa.
      //
      // En vez de la pantalla transitoria + reiniciar() de antes, se pasa
      // directo a modo SOLO LECTURA: el maestro_postventa ve de inmediato
      // la confirmación de cierre con la firma ya capturada, en la misma
      // pantalla — sin necesidad de generar el PDF ahora (eso lo hace
      // después el profesional, ver generarInformePdf). Si quedó encolado
      // offline, se usa firmaDataUrl (local) para mostrarla igual mientras
      // no haya subido; el banner de abajo avisa que sigue pendiente.
      setCompletadaInfo({ fecha: new Date().toISOString(), firmaUrl: firmaUrl ?? firmaDataUrl });
      setSoloLectura(true);
      setPaso('revision');
    } catch (e: any) {
      setError('Error: ' + (e?.message ?? 'desconocido'));
    }
    setGuardando(false);
  };

  // ── Generar el informe PDF — acción SEPARADA del cierre ──
  // Pensada para el profesional, desde la vista de solo lectura de una
  // visita ya COMPLETADA: lee lo que ya está confirmado en el servidor
  // (rev/obs, hidratados por hidratarBorrador) en vez de lo que hubiera en
  // memoria al momento de cerrar. Puede llamarse las veces que haga falta
  // (por ejemplo, para regenerar el informe después de una corrección).
  const generarInformePdf = async () => {
    setGenerandoPdf(true); setErrorPdf('');
    try {
      if (!completadaInfo.firmaUrl) {
        throw new Error('No se encontró la firma de esta visita. No se puede generar el informe sin ella.');
      }
      const fotosAntes = await Promise.all(rev.map(r => (r.fotoAntes ? urlADataUrl(r.fotoAntes) : Promise.resolve(undefined))));
      const fotosDespues = await Promise.all(rev.map(r => (r.fotoDespues ? urlADataUrl(r.fotoDespues) : Promise.resolve(undefined))));

      const fechaVisita = fechaDesdeDdMmAaaa(datos.fechaAtencion) ?? new Date();

      const pdfBlob = await generatePdfPostventa({
        proyecto: proyecto.nombre || datos.condominio,
        torre: torre.nombre,
        depto: String(depto.numero),
        nRequerimiento: datos.requerimiento,
        fechaAtencion: datos.fechaAtencion,
        horaAtencion: datos.horaAtencion,
        revisor: inspectorNombre,
        receptorNombre: recNombre.trim(),
        receptorRut: recRut.trim(),
        observaciones: obs.map((o, i) => ({
          numero: String(i + 1),
          ambiente: ambienteFinal(rev[i]),
          solicitudCliente: (sinPapeleta || rev[i].origen === 'adicional') ? '' : rev[i].solicitudCliente,
          observacion: rev[i].observacion.trim(),
          partida: rev[i].partida || undefined,
          causa: rev[i].causa || undefined,
          estado: rev[i].estado,
          fotoAntes: fotosAntes[i],
          fotoDespues: fotosDespues[i],
        })),
        firmaDataUrl: completadaInfo.firmaUrl,
        fecha: fechaVisita,
      });

      const fileName = `PostVenta_${torre.nombre}_${depto.numero}_${datos.requerimiento || Date.now()}.pdf`;
      await guardarPdfBlob(pdfBlob, fileName, `Post venta · Torre ${torre.nombre} · Depto ${depto.numero}`);
    } catch (e: any) {
      setErrorPdf('No se pudo generar el informe: ' + (e?.message ?? 'error desconocido'));
    }
    setGenerandoPdf(false);
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  const errorBox = error ? (
    <div style={{
      color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12,
      background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px',
      borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca',
    }}>{error}</div>
  ) : null;

  const metaChip = (label: string, valor: string) => (
    <div style={{
      background: dark ? '#16233B' : '#f8fafc', border: `0.5px solid ${border}`,
      borderRadius: 10, padding: '6px 10px', flex: '1 1 auto', minWidth: 96,
    }}>
      <div style={{ fontSize: 8, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{valor || '—'}</div>
    </div>
  );

  const metaChipEditable = (label: string, input: React.ReactNode) => (
    <div style={{
      background: dark ? '#16233B' : '#f8fafc', border: `0.5px solid ${border}`,
      borderRadius: 10, padding: '6px 10px', flex: '1 1 auto', minWidth: 96,
    }}>
      <div style={{ fontSize: 8, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {input}
    </div>
  );

  const inputMetaStyle: React.CSSProperties = {
    width: '100%', background: 'transparent', border: 'none', outline: 'none',
    fontSize: 12, color: textPrimary, fontWeight: 600, padding: 0,
  };

  /** "DD-MM-YYYY" o "DD/MM/YYYY" -> "YYYY-MM-DD" (lo que exige <input type="date">). '' si no calza. */
  const fechaTextoAIso = (texto: string): string => {
    const m = (texto || '').trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (!m) return '';
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  };
  /** "YYYY-MM-DD" -> "DD-MM-YYYY" (formato de guardado, consistente con la plantilla nueva). */
  const isoAFechaTexto = (iso: string): string => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const [, y, mo, d] = m;
    return `${d}-${mo}-${y}`;
  };

  // Fecha/hora de atención editable, con guardado local-first (nunca se
  // pierde sin conexión) — usa el mismo camino que cualquier otra edición
  // de esta pantalla (persistirBorrador). Como datosRef ya quedó
  // sincronizado en el mismo tick por setDatosSync (ver más arriba), esta
  // llamada sin overrides es segura: NO reproduce el bug histórico de
  // "fecha_atencion se pone null sola" (ver comentario junto a los *Sync).
  const fechaHoraTimer = useRef<any>(null);
  const guardarFechaHoraDebounced = () => {
    if (esMaestro || soloLectura) return;
    clearTimeout(fechaHoraTimer.current);
    fechaHoraTimer.current = setTimeout(() => { void persistirBorrador(); }, 700);
  };

  const tarjetaDepto = (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 14, background: dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#fff' }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12,
        background: dark ? 'linear-gradient(135deg, #1E2E4A, #243550)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
        border: dark ? '0.5px solid #2E4468' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color: dark ? '#8296B0' : '#fff', flexShrink: 0,
      }}>{depto?.numero}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: accent, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
          {proyecto?.nombre}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>
          Torre {torre?.nombre} · Depto {depto?.numero}
        </div>
        <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
          {datos.requerimiento
            ? `Requerimiento N° ${datos.requerimiento}`
            : (propietario.nombre || 'Propietario sin registrar')}
        </div>
      </div>
      {obs.length > 0 && (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1 }}>{obs.length}</div>
          <div style={{ fontSize: 9, color: textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '1px' }}>obs</div>
        </div>
      )}
    </div>
  );

  const fotoSlot = (idx: number, tipo: 'antes' | 'despues') => {
    const src = tipo === 'antes' ? rev[idx].fotoAntes : rev[idx].fotoDespues;
    return (
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>{tipo === 'antes' ? 'antes' : 'después'}</label>
        {src ? (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <img src={src} onClick={() => setFotoAmpliada({ idx, tipo, src })}
              style={{ width: '100%', borderRadius: 12, maxHeight: 160, objectFit: 'cover', display: 'block', cursor: 'pointer' }} />
            {!soloLectura && (
              <>
                <button onClick={() => setAnotando({ idx, tipo, src })}
                  style={{ position: 'absolute', top: 6, right: 40, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 26, height: 26, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={13} strokeWidth={2.25} /></button>
                <button onClick={() => setFotoYGuardar(idx, tipo, null)}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 26, height: 26, color: '#fff', fontSize: 15, cursor: 'pointer' }}>×</button>
              </>
            )}
          </div>
        ) : soloLectura ? (
          <div style={{
            height: 80, borderRadius: 12, border: `0.5px dashed ${border}`, marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: textMuted, fontSize: 10,
          }}>
            Sin foto
          </div>
        ) : (
          <div style={{
            display: 'flex', gap: 8, marginBottom: 12,
          }}>
            {/* Cámara: fuerza captura en el momento */}
            <label style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: 80, borderRadius: 12, border: `0.5px dashed ${border}`,
              cursor: 'pointer', color: textMuted, gap: 4, background: dark ? 'transparent' : '#f8fafc',
            }}>
              <Camera size={20} strokeWidth={1.75} />
              <span style={{ fontSize: 10 }}>Cámara</span>
              <input type="file" accept="image/*" capture="environment"
                onChange={e => seleccionarFoto(idx, tipo, e)} style={{ display: 'none' }} />
            </label>
            {/* Galería: sin capture, deja elegir fotos existentes */}
            <label style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: 80, borderRadius: 12, border: `0.5px dashed ${border}`,
              cursor: 'pointer', color: textMuted, gap: 4, background: dark ? 'transparent' : '#f8fafc',
            }}>
              <ImageIcon size={20} strokeWidth={1.75} />
              <span style={{ fontSize: 10 }}>Galería</span>
              <input type="file" accept="image/*"
                onChange={e => seleccionarFoto(idx, tipo, e)} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>
    );
  };

  /* ---------- sin contexto de departamento ---------- */
  if (!tieneContexto) {
    return (
      <IonPage id="main-content">
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' } as any}>
            <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#5D728F' : 'rgba(255,255,255,0.7)' } as any}
              onClick={() => history.push('/dashboard')}>← Volver</IonButton>
            <IonTitle style={{ fontSize: 14, fontWeight: 600 }}>POST VENTA</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg } as any}>
          <div style={{ padding: 24, textAlign: 'center', marginTop: 60 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: textMuted }}>
              <Home size={40} strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 8 }}>
              Falta el departamento
            </div>
            <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
              Esta sección se abre desde el detalle de un departamento, para tomar de ahí el
              proyecto, la torre y los datos del propietario.
            </div>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' } as any}>
          <IonButton slot="start" fill="clear"
            style={{ '--color': dark ? '#5D728F' : 'rgba(255,255,255,0.7)' } as any}
            onClick={() => (paso === 'carga' ? salir() : paso === 'firma' ? setPaso('revision') : reiniciar())}>
            ← Volver
          </IonButton>
          <IonTitle style={{ fontSize: 14, fontWeight: 600 }}>
            POST VENTA · TORRE {torre?.nombre} · {depto?.numero}
          </IonTitle>
          <div slot="end" style={{ paddingRight: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            {!soloLectura && (paso === 'revision' || paso === 'firma') && saveState !== 'idle' && (
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.3px',
                color: saveState === 'error' ? '#fca5a5' : 'rgba(255,255,255,0.72)' }}>
                {saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>Guardado <Check size={12} strokeWidth={2.5} /></span>
                ) : 'Sin guardar'}
              </span>
            )}
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : '#fbbf24' }} />
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16 }}>

          {actualizadoRemoto && paso === 'revision' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              background: dark ? 'rgba(96,165,250,0.08)' : '#eff6ff',
              border: `0.5px solid ${dark ? 'rgba(96,165,250,0.25)' : '#bfdbfe'}`,
              borderRadius: 10, padding: '8px 12px',
              fontSize: 11, color: dark ? '#93c5fd' : '#1d4ed8',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={13} strokeWidth={2} />
                Se actualizó con cambios de otra sesión
              </span>
            </div>
          )}

          {/* ============ PASO 1 · CARGA ============ */}
          {paso === 'carga' && (
            loading ? (
              <div style={{ textAlign: 'center', marginTop: 80 }}>
                <IonSpinner name="crescent" />
                {reanudando && (
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 12 }}>Reanudando visita…</div>
                )}
              </div>
            ) : (
              <>
                {tarjetaDepto}

                {!esMaestro && (
                  <>
                    <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Cargar papeleta</div>
                    <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

                    <div style={cardStyle}>
                      {errorBox}

                      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf"
                        onChange={seleccionarPdf} style={{ display: 'none' }} />

                      <button onClick={() => fileInputRef.current?.click()}
                        disabled={leyendo} style={btnPrimary(leyendo)}>
                        {leyendo ? 'Leyendo PDF...' : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <FileText size={17} strokeWidth={2} /> Seleccionar papeleta PDF
                          </span>
                        )}
                      </button>

                      <div style={{ fontSize: 11, color: textMuted, marginTop: 10, lineHeight: 1.4 }}>
                        Se verifica que la papeleta corresponda a este departamento y se extraen
                        fechas, horario y el listado de requerimientos del cliente.
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 16px' }}>
                      <div style={{ flex: 1, height: '0.5px', background: sepLine }} />
                      <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>o</div>
                      <div style={{ flex: 1, height: '0.5px', background: sepLine }} />
                    </div>
                  </>
                )}

                {esMaestro && errorBox}

                <div style={cardStyle}>
                  <button onClick={iniciarSinPapeleta} disabled={leyendo} style={btnGhost}>
                      Visita sin papeleta 
                  </button>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 10, lineHeight: 1.4 }}>
                    Para trabajos necesarios no agendados
                    (fotos, receptor, firma e informe)
                  </div>
                </div>
              </>
            )
          )}

          {/* ============ PASO 2 · REVISIÓN ============ */}
          {paso === 'revision' && (
            <>
              {desajuste && (
                <div style={{
                  background: dark ? 'rgba(251,191,36,0.07)' : '#fffbeb',
                  border: `0.5px solid ${dark ? 'rgba(251,191,36,0.25)' : '#fde68a'}`,
                  borderRadius: 12, padding: 14, marginBottom: 12,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: dark ? '#fbbf24' : '#92400e', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={15} strokeWidth={2.25} /> La papeleta no coincide
                  </div>
                  <div style={{ fontSize: 12, color: dark ? '#fbbf24' : '#92400e', lineHeight: 1.5, marginBottom: 10 }}>
                    {desajuste}. Las observaciones se guardarán en la Torre {torre?.nombre} · Depto {depto?.numero}.
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: dark ? '#fbbf24' : '#92400e', cursor: 'pointer' }}>
                    <input type="checkbox" checked={desajusteOk} onChange={e => setDesajusteOk(e.target.checked)} />
                    Entiendo y quiero continuar igual
                  </label>
                </div>
              )}

              {tarjetaDepto}

              {soloLectura && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
                  background: finalizadoOffline
                    ? (dark ? 'rgba(251,191,36,0.06)' : '#fffbeb')
                    : (dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4'),
                  border: `0.5px solid ${finalizadoOffline
                    ? (dark ? 'rgba(251,191,36,0.3)' : '#fde68a')
                    : (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0')}`,
                  borderRadius: 10, padding: '10px 12px',
                  fontSize: 12, fontWeight: 600,
                  color: finalizadoOffline ? (dark ? '#fbbf24' : '#92400e') : (dark ? '#4ade80' : '#15803d'),
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {finalizadoOffline ? <WifiOff size={14} strokeWidth={2.25} /> : <CheckCircle2 size={14} strokeWidth={2.25} />}
                    {finalizadoOffline ? 'Guardado en el dispositivo — pendiente de sincronizar' : 'Visita completada'}
                  </span>
                  {completadaInfo.fecha && (
                    <span style={{ fontWeight: 400, color: textMuted, fontSize: 11 }}>
                      · {new Date(completadaInfo.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              )}

              {!sinPapeleta && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {metaChip('registro', datos.fechaRegistro)}
                  {(esMaestro || soloLectura) ? (
                    <>
                      {metaChip('atención', datos.fechaAtencion)}
                      {metaChip('horario', datos.horaAtencion)}
                    </>
                  ) : (
                    <>
                      {metaChipEditable('atención', (
                        <input
                          type="date"
                          value={fechaTextoAIso(datos.fechaAtencion)}
                          onChange={e => {
                            const nueva = isoAFechaTexto(e.target.value);
                            setDatosSync(d => ({ ...d, fechaAtencion: nueva }));
                            guardarFechaHoraDebounced();
                          }}
                          style={inputMetaStyle}
                        />
                      ))}
                      {metaChipEditable('horario', (
                        <input
                          type="text"
                          value={datos.horaAtencion}
                          placeholder="Ej: 10:30"
                          onChange={e => {
                            const nueva = e.target.value;
                            setDatosSync(d => ({ ...d, horaAtencion: nueva }));
                            guardarFechaHoraDebounced();
                          }}
                          style={inputMetaStyle}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}

              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: dark ? 'rgba(74,222,128,0.05)' : '#f0fdf4',
                border: `0.5px solid ${dark ? 'rgba(74,222,128,0.15)' : '#bbf7d0'}`,
                borderRadius: 10, padding: '8px 12px', marginBottom: 16,
                fontSize: 11, color: dark ? '#4ade80' : '#15803d', lineHeight: 1.4,
              }}>
                <Save size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
                Esta visita se guarda sola. Puedes cerrar la app y retomarla más
                tarde desde el detalle del departamento.
              </div>

              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>
                {sinPapeleta ? 'Observaciones' : 'Requerimientos del cliente'}
              </div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

              {obs.map((o, idx) => {
                const r = rev[idx];
                const ok = completa(r);
                const open = abierta === idx;
                const amb = ambienteFinal(r);
                return (
                  <div key={idx} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                    <div onClick={() => setAbierta(open ? null : idx)}
                      style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: ok ? (dark ? 'rgba(74,222,128,0.12)' : '#dcfce7') : (dark ? '#1B2C48' : '#f1f5f9'),
                        border: `0.5px solid ${ok ? (dark ? 'rgba(74,222,128,0.3)' : '#bbf7d0') : border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        color: ok ? (dark ? '#4ade80' : '#15803d') : textMuted,
                      }}>{ok ? <Check size={14} strokeWidth={2.75} /> : (r.origen === 'adicional' ? '+' : idx + 1)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: amb ? textPrimary : textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {amb || 'Elegir ambiente'}
                          {r.origen === 'derivada' && (
                            <span style={{ fontSize: 8, fontWeight: 700, color: accent, background: dark ? 'rgba(96,165,250,0.12)' : '#eff6ff', border: `0.5px solid ${dark ? 'rgba(96,165,250,0.25)' : '#bfdbfe'}`, borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>derivada</span>
                          )}
                          {r.origen === 'adicional' && !sinPapeleta && (
                            <span style={{ fontSize: 8, fontWeight: 700, color: dark ? '#fbbf24' : '#92400e', background: dark ? 'rgba(251,191,36,0.1)' : '#fffbeb', border: `0.5px solid ${dark ? 'rgba(251,191,36,0.25)' : '#fde68a'}`, borderRadius: 6, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>adicional</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(sinPapeleta || r.origen === 'adicional')
                            ? (r.observacion.trim() || 'Sin descripción aún')
                            : (r.solicitudCliente || 'Sin descripción')}
                        </div>
                      </div>
                      {!esMaestro && !soloLectura && (sinPapeleta || r.origen === 'derivada' || r.origen === 'adicional') && obs.length > 1 && (
                        <button onClick={e => { e.stopPropagation(); quitarObs(idx); }}
                          style={{ background: 'transparent', border: 'none', color: textMuted, fontSize: 18, cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>×</button>
                      )}
                      <div style={{ color: textMuted, fontSize: 12, flexShrink: 0 }}>{open ? '▲' : '▼'}</div>
                    </div>

                    {open && (
                      <div style={{ padding: '0 14px 14px' }}>
                        <div style={{ height: '0.5px', background: sepLine, marginBottom: 14 }} />

                        {!sinPapeleta && r.origen !== 'adicional' && (
                          <>
                            <label style={labelStyle}>
                              solicitud del cliente{r.origen === 'derivada' ? ' (compartida)' : ''}
                            </label>
                            <div style={{
                              background: dark ? 'rgba(96,165,250,0.05)' : '#eff6ff',
                              border: `0.5px solid ${dark ? 'rgba(96,165,250,0.15)' : '#bfdbfe'}`,
                              borderRadius: 10, padding: '10px 12px', marginBottom: 6,
                              fontSize: 13, lineHeight: 1.5, color: textPrimary,
                            }}>{r.solicitudCliente || 'Sin descripción'}</div>
                            <div style={{ fontSize: 10, color: textMuted, marginBottom: 14 }}>
                              Ubicación indicada por el cliente: <strong>{o.ambiente || '—'}</strong>
                            </div>
                          </>
                        )}

                        {!sinPapeleta && r.origen === 'adicional' && (
                          <div style={{
                            background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb',
                            border: `0.5px solid ${dark ? 'rgba(251,191,36,0.2)' : '#fde68a'}`,
                            borderRadius: 10, padding: '8px 12px', marginBottom: 14,
                            fontSize: 11, color: dark ? '#fbbf24' : '#92400e', lineHeight: 1.4,
                          }}>
                            Trabajo adicional no registrado en la papeleta. Se guardará sin solicitud del cliente.
                          </div>
                        )}

                        {(esMaestro || soloLectura) ? (
                          <>
                            <label style={labelStyle}>ambiente</label>
                            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: ambienteFinal(r) ? textPrimary : textMuted }}>
                              {ambienteFinal(r) || '— sin definir por el profesional —'}
                            </div>

                            <label style={labelStyle}>observación del inspector</label>
                            <div style={{ ...taStyle, display: 'flex', alignItems: 'flex-start', color: r.observacion ? textPrimary : textMuted, whiteSpace: 'pre-wrap' }}>
                              {r.observacion || '— sin definir por el profesional —'}
                            </div>

                            {r.partida && (
                              <>
                                <label style={labelStyle}>partida afectada</label>
                                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: textPrimary }}>{r.partida}</div>
                              </>
                            )}
                            {r.causa && (
                              <>
                                <label style={labelStyle}>causa</label>
                                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: textPrimary }}>{r.causa}</div>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <label style={labelStyle}>ambiente *</label>
                            <select value={r.ambienteSel} onChange={e => setCampo(idx, 'ambienteSel', e.target.value)} style={inputStyle}>
                              <option value="">Seleccionar ambiente...</option>
                              {ambientes.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                              <option value={OTRO}>Otro (especificar)...</option>
                            </select>
                            {r.ambienteSel === OTRO && (
                              <input value={r.ambienteLibre}
                                onChange={e => setCampo(idx, 'ambienteLibre', e.target.value.toUpperCase())}
                                placeholder="EJ: ESTACIONAMIENTO 12, BODEGA, FACHADA" style={inputStyle} />
                            )}

                            <label style={labelStyle}>observación del inspector *</label>
                            <textarea value={r.observacion} onChange={e => setCampo(idx, 'observacion', e.target.value)}
                              placeholder="Qué se encontró y qué se hizo..." style={taStyle} />

                            <label style={labelStyle}>partida afectada</label>
                            <select value={r.partida} onChange={e => setCampo(idx, 'partida', e.target.value)} style={inputStyle}>
                              <option value="">Seleccionar partida...</option>
                              {partidas.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                            </select>

                            <label style={labelStyle}>causa</label>
                            <select value={r.causa} onChange={e => setCampo(idx, 'causa', e.target.value)} style={inputStyle}>
                              <option value="">Seleccionar causa...</option>
                              {GRUPOS_CAUSA.map(g => {
                                const items = causas.filter(c => c.tipo === g.tipo);
                                if (items.length === 0) return null;
                                return (
                                  <optgroup key={g.tipo} label={g.label}>
                                    {items.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                                  </optgroup>
                                );
                              })}
                            </select>
                          </>
                        )}

                        <label style={labelStyle}>estado</label>
                        {soloLectura ? (
                          <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: textPrimary }}>
                            {r.estado === 'SOLUCIONADO' ? 'Solucionado' : 'Pendiente'}
                          </div>
                        ) : (
                          <select value={r.estado} onChange={e => setCampo(idx, 'estado', e.target.value)} style={inputStyle}>
                            <option value="SOLUCIONADO">Solucionado</option>
                            <option value="EN_PROCESO">En Proceso</option>
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="NO_APLICA">No Aplica</option>
                            <option value="CLIENTE_NO_ATIENDE">Cliente no atiende visita</option>
                          </select>
                        )}

                        <label style={labelStyle}>
                          registro fotográfico <span style={{ color: textMuted, fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
                        </label>
                        <div style={{ display: 'flex', gap: 12 }}>
                          {fotoSlot(idx, 'antes')}
                          {fotoSlot(idx, 'despues')}
                        </div>

                        {soloLectura && fotosPendientesCount > 0 && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
                            background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb',
                            border: `0.5px solid ${dark ? 'rgba(251,191,36,0.3)' : '#fde68a'}`,
                            borderRadius: 8, padding: '6px 10px',
                            fontSize: 11, color: dark ? '#fbbf24' : '#92400e', fontWeight: 600,
                          }}>
                            ⏳ {fotosPendientesCount === 1 ? '1 foto sincronizando' : `${fotosPendientesCount} fotos sincronizando`}
                            <span style={{ fontWeight: 400, color: textMuted }}>
                              — busca señal en el dispositivo que tomó las fotos
                            </span>
                          </div>
                        )}

                        {!esMaestro && !soloLectura && !sinPapeleta && (r.origen === 'papeleta' || r.origen === 'derivada') && (
                          <button onClick={() => derivarObs(idx)}
                            style={{ ...btnGhost, marginTop: 12, height: 40, fontSize: 12, color: accent, borderColor: dark ? 'rgba(96,165,250,0.3)' : '#bfdbfe' }}>
                            ▹ Separar otro problema de esta solicitud
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {!esMaestro && !soloLectura && (
                sinPapeleta ? (
                  <button onClick={agregarObs} style={{ ...btnGhost, marginBottom: 8, color: accent, borderColor: dark ? 'rgba(96,165,250,0.3)' : '#bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Plus size={15} strokeWidth={2.25} /> Agregar observación
                  </button>
                ) : (
                  <button onClick={agregarAdicional} style={{ ...btnGhost, marginBottom: 8, color: dark ? '#fbbf24' : '#92400e', borderColor: dark ? 'rgba(251,191,36,0.3)' : '#fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Plus size={15} strokeWidth={2.25} /> Agregar trabajo no registrado en la papeleta
                  </button>
                )
              )}

              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, margin: '20px 0 12px' }}>Quien recibe la visita</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

              <div style={cardStyle}>
                {propietario.nombre ? (
                  <button onClick={usarDatosPropietario}
                    style={{ ...btnGhost, marginBottom: 14, color: accent, borderColor: dark ? 'rgba(96,165,250,0.3)' : '#bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <User size={15} strokeWidth={2.25} /> Es el propietario ({propietario.nombre})
                  </button>
                ) : (
                  <div style={{
                    background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb',
                    border: `0.5px solid ${dark ? 'rgba(251,191,36,0.2)' : '#fde68a'}`,
                    borderRadius: 10, padding: '8px 12px', marginBottom: 14,
                    fontSize: 11, color: dark ? '#fbbf24' : '#92400e', lineHeight: 1.4,
                  }}>
                    Este departamento aún no tiene propietario registrado. Se completa al generar el acta de pre-entrega.
                  </div>
                )}

                {soloLectura ? (
                  <>
                    <label style={labelStyle}>nombre</label>
                    <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: recNombre ? textPrimary : textMuted }}>
                      {recNombre || '—'}
                    </div>
                    <label style={labelStyle}>RUT</label>
                    <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', color: recRut ? textPrimary : textMuted }}>
                      {recRut || '—'}
                    </div>
                  </>
                ) : (
                  <>
                    <label style={labelStyle}>nombre *</label>
                    <input value={recNombre}
                      onChange={e => { const v = e.target.value.toUpperCase(); setRecNombreSync(v); guardarReceptorDebounced(v, recRut); }}
                      placeholder="EJ: JUAN PEDRO PEREZ" style={inputStyle} />
                    <label style={labelStyle}>RUT *</label>
                    <input value={recRut}
                      onChange={e => { const v = formatRut(e.target.value); setRecRutSync(v); guardarReceptorDebounced(recNombre, v); }}
                      inputMode="text" maxLength={12} placeholder="Ej: 12.345.678-9" style={inputStyle} />
                  </>
                )}
              </div>

              {soloLectura && completadaInfo.firmaUrl && (
                <div style={cardStyle}>
                  <label style={labelStyle}>firma de quien recibió</label>
                  <div style={{ border: `0.5px solid ${border}`, borderRadius: 12, overflow: 'hidden', background: '#ffffff' }}>
                    <img src={completadaInfo.firmaUrl} style={{ display: 'block', width: '100%', maxHeight: 180, objectFit: 'contain' }} />
                  </div>
                </div>
              )}

              {/* Generar el informe PDF es una acción separada del cierre —
                  pensada para el profesional en oficina, no para el
                  maestro_postventa en terreno (que ya cerró arriba). Con
                  esto, el PDF siempre se genera leyendo datos confirmados en
                  el servidor, y se puede regenerar las veces que haga falta
                  (por ejemplo, después de corregir algo). */}
              {soloLectura && !esMaestro && (
                <div style={cardStyle}>
                  {fotosPendientesCount > 0 && (
                    <div style={{
                      color: dark ? '#fbbf24' : '#92400e', fontSize: 11, marginBottom: 10,
                      background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb', padding: '8px 12px',
                      borderRadius: 10, border: `0.5px solid ${dark ? 'rgba(251,191,36,0.3)' : '#fde68a'}`,
                    }}>
                      ⏳ Todavía hay {fotosPendientesCount === 1 ? '1 foto' : `${fotosPendientesCount} fotos`} sincronizando desde el dispositivo que cerró la visita.
                      Puedes generar el informe igual, pero podría salir sin esa foto — espera a que sincronice para un informe completo.
                    </div>
                  )}
                  {errorPdf && (
                    <div style={{
                      color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 10,
                      background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px',
                      borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca',
                    }}>{errorPdf}</div>
                  )}
                  <button onClick={generarInformePdf} disabled={generandoPdf} style={btnPrimary(generandoPdf)}>
                    {generandoPdf ? 'Generando informe…' : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={17} strokeWidth={2} /> Generar informe PDF
                      </span>
                    )}
                  </button>
                </div>
              )}

              {!soloLectura && errorBox}

              {!soloLectura && (
                <button onClick={irAFirma} style={btnPrimary(false)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <PenLine size={17} strokeWidth={2} /> Continuar a la firma
                  </span>
                </button>
              )}
              <button onClick={reiniciar} style={{ ...btnGhost, marginTop: 8, marginBottom: 40 }}>
                {soloLectura ? '← Volver' : sinPapeleta ? 'Cancelar y volver' : 'Cargar otra papeleta'}
              </button>
            </>
          )}

          {/* ============ PASO 3 · FIRMA ============ */}
          {paso === 'firma' && (
            listo ? (
              <div style={{ textAlign: 'center', paddingTop: 80 }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: finalizadoOffline ? (dark ? '#fbbf24' : '#92400e') : (dark ? '#4ade80' : '#15803d') }}>
                  {finalizadoOffline ? <WifiOff size={48} strokeWidth={1.5} /> : <CheckCircle2 size={48} strokeWidth={1.5} />}
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, color: dark ? '#4ade80' : '#15803d' }}>
                  {finalizadoOffline
                    ? 'Guardado en el dispositivo — se enviará solo cuando haya conexión'
                    : 'Informe generado correctamente'}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Recepción conforme</div>
                <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>{recNombre}</div>
                  <div style={{ fontSize: 12, color: textSecondary, marginBottom: 18 }}>
                    {recRut} · Torre {torre?.nombre} · Depto {depto?.numero} · {obs.length} obs
                  </div>

                  {esMaestro && titular.nombre && (
                    <div style={{
                      background: dark ? 'rgba(96,165,250,0.06)' : '#eff6ff',
                      border: `0.5px solid ${dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe'}`,
                      borderRadius: 10, padding: '8px 12px', marginBottom: 16,
                      fontSize: 11, color: dark ? '#93c5fd' : '#1d4ed8', lineHeight: 1.4,
                    }}>
                    <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6 }}>
                      <Info size={14} strokeWidth={2.25} style={{ flexShrink: 0, marginTop: 1 }} />
                      Este informe quedará registrado a nombre de {titular.nombre}, profesional titular de post venta del proyecto.
                    </span>
                  </div>
                )}

                  <label style={{ ...labelStyle, marginBottom: 8 }}>firma de quien recibe *</label>
                  <div style={{ border: `0.5px solid ${border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 8, background: '#ffffff' }}>
                    <canvas ref={firmaCanvasRef}
                      style={{ display: 'block', width: '100%', height: 180, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                      onMouseDown={iniciarDibujo} onMouseMove={dibujar} onMouseUp={terminarDibujo} onMouseLeave={terminarDibujo}
                      onTouchStart={e => { e.preventDefault(); iniciarDibujo(e); }}
                      onTouchMove={e => { e.preventDefault(); dibujar(e); }}
                      onTouchEnd={e => { e.preventDefault(); terminarDibujo(); }}
                    />
                  </div>
                  <button onClick={limpiarFirma}
                    style={{ background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 12, borderRadius: 8, padding: '4px 12px', cursor: 'pointer', marginBottom: 18, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Trash2 size={13} strokeWidth={2.25} /> Limpiar firma
                  </button>

                  {errorBox}

                  <button onClick={finalizar} disabled={guardando} style={btnPrimary(guardando)}>
                    {guardando ? 'Guardando...' : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={17} strokeWidth={2} /> Guardar y generar informe
                      </span>
                    )}
                  </button>
                  <button onClick={() => setPaso('revision')} style={{ ...btnGhost, marginTop: 8 }}>
                    Volver a revisión
                  </button>
                </div>
              </>
            )
          )}

        </div>
      </IonContent>

      {anotando && (
        <FotoAnnotator imageSrc={anotando.src} onConfirm={confirmarAnotacion} onCancel={() => setAnotando(null)} />
      )}

      <IonModal isOpen={!!fotoAmpliada} onDidDismiss={() => setFotoAmpliada(null)}>
        {fotoAmpliada && (
          <div style={{ background: '#0B1220', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 0 }}>
              <button onClick={() => setFotoAmpliada(null)}
                style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 20, cursor: 'pointer', zIndex: 1 }}>×</button>
              <div style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {fotoAmpliada.tipo === 'antes' ? 'Antes' : 'Después'}
              </div>
              <img src={fotoAmpliada.src} style={{ width: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ padding: 16, display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setAnotando({ idx: fotoAmpliada.idx, tipo: fotoAmpliada.tipo, src: fotoAmpliada.src }); setFotoAmpliada(null); }}
                style={{ flex: 1, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Pencil size={15} strokeWidth={2.25} /> Editar
              </button>
              <button
                onClick={() => { setFotoYGuardar(fotoAmpliada.idx, fotoAmpliada.tipo, null); setFotoAmpliada(null); }}
                style={{ flex: 1, height: 46, borderRadius: 12, background: 'rgba(239,68,68,0.15)', border: '0.5px solid rgba(239,68,68,0.35)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Trash2 size={15} strokeWidth={2.25} /> Eliminar foto
              </button>
            </div>
          </div>
        )}
      </IonModal>
    </IonPage>
  );
};

export default PostVenta;
import { IonContent, IonPage, IonHeader, IonToolbar, IonTitle, IonModal, IonIcon, IonButtons, IonButton, IonSpinner, useIonViewWillEnter } from '@ionic/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { chevronBack, chevronForward, closeOutline, cloudUploadOutline, documentTextOutline, trashOutline } from 'ionicons/icons';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { BottomNavBar } from '../components/BottomNavBar';
import { extraerPapeletaPdf, DatosSolicitud, ObservacionPdf } from '../helpers/extraerPapeletaPdf';
import { extraerActaPreEntregaPdf, DatosActaPreEntregaPdf } from '../helpers/extraerActaPreEntregaPdf';
import { RESUME_KEY } from '../helpers/postventaSession';

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

/**
 * A pesar del nombre (histórico, de cuando el calendario era solo
 * postventa), esta interfaz ahora representa CUALQUIER evento agendado del
 * calendario — postventa o pre-entrega — normalizados a la misma forma para
 * que el resto del componente (chips, agrupación, drag, día expandido) no
 * tenga que bifurcar por tipo salvo donde el contenido es realmente distinto
 * (ver `tipo`).
 */
interface PapeletaCalendario {
  id: string;
  tipo: 'postventa' | 'pre_entrega';
  estado: string;               // 'EN_PROGRESO' | 'COMPLETADA' | otros
  fecha_atencion: string | null; // texto crudo, formato mixto (ver nota abajo)
  hora_atencion: string | null;
  n_requerimiento: string | null; // solo postventa; null en pre_entrega
  torre_codigo: string | null;
  depto_numero: string | null;
  proyecto_codigo: string | null;
  condominio: string | null;
  departamento_id: string;
  proyecto_id: string;
}

/** Fila de postventa_obs_borrador, resumida a lo que necesita el modal del día. */
interface ObsResumen {
  papeleta_id: string;
  ambiente: string | null;
  solicitud_cliente: string | null;
  observacion: string | null;
  estado: string; // 'PENDIENTE' | 'SOLUCIONADO'
}

const T_PAPELETA = 'postventa_papeletas';
const T_PREENTREGA = 'preentrega_agenda';
// Proyecto usado para probar funcionalidades nuevas — nunca debe aparecer en
// el calendario compartido del equipo (ni sus visitas, ni como opción del
// filtro de proyecto), para no ensuciar lo que se ve como "trabajo real".
// Comparación case-insensitive por si alguien lo escribe con otra
// mayúscula/minúscula al crearlo o editarlo en el catálogo de proyectos.
const PROYECTO_PRUEBAS_NOMBRE = 'Proyecto de Pruebas';
const T_BORRADOR = 'postventa_obs_borrador';

/* ------------------------------------------------------------------ */
/*  Fechas — la columna fecha_atencion guarda texto tal cual vino del  */
/*  PDF, y las dos plantillas de papeleta usan separadores distintos: */
/*  "20/08/2026" (plantilla "Solicitud") y "20-08-2026" (plantilla     */
/*  "Orden de Visita"). No se puede confiar en orden alfabético ni en  */
/*  que Postgres la interprete como fecha real — hay que parsearla a   */
/*  mano aceptando ambos separadores.                                  */
/* ------------------------------------------------------------------ */

/** Acepta "DD/MM/YYYY" o "DD-MM-YYYY". Devuelve null si no calza. */
const parseFechaFlexible = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  const fecha = new Date(anio, mes - 1, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return null;
  return fecha;
};

/** Nuevo estándar de escritura al reagendar: DD-MM-YYYY (formato de la plantilla vigente). */
const formatFechaGuardado = (fecha: Date): string => {
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${fecha.getFullYear()}`;
};

/** Clave de agrupación estable, independiente del formato de origen. */
const claveFecha = (fecha: Date): string =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

/**
 * Ida y vuelta a "YYYY-MM-DD" (lo que exige <input type="date">), para
 * poder editar la fecha leída del PDF en los modales de confirmación de
 * subida — la papeleta "orden_visita" no siempre trae una hora de visita
 * confiable (a veces ni la fecha), así que el profesional necesita poder
 * corregirlas antes de agendar.
 */
const fechaTextoAIso = (texto: string): string => {
  const f = parseFechaFlexible(texto);
  return f ? claveFecha(f) : '';
};
const isoAFechaTexto = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return formatFechaGuardado(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};

/** "15:44:14" o "09:00" -> "3:44pm" / "9:00am". Si no calza el formato, se devuelve tal cual. */
const formatHora12h = (hora: string | null | undefined): string => {
  if (!hora) return '';
  const m = hora.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hora;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min}${ampm}`;
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const hoy = new Date();
const esMismoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Grilla de 42 celdas (6 semanas), empezando en lunes, cubriendo el mes visible. */
const generarGrid = (anio: number, mes: number): Date[] => {
  const primerDiaMes = new Date(anio, mes, 1);
  const offset = (primerDiaMes.getDay() + 6) % 7; // 0 = lunes
  const inicio = new Date(anio, mes, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    return d;
  });
};

/* ------------------------------------------------------------------ */
/*  Matching difuso: de qué proyecto/torre/depto es una papeleta       */
/* ------------------------------------------------------------------ */
/*  Antes de esto, subir una papeleta SIEMPRE exigía haber entrado     */
/*  primero al depto correcto desde DetalleDepto (el proyecto/torre/   */
/*  depto venían de la navegación, no del PDF). Este botón nuevo       */
/*  ("Subir papeleta" en el calendario) no tiene ese contexto previo,  */
/*  así que hay que adivinarlo a partir de lo que el PDF dice de sí    */
/*  mismo (Proyecto/Condominio, Torre/Edificio, N° Vivienda/Depto) y   */
/*  dejar que el usuario confirme o corrija antes de crear la visita.  */
/*  La misma lógica de "sugerir, nunca forzar" que ya usa PostVenta.tsx*/
/*  para ambiente/partida se reutiliza aquí para proyecto/torre/depto. */
/* ------------------------------------------------------------------ */

const norm = (s: any) =>
  (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

const sinNumeroFinal = (s: string) => s.replace(/\s*n?[°ºo]?\s*\d+\s*$/i, '').trim();

interface CatalogoNombre { id: string; nombre: string }

const sugerirDeCatalogo = (textoPdf: string, catalogo: CatalogoNombre[]): string => {
  const t = norm(textoPdf);
  if (!t) return '';
  const buscar = (texto: string) =>
    catalogo.find(a => norm(a.nombre) === texto) ??
    catalogo.find(a => texto.includes(norm(a.nombre)) || norm(a.nombre).includes(texto));
  const directo = buscar(t);
  if (directo) return directo.nombre;
  const tSinNumero = norm(sinNumeroFinal(textoPdf));
  if (tSinNumero && tSinNumero !== t) {
    const sinNumero = buscar(tSinNumero);
    if (sinNumero) return sinNumero.nombre;
  }
  return '';
};

const sugerirAmbiente = (textoPdf: string, catalogo: CatalogoNombre[]): string =>
  sugerirDeCatalogo(textoPdf, catalogo);

const sugerirPartida = (textoPdf: string | undefined, catalogo: CatalogoNombre[]): string =>
  sugerirDeCatalogo(textoPdf ?? '', catalogo);

/** "PROYECTO PARQUE SAN JAVIER" -> "PARQUE SAN JAVIER", para comparar contra el nombre del catálogo. */
const sinPrefijoProyecto = (s: string) => s.replace(/^\s*proyecto\s+/i, '').trim();

interface ProyectoOpt { id: string; nombre: string; codigo: string | null }
interface TorreOpt { id: string; nombre: string }
interface DeptoOpt { id: string; numero: string }
interface AliasProyecto { proyecto_id: string; alias_normalizado: string }

/** Shape mínimo común entre DatosSolicitud (postventa) y DatosActaPreEntregaPdf (pre-entrega). */
interface TextoUbicacion {
  proyecto?: string;
  condominio?: string;
  etapa?: string;
  torre?: string;
  depto?: string;
}

const sugerirProyectoId = (d: TextoUbicacion, proyectos: ProyectoOpt[]): string => {
  const textoPdf = d.proyecto || d.condominio || '';
  const t = norm(sinPrefijoProyecto(textoPdf));
  if (!t) return '';
  let match = proyectos.find(p => norm(sinPrefijoProyecto(p.nombre)) === t);
  if (!match) match = proyectos.find(p => t.includes(norm(p.nombre)) || norm(p.nombre).includes(t));
  if (!match && d.etapa) {
    const conEtapa = norm(sinPrefijoProyecto(`${textoPdf} ${d.etapa}`));
    match = proyectos.find(p => conEtapa.includes(norm(p.nombre)) || norm(p.nombre).includes(conEtapa));
  }
  if (!match && d.condominio) {
    match = proyectos.find(p => p.codigo && norm(p.codigo) === norm(d.condominio));
  }
  return match?.id ?? '';
};

/**
 * Primero revisa los alias APRENDIDOS (ver proyecto_alias_rls.sql): cuando
 * el texto del PDF ya fue confirmado antes hacia un proyecto —aunque no se
 * parezcan en nada, ej. "SAN JOSE 4" -> Valle Grande 4— se resuelve directo
 * ahí, sin pasar por el matching difuso. Solo si no hay alias conocido cae
 * a sugerirProyectoId (parecido de texto), que es un best-effort y puede
 * fallar justamente en estos casos de nombres comerciales distintos.
 */
const sugerirProyectoIdConAlias = (d: TextoUbicacion, proyectos: ProyectoOpt[], alias: AliasProyecto[]): string => {
  const textoPdf = d.proyecto || d.condominio || '';
  const t = norm(sinPrefijoProyecto(textoPdf));
  if (t) {
    const porAlias = alias.find(a => a.alias_normalizado === t);
    if (porAlias) return porAlias.proyecto_id;
  }
  return sugerirProyectoId(d, proyectos);
};

const sugerirTorreId = (d: TextoUbicacion, torres: TorreOpt[]): string => {
  const t = norm(d.torre);
  if (!t) return '';
  const match =
    torres.find(x => norm(x.nombre) === t) ??
    torres.find(x => t.includes(norm(x.nombre)) || norm(x.nombre).includes(t));
  return match?.id ?? '';
};

const sugerirDeptoId = (d: TextoUbicacion, deptos: DeptoOpt[]): string => {
  const t = norm(d.depto);
  if (!t) return '';
  const match = deptos.find(x => norm(x.numero) === t);
  return match?.id ?? '';
};

interface MatchPapeleta {
  datos: DatosSolicitud;
  observaciones: ObservacionPdf[];
  proyectos: ProyectoOpt[];
  aliasesConocidos: AliasProyecto[];
  proyectoId: string;
  torres: TorreOpt[];
  torreId: string;
  cargandoTorres: boolean;
  deptos: DeptoOpt[];
  deptoId: string;
  cargandoDeptos: boolean;
}

/** Mismo propósito que MatchPapeleta, para el flujo de "Subir Acta Pre Entrega". */
interface MatchActa {
  datos: DatosActaPreEntregaPdf;
  proyectos: ProyectoOpt[];
  aliasesConocidos: AliasProyecto[];
  proyectoId: string;
  torres: TorreOpt[];
  torreId: string;
  cargandoTorres: boolean;
  deptos: DeptoOpt[];
  deptoId: string;
  cargandoDeptos: boolean;
}

/* ------------------------------------------------------------------ */
/*  Componente                                                         */
/* ------------------------------------------------------------------ */

const CalendarioPostVenta: React.FC = () => {
  const history = useHistory();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [papeletas, setPapeletas] = useState<PapeletaCalendario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [diaExpandido, setDiaExpandido] = useState<string | null>(null); // clave de fecha
  // Drill-down dentro del modal del día: null = mostrando la lista de horas
  // agendadas ese día; con valor = mostrando el detalle de esa hora
  // (proyecto/torre/depto + observaciones si es postventa).
  const [horaExpandida, setHoraExpandida] = useState<string | null>(null);
  const cerrarModalDia = () => { setDiaExpandido(null); setHoraExpandida(null); };
  const [borrandoEvento, setBorrandoEvento] = useState<string | null>(null);

  // Observaciones del modal de "Visitas del día". Se piden aparte de las
  // papeletas (lazy, solo al abrir un día) porque viven en otra tabla
  // (postventa_obs_borrador) y no hace falta cargarlas para el mes entero.
  // Cacheadas por papeleta_id para no repetir la consulta si se reabre el
  // mismo día.
  const [obsPorPapeleta, setObsPorPapeleta] = useState<Record<string, ObsResumen[]>>({});
  const [cargandoObsDia, setCargandoObsDia] = useState(false);

  // Filtro por proyecto. Útil sobre todo para admin, que ve papeletas de
  // TODOS los proyectos asignados mezcladas en el mismo calendario.
  const [proyectosFiltro, setProyectosFiltro] = useState<ProyectoOpt[]>([]);
  const [filtroProyectoId, setFiltroProyectoId] = useState('');
  // Papeletas que tienen al menos 1 observación en estado PENDIENTE (ver
  // cargar()). Se usa tanto para el filtro "Solo pendientes" como para el
  // puntito de aviso en los chips, aunque el filtro esté apagado.
  // Estado agregado por papeleta (ver estadoAgregado() más abajo): calculado
  // a partir de TODAS las observaciones de esa papeleta, no un simple
  // booleano "tiene pendientes" — reemplaza al viejo pendientesIds.
  const [estadoAgregadoPorPapeleta, setEstadoAgregadoPorPapeleta] = useState<Map<string, 'PENDIENTE' | 'EN_PROCESO' | 'SOLUCIONADO'>>(new Map());
  const [soloPendientes, setSoloPendientes] = useState(false);

  // Drag táctil (long-press + arrastre). Ver justificación de por qué no se
  // usa HTML5 drag-and-drop en el comentario de iniciarDrag más abajo.
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [posArrastre, setPosArrastre] = useState<{ x: number; y: number } | null>(null);
  const [celdaSobre, setCeldaSobre] = useState<string | null>(null);
  const reagendandoRef = useRef<Set<string>>(new Set());

  // Subir papeleta directo desde el calendario (sin pasar por el depto).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [match, setMatch] = useState<MatchPapeleta | null>(null);
  const [creando, setCreando] = useState(false);
  const [errorSubida, setErrorSubida] = useState('');

  // Subir Acta de Pre Entrega directo desde el calendario — mismo mecanismo
  // que la papeleta de postventa, pero hacia preentrega_agenda + columnas
  // acta_* de departamentos en vez de postventa_papeletas.
  const fileInputActaRef = useRef<HTMLInputElement>(null);
  const [leyendoActa, setLeyendoActa] = useState(false);
  const [matchActa, setMatchActa] = useState<MatchActa | null>(null);
  const [creandoActa, setCreandoActa] = useState(false);

  // maestro_postventa: solo navega y visualiza el calendario. No puede subir
  // papeleta ni Acta de Pre Entrega, no puede reagendar arrastrando un chip,
  // y no puede eliminar eventos agendados por error.
  const [usuarioRol, setUsuarioRol] = useState('');
  const esMaestro = usuarioRol === 'maestro_postventa';

  const bg = dark ? '#0B1220' : '#f0f4f8';
  const card = dark ? '#16233B' : '#ffffff';
  const border = dark ? '#243550' : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted = dark ? '#5D728F' : '#94a3b8';
  const toolbar = dark ? '#0E1728' : '#1e3a5f';
  const accent = dark ? '#60a5fa' : '#2563eb';
  const verde = dark ? '#4ade80' : '#16a34a';
  const pendienteColor = '#f59e0b'; // mismo tono que ya se usa para el badge PENDIENTE del modal del día

  /**
   * Proyectos asignados al usuario actual y en etapa 'pre_entrega_postventa'.
   * Replica EXACTAMENTE el patrón ya usado (y ya debuggeado) en
   * PreEntrega.tsx — ver el historial del proyecto: consultar `proyectos`
   * directo devuelve TODOS los proyectos de la empresa, no solo los
   * asignados al usuario. Hay que pasar por `usuario_proyectos`, y esa
   * tabla se relaciona por `usuario_id` = `usuarios.id` (resuelto por
   * email desde la sesión), que NO es lo mismo que el uid de auth.
   */
  const obtenerProyectosAsignados = async (): Promise<ProyectoOpt[]> => {
    const { data: sess } = await supabase.auth.getSession();
    const userEmail = sess?.session?.user?.email;
    if (!userEmail) return [];

    const { data: usuarioData, error: errUsuario } = await supabase
      .from('usuarios').select('id').eq('email', userEmail).maybeSingle();
    if (errUsuario || !usuarioData) {
      throw errUsuario ?? new Error('No se pudo resolver el usuario actual.');
    }

    const { data: asignaciones, error: errAsig } = await supabase
      .from('usuario_proyectos')
      .select('proyectos(id, nombre, codigo, etapa)')
      .eq('usuario_id', usuarioData.id);
    if (errAsig) throw errAsig;

    return ((asignaciones ?? []) as any[])
      .map(a => a.proyectos as any)
      .filter(p => p && p.etapa === 'pre_entrega_postventa')
      .map(p => ({ id: p.id, nombre: p.nombre, codigo: p.codigo }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  // Se resuelve una sola vez (cacheado en el ref) y no como estado, para no
  // gatillar un render extra cada vez que cargar() se vuelve a ejecutar
  // (ionViewWillEnter, Realtime). undefined = todavía no se intentó buscar;
  // null = se buscó y no existe ese proyecto en el catálogo.
  const idProyectoPruebasRef = useRef<string | null | undefined>(undefined);
  const resolverProyectoPruebas = async (): Promise<string | null> => {
    if (idProyectoPruebasRef.current !== undefined) return idProyectoPruebasRef.current;
    const { data, error: err } = await supabase
      .from('proyectos').select('id').ilike('nombre', PROYECTO_PRUEBAS_NOMBRE).maybeSingle();
    if (err) console.warn('No se pudo resolver el Proyecto de Pruebas:', err);
    const id = data?.id ?? null;
    idProyectoPruebasRef.current = id;
    return id;
  };

  /* ---------- carga ---------- */
  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const idPruebas = await resolverProyectoPruebas();

      // No se filtra por fecha en la query: la columna es texto en formato
      // mixto (ver nota arriba) y un filtro .gte/.lte de Supabase la
      // compararía como string, no como fecha real. Se trae todo lo que
      // tenga fecha asignada y se agrupa/filtra por mes en el cliente.
      // RLS (ver calendario_postventa_rls.sql / preentrega_agenda_rls.sql)
      // ya limita esto a los proyectos asignados al usuario, sin importar
      // quién subió cada una. El Proyecto de Pruebas se excluye siempre,
      // aparte de RLS: es un proyecto real y asignado, así que RLS sí lo
      // dejaría pasar — esto es a propósito para que nunca ensucie el
      // calendario del equipo.
      let queryPV = supabase
        .from(T_PAPELETA)
        .select(
          'id, estado, fecha_atencion, hora_atencion, n_requerimiento, torre_codigo, depto_numero, proyecto_codigo, condominio, departamento_id, proyecto_id'
        )
        .not('fecha_atencion', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (idPruebas) queryPV = queryPV.neq('proyecto_id', idPruebas);

      let queryPE = supabase
        .from(T_PREENTREGA)
        .select(
          'id, estado, fecha_atencion, hora_atencion, torre_codigo, depto_numero, proyecto_codigo, condominio, departamento_id, proyecto_id'
        )
        .not('fecha_atencion', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (idPruebas) queryPE = queryPE.neq('proyecto_id', idPruebas);

      const [resPV, resPE] = await Promise.all([queryPV, queryPE]);
      if (resPV.error) throw resPV.error;
      if (resPE.error) {
        // No se bloquea el calendario si esta tabla todavía no existe (por
        // ejemplo si no se ha corrido preentrega_agenda_rls.sql) — se
        // muestra igual lo de postventa.
        console.warn('No se pudo cargar la agenda de pre-entrega (¿corriste preentrega_agenda_rls.sql?):', resPE.error);
      }

      const pv: PapeletaCalendario[] = ((resPV.data as any[]) ?? []).map(r => ({ ...r, tipo: 'postventa' as const }));
      const pe: PapeletaCalendario[] = ((resPE.data as any[]) ?? []).map(r => ({ ...r, tipo: 'pre_entrega' as const, n_requerimiento: null }));
      setPapeletas([...pv, ...pe]);

      // Estado agregado por papeleta de POSTVENTA, calculado a partir de
      // TODAS sus observaciones (no solo las pendientes, como antes) — ver
      // estadoAgregado() para la regla: una sola obs PENDIENTE hace que
      // TODA la visita se vea pendiente; si no hay pendientes pero falta
      // alguna por solucionar, la visita se ve "en proceso"; solo si todas
      // están SOLUCIONADO se ve completada. Esto no aplica a pre-entrega
      // (sus observaciones viven en observacionesinformepv, con otro
      // vocabulario de estados — se deja para una próxima vuelta).
      // No se filtra por .in('papeleta_id', ids) porque con cientos/miles
      // de ids arma una URL gigante — se pide todo lo visible (RLS ya lo
      // acota a los proyectos asignados) y se cruza en el cliente.
      const { data: obsData, error: errObs } = await supabase
        .from(T_BORRADOR)
        .select('papeleta_id, estado')
        .limit(5000);
      if (errObs) {
        console.warn('No se pudo cargar el estado agregado de las observaciones:', errObs);
        setEstadoAgregadoPorPapeleta(new Map());
      } else {
        const porPapeleta = new Map<string, string[]>();
        for (const o of (obsData as { papeleta_id: string; estado: string }[]) ?? []) {
          if (!porPapeleta.has(o.papeleta_id)) porPapeleta.set(o.papeleta_id, []);
          porPapeleta.get(o.papeleta_id)!.push(o.estado);
        }
        const agregado = new Map<string, 'PENDIENTE' | 'EN_PROCESO' | 'SOLUCIONADO'>();
        for (const [papeletaId, estados] of porPapeleta) {
          agregado.set(papeletaId, estadoAgregado(estados));
        }
        setEstadoAgregadoPorPapeleta(agregado);
      }
    } catch (e: any) {
      console.error('Error cargando calendario:', e);
      setError('No se pudo cargar el calendario. Desliza hacia abajo para reintentar.');
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) return;
      const { data: u } = await supabase.from('usuarios').select('rol').eq('id', uid).maybeSingle();
      if (u?.rol) setUsuarioRol(String(u.rol));
    })();
  }, []);

  useEffect(() => {
    cargar();
    // Lista de proyectos para el filtro. Se pide aparte (no derivada de las
    // papeletas ya cargadas) para que aparezcan también proyectos sin
    // ninguna visita agendada este mes. Solo asignados al usuario y en
    // etapa pre_entrega_postventa — ver obtenerProyectosAsignados(). El
    // Proyecto de Pruebas se excluye acá también: si nunca va a tener
    // visitas visibles, tampoco tiene sentido que aparezca como opción
    // para filtrar por él.
    obtenerProyectosAsignados()
      .then(lista => {
        setProyectosFiltro(lista.filter(p => norm(p.nombre) !== norm(PROYECTO_PRUEBAS_NOMBRE)));
      })
      .catch(e => console.error('Error cargando proyectos para el filtro:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Caso 1: subiste (o alguien más subió) una papeleta en OTRA pantalla
  // (DetalleDepto, PostVenta) y volviste acá navegando. Ionic suele
  // mantener esta página viva en el stack en vez de desmontarla, así que un
  // useEffect de solo-montaje no vuelve a correr. useIonViewWillEnter sí se
  // dispara cada vez que se vuelve a esta vista, sin necesidad de recargar
  // la app entera.
  useIonViewWillEnter(() => {
    cargar();
  });

  // Caso 2: alguien sube/reagenda/finaliza una papeleta MIENTRAS estás
  // mirando el calendario (en otra sesión/dispositivo, o tú mismo en otra
  // pestaña). Se refresca en vivo vía Supabase Realtime.
  //
  // Requiere haber corrido `realtime_postventa_papeletas.sql` una vez (agrega
  // la tabla a la publicación de replicación) — si no, esta suscripción
  // simplemente no recibe eventos, sin tirar error. Se recarga todo con
  // cargar() en vez de aplicar el payload a mano: así siempre queda
  // consistente con RLS y con el resto de columnas que la vista necesita,
  // sin duplicar el mapeo de campos en dos lugares.
  //
  // También escucha T_BORRADOR (postventa_obs_borrador): marcar una
  // observación como SOLUCIONADO no toca la tabla de papeletas, pero sí
  // cambia el set de "pendientesIds" que arma cargar() — sin esto, el
  // filtro de pendientes quedaría desactualizado hasta el próximo
  // useIonViewWillEnter.
  useEffect(() => {
    let timer: any = null;
    const recargarConDebounce = () => {
      clearTimeout(timer);
      timer = setTimeout(cargar, 400); // varias filas cambiando junto = un solo refetch
    };
    const canal = supabase
      .channel('calendario_postventa_papeletas')
      .on('postgres_changes', { event: '*', schema: 'public', table: T_PAPELETA }, recargarConDebounce)
      .on('postgres_changes', { event: '*', schema: 'public', table: T_BORRADOR }, recargarConDebounce)
      .on('postgres_changes', { event: '*', schema: 'public', table: T_PREENTREGA }, recargarConDebounce)
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- agrupación por día (con filtro de proyecto aplicado) ---------- */
  const papeletasFiltradas = useMemo(() => {
    let r = papeletas;
    if (filtroProyectoId) r = r.filter(p => p.proyecto_id === filtroProyectoId);
    if (soloPendientes) {
      r = r.filter(p => p.tipo === 'postventa' && estadoAgregadoPorPapeleta.get(p.id) === 'PENDIENTE');
    }
    return r;
  }, [papeletas, filtroProyectoId, soloPendientes, estadoAgregadoPorPapeleta]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, PapeletaCalendario[]>();
    for (const p of papeletasFiltradas) {
      const fecha = parseFechaFlexible(p.fecha_atencion);
      if (!fecha) continue;
      const k = claveFecha(fecha);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(p);
    }
    for (const arr of mapa.values()) {
      arr.sort((a, b) => (a.hora_atencion ?? '').localeCompare(b.hora_atencion ?? ''));
    }
    return mapa;
  }, [papeletasFiltradas]);

  const grid = useMemo(() => generarGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  /* ---------- navegación de mes ---------- */
  const mesAnterior = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const mesSiguiente = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  const irAHoy = () => setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1));

  /* ---------- observaciones del modal "Visitas del día" ---------- */
  // Lazy: solo se piden al abrir un día, y solo las papeletas de ESE día que
  // todavía no estén cacheadas (no repite el fetch si se reabre el mismo día
  // o si ya se cargó por otra vía).
  useEffect(() => {
    if (!diaExpandido) return;
    const idsDelDia = (porDia.get(diaExpandido) ?? []).filter(p => p.tipo === 'postventa').map(p => p.id);
    const idsFaltantes = idsDelDia.filter(id => !(id in obsPorPapeleta));
    if (idsFaltantes.length === 0) return;

    let cancelado = false;
    setCargandoObsDia(true);
    (async () => {
      const { data, error: err } = await supabase
        .from(T_BORRADOR)
        .select('papeleta_id, ambiente, solicitud_cliente, observacion, estado')
        .in('papeleta_id', idsFaltantes)
        .order('orden');
      if (cancelado) return;
      if (err) {
        console.error('Error cargando observaciones del día:', err);
        setCargandoObsDia(false);
        return;
      }
      setObsPorPapeleta(prev => {
        const next = { ...prev };
        for (const id of idsFaltantes) next[id] = []; // marca como "ya consultada" aunque venga vacía
        for (const o of (data as ObsResumen[]) ?? []) {
          if (!next[o.papeleta_id]) next[o.papeleta_id] = [];
          next[o.papeleta_id].push(o);
        }
        return next;
      });
      setCargandoObsDia(false);
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaExpandido]);

  /* ---------- navegar al detalle del depto ---------- */
  // La papeleta solo trae departamento_id/proyecto_id como IDs sueltos (más
  // torre_codigo/depto_numero/proyecto_codigo como texto para mostrar). Para
  // armar los objetos {depto, torre, proyecto} que espera DetalleDepto.tsx
  // (y de ahí PostVenta.tsx) se hace una consulta puntual al tocar el chip,
  // en vez de cargar todo ese join para las 40+ papeletas del mes.
  const abrirDepto = async (p: PapeletaCalendario) => {
    try {
      const { data, error: err } = await supabase
        .from('departamentos')
        .select('id, numero, torre_id, torres ( id, nombre, frente, proyecto_id, proyectos ( id, nombre, codigo ) )')
        .eq('id', p.departamento_id)
        .maybeSingle();

      if (err || !data) throw err ?? new Error('Departamento no encontrado');

      const torreRow: any = Array.isArray((data as any).torres) ? (data as any).torres[0] : (data as any).torres;
      const proyectoRow: any = torreRow
        ? (Array.isArray(torreRow.proyectos) ? torreRow.proyectos[0] : torreRow.proyectos)
        : null;

      history.push(`/detalle-depto/${data.id}`, {
        depto: { id: data.id, numero: data.numero },
        torre: torreRow ? { id: torreRow.id, nombre: torreRow.nombre, frente: torreRow.frente } : null,
        proyecto: proyectoRow ? { id: proyectoRow.id, nombre: proyectoRow.nombre, codigo: proyectoRow.codigo } : null,
      });
    } catch (e) {
      console.error('Error abriendo depto desde el calendario:', e);
      setError('No se pudo abrir el departamento. Intenta de nuevo.');
    }
  };

  /**
   * Elimina un evento agendado por error directamente desde el calendario
   * (sin necesitar SQL a mano) — por ejemplo, una papeleta de postventa
   * subida por el botón de Acta de Pre Entrega, o cualquier duplicado.
   *
   * Para postventa borra primero las observaciones hijas
   * (postventa_obs_borrador) y después la papeleta — mismo orden que ya
   * usa VisitasPostVenta.tsx para no violar la FK. Para pre_entrega solo
   * borra la fila de preentrega_agenda: a propósito NO toca las columnas
   * acta_* de `departamentos` (propietario, RUT, fecha de promesa...),
   * porque esos datos pueden ser correctos aunque el AGENDADO haya sido un
   * error — si además hace falta limpiar esos campos, se hace aparte.
   *
   * Requiere las policies de DELETE correspondientes (visitas_delete_rls.sql
   * para postventa, preentrega_agenda_delete_rls.sql para pre_entrega) —
   * sin ellas, falla en silencio (RLS deniega, no hay error explícito).
   */
  const eliminarEvento = async (p: PapeletaCalendario) => {
    if (esMaestro) return;
    const tipoTexto = p.tipo === 'pre_entrega' ? 'esta agenda de Pre Entrega' : 'esta papeleta de Post Venta';
    const confirmado = window.confirm(
      `¿Eliminar ${tipoTexto} (Torre ${p.torre_codigo ?? '—'} · Depto ${p.depto_numero ?? '—'})?\n\n` +
      `${p.tipo === 'postventa' ? 'Se pierden también sus observaciones cargadas.' : ''}\n` +
      `Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;

    setBorrandoEvento(p.id);
    try {
      if (p.tipo === 'pre_entrega') {
        const { error } = await supabase.from(T_PREENTREGA).delete().eq('id', p.id);
        if (error) throw error;
      } else {
        const { error: errObs } = await supabase.from(T_BORRADOR).delete().eq('papeleta_id', p.id);
        if (errObs) throw errObs;
        const { error: errPap } = await supabase.from(T_PAPELETA).delete().eq('id', p.id);
        if (errPap) throw errPap;
      }
      cerrarModalDia();
      await cargar();
    } catch (e) {
      console.error('Error eliminando evento del calendario:', e);
      setError('No se pudo eliminar. Revisa tu conexión e intenta de nuevo.');
    }
    setBorrandoEvento(null);
  };

  /* ---------- reagendar (drag) ---------- */
  const reagendar = async (p: PapeletaCalendario, nuevaFecha: Date) => {
    if (esMaestro) return;
    const claveNueva = claveFecha(nuevaFecha);
    const fechaActual = parseFechaFlexible(p.fecha_atencion);
    if (fechaActual && claveFecha(fechaActual) === claveNueva) return; // soltó en el mismo día

    if (reagendandoRef.current.has(p.id)) return;
    reagendandoRef.current.add(p.id);

    const textoNuevo = formatFechaGuardado(nuevaFecha);
    const anterior = p.fecha_atencion;
    const tabla = p.tipo === 'pre_entrega' ? T_PREENTREGA : T_PAPELETA;

    // Optimista: se mueve de inmediato en pantalla.
    setPapeletas(prev => prev.map(x => (x.id === p.id ? { ...x, fecha_atencion: textoNuevo } : x)));

    const { error: err } = await supabase
      .from(tabla)
      .update({ fecha_atencion: textoNuevo, updated_at: new Date().toISOString() })
      .eq('id', p.id);

    reagendandoRef.current.delete(p.id);

    if (err) {
      console.error('Error reagendando:', err);
      setPapeletas(prev => prev.map(x => (x.id === p.id ? { ...x, fecha_atencion: anterior } : x)));
      setError('No se pudo reagendar. Revisa tu conexión e intenta de nuevo.');
    }
  };

  /* ---------- subir papeleta sin depto pre-seleccionado ---------- */
  const abrirSelectorArchivo = () => fileInputRef.current?.click();

  const onSeleccionarPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!esPdf) { setErrorSubida('Solo se aceptan archivos PDF'); return; }

    setLeyendo(true); setErrorSubida('');
    try {
      const { datos: d, observaciones } = await extraerPapeletaPdf(file);
      if (observaciones.length === 0) {
        setErrorSubida('No se extrajeron observaciones del PDF. Verifica el formato.');
        setLeyendo(false); return;
      }

      const [proyectos, { data: aliasData, error: errAlias }] = await Promise.all([
        obtenerProyectosAsignados(),
        supabase.from('proyecto_alias').select('proyecto_id, alias_normalizado'),
      ]);
      if (errAlias) console.warn('No se pudieron cargar los alias de proyecto:', errAlias);
      const aliasesConocidos = (aliasData as AliasProyecto[]) ?? [];
      const proyectoId = sugerirProyectoIdConAlias(d, proyectos, aliasesConocidos);

      setMatch({
        datos: d, observaciones, proyectos, aliasesConocidos, proyectoId,
        torres: [], torreId: '', cargandoTorres: false,
        deptos: [], deptoId: '', cargandoDeptos: false,
      });
    } catch (e: any) {
      console.error('Error leyendo papeleta:', e);
      setErrorSubida(e?.message ?? 'No se pudo leer el PDF');
    }
    setLeyendo(false);
  };

  // Al elegir/adivinar un proyecto, se cargan sus torres y se intenta
  // adivinar cuál calza con lo leído en el PDF.
  useEffect(() => {
    if (!match?.proyectoId) return;
    let cancelado = false;
    setMatch(m => (m ? { ...m, cargandoTorres: true } : m));
    (async () => {
      const { data, error: err } = await supabase
        .from('torres').select('id, nombre').eq('proyecto_id', match.proyectoId).order('nombre');
      if (cancelado) return;
      const torres = (data as TorreOpt[]) ?? [];
      const torreId = err ? '' : sugerirTorreId(match.datos, torres);
      setMatch(m => (m ? { ...m, torres, torreId, cargandoTorres: false } : m));
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.proyectoId]);

  // Al elegir/adivinar una torre, se cargan sus deptos y se intenta adivinar
  // cuál calza con el N° Vivienda / Departamento leído del PDF.
  useEffect(() => {
    if (!match?.torreId) return;
    let cancelado = false;
    setMatch(m => (m ? { ...m, cargandoDeptos: true } : m));
    (async () => {
      const { data, error: err } = await supabase
        .from('departamentos').select('id, numero').eq('torre_id', match.torreId).order('numero');
      if (cancelado) return;
      const deptos = (data as DeptoOpt[]) ?? [];
      const deptoId = err ? '' : sugerirDeptoId(match.datos, deptos);
      setMatch(m => (m ? { ...m, deptos, deptoId, cargandoDeptos: false } : m));
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.torreId]);

  const cambiarProyecto = (id: string) =>
    setMatch(m => (m ? { ...m, proyectoId: id, torres: [], torreId: '', cargandoTorres: true, deptos: [], deptoId: '' } : m));
  const cambiarTorre = (id: string) =>
    setMatch(m => (m ? { ...m, torreId: id, deptos: [], deptoId: '', cargandoDeptos: true } : m));
  const cambiarDepto = (id: string) =>
    setMatch(m => (m ? { ...m, deptoId: id } : m));

  const cancelarSubida = () => { setMatch(null); setErrorSubida(''); };

  // Confirma el proyecto/torre/depto (adivinados o corregidos a mano), crea
  // la papeleta y su borrador de observaciones, y deja todo listo para que
  // PostVenta.tsx la reanude — el mismo mecanismo que usa DetalleDepto al
  // reabrir una visita en progreso (sessionStorage[RESUME_KEY] + navegar con
  // {depto, torre, proyecto} en el state).
  // Guarda (o no) el alias tras confirmar. Se guarda cuando:
  //  - el texto crudo del PDF no es ya, literalmente, el nombre del proyecto
  //    (si ya calzan uno a uno no hace falta aprender nada), Y
  //  - ese texto todavía no estaba en la tabla de alias (para no generar
  //    filas duplicadas cada vez que se sube una papeleta del mismo depto).
  // No importa si el proyecto llegó por match automático o porque el
  // usuario lo corrigió a mano en el modal: en ambos casos, lo que quedó
  // CONFIRMADO es lo que se aprende — así una corrección manual de hoy hace
  // que la próxima papeleta con ese mismo texto ya no necesite corrección.
  const aprenderAliasProyecto = async (
    d: TextoUbicacion,
    proyecto: ProyectoOpt,
    aliasesConocidos: AliasProyecto[],
  ) => {
    const textoPdf = (d.proyecto || d.condominio || '').trim();
    if (!textoPdf) return;
    const t = norm(sinPrefijoProyecto(textoPdf));
    if (!t || t === norm(sinPrefijoProyecto(proyecto.nombre))) return; // ya calzan, no hace falta alias
    if (aliasesConocidos.some(a => a.alias_normalizado === t)) return; // ya estaba aprendido

    const { data: sess } = await supabase.auth.getSession();
    const { error } = await supabase.from('proyecto_alias').insert({
      proyecto_id: proyecto.id,
      alias: textoPdf,
      alias_normalizado: t,
      creado_por: sess?.session?.user?.id ?? null,
    });
    // No bloquea el flujo si falla (ej. la tabla proyecto_alias todavía no
    // existe porque no se corrió proyecto_alias_rls.sql). La papeleta ya
    // quedó creada de todas formas; solo se pierde el aprendizaje.
    if (error) console.warn('No se pudo guardar el alias de proyecto:', error);
  };

  const confirmarYCrear = async () => {
    if (!match) return;
    const proyecto = match.proyectos.find(p => p.id === match.proyectoId);
    const torre = match.torres.find(t => t.id === match.torreId);
    const depto = match.deptos.find(x => x.id === match.deptoId);
    if (!proyecto || !torre || !depto) {
      setErrorSubida('Selecciona proyecto, torre y depto antes de continuar.');
      return;
    }

    setCreando(true); setErrorSubida('');
    try {
      const [{ data: ambData }, { data: partData }] = await Promise.all([
        supabase.from('ambientes').select('id, nombre').order('nombre'),
        supabase.from('partidas').select('id, nombre').order('nombre'),
      ]);
      const ambientes = (ambData as CatalogoNombre[]) ?? [];
      const partidas = (partData as CatalogoNombre[]) ?? [];

      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;
      let inspectorNombre = '';
      if (user?.id) {
        const { data: u } = await supabase.from('usuarios').select('nombre').eq('id', user.id).maybeSingle();
        inspectorNombre = u?.nombre ?? '';
      }

      const { datos: d, observaciones } = match;

      const { data: pap, error: errPap } = await supabase.from(T_PAPELETA).insert({
        proyecto_id: proyecto.id,
        proyecto_codigo: proyecto.codigo || null,
        torre_codigo: torre.nombre,
        depto_numero: depto.numero,
        departamento_id: depto.id,
        sin_papeleta: false,
        n_requerimiento: d.requerimiento || null,
        fecha_registro: d.fechaRegistro || null,
        fecha_atencion: d.fechaAtencion || null,
        hora_atencion: d.horaAtencion || null,
        condominio: d.condominio || null,
        estado: 'EN_PROGRESO',
        usuario_id: user?.id ?? null,
        usuario_email: (user?.email ?? '').toLowerCase() || null,
        usuario_nombre: inspectorNombre || null,
      }).select('id').maybeSingle();

      if (errPap || !pap) throw errPap ?? new Error('No se pudo crear la papeleta');

      const filas = observaciones.map((o, i) => ({
        papeleta_id: pap.id,
        orden: i,
        origen: 'papeleta' as const,
        // Mismo criterio que PostVenta.tsx: en la plantilla "orden_visita"
        // (Aconcagua), la observación sola no da contexto ("FILTRA" no dice
        // de qué) — se combina con la partida ("CIELO: FILTRA"). En la
        // plantilla vieja o.partida no existe, queda igual que antes.
        solicitud_cliente: (o.partida ? `${o.partida}: ${o.descripcion}` : o.descripcion) ?? null,
        solicitud_ambiente: o.ambiente ?? null,
        ambiente: sugerirAmbiente(o.ambiente, ambientes) || null,
        observacion: null,
        partida_afectada: sugerirPartida(o.partida, partidas) || null,
        causa: null,
        // PENDIENTE, no SOLUCIONADO: se está creando el borrador desde acá,
        // todavía no hay ninguna inspección real hecha (mismo criterio que
        // PostVenta.tsx al leer una papeleta).
        estado: 'PENDIENTE',
      }));

      const { error: errHijos } = await supabase.from(T_BORRADOR).insert(filas);
      if (errHijos) throw errHijos;

      await aprenderAliasProyecto(d, proyecto, match.aliasesConocidos);

      sessionStorage.setItem(RESUME_KEY, pap.id);
      setMatch(null);
      // No se navega en el mismo tick que se cierra el modal: si el router
      // cambia de página antes de que Ionic termine la animación de cierre
      // del IonModal, el backdrop puede quedar sin desmontarse del todo y
      // tapa la pantalla nueva en negro — sin tirar ningún error, porque no
      // es un crash, es un elemento de overlay que quedó atrás.
      setTimeout(() => {
        history.push(`/post-venta/${depto.id}`, {
          depto: { id: depto.id, numero: depto.numero },
          torre: { id: torre.id, nombre: torre.nombre },
          proyecto: { id: proyecto.id, nombre: proyecto.nombre, codigo: proyecto.codigo },
        });
      }, 350);
    } catch (e: any) {
      console.error('Error creando borrador desde el calendario:', e);
      setErrorSubida('No se pudo crear la visita. Intenta de nuevo.');
    }
    setCreando(false);
  };

  /* ---------- subir Acta de Pre Entrega sin depto pre-seleccionado ---------- */
  const abrirSelectorArchivoActa = () => fileInputActaRef.current?.click();

  const onSeleccionarActaPreEntrega = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputActaRef.current) fileInputActaRef.current.value = '';
    if (!file) return;

    const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!esPdf) { setErrorSubida('Solo se aceptan archivos PDF'); return; }

    setLeyendoActa(true); setErrorSubida('');
    try {
      const d = await extraerActaPreEntregaPdf(file);

      const [proyectos, { data: aliasData, error: errAlias }] = await Promise.all([
        obtenerProyectosAsignados(),
        supabase.from('proyecto_alias').select('proyecto_id, alias_normalizado'),
      ]);
      if (errAlias) console.warn('No se pudieron cargar los alias de proyecto:', errAlias);
      const aliasesConocidos = (aliasData as AliasProyecto[]) ?? [];
      // El Acta ya viene sin el prefijo "CONDOMINIO " (lo saca el parser),
      // a diferencia de la papeleta de postventa que trae "PROYECTO " —
      // sugerirProyectoId igual intenta sacar ese prefijo si estuviera, así
      // que reusarla acá es seguro aunque ya venga limpio.
      const proyectoId = sugerirProyectoIdConAlias({ proyecto: d.proyecto }, proyectos, aliasesConocidos);

      setMatchActa({
        datos: d, proyectos, aliasesConocidos, proyectoId,
        torres: [], torreId: '', cargandoTorres: false,
        deptos: [], deptoId: '', cargandoDeptos: false,
      });
    } catch (e: any) {
      console.error('Error leyendo Acta de Pre Entrega:', e);
      setErrorSubida(e?.message ?? 'No se pudo leer el PDF');
    }
    setLeyendoActa(false);
  };

  useEffect(() => {
    if (!matchActa?.proyectoId) return;
    let cancelado = false;
    setMatchActa(m => (m ? { ...m, cargandoTorres: true } : m));
    (async () => {
      const { data, error: err } = await supabase
        .from('torres').select('id, nombre').eq('proyecto_id', matchActa.proyectoId).order('nombre');
      if (cancelado) return;
      const torres = (data as TorreOpt[]) ?? [];
      const torreId = err ? '' : sugerirTorreId({ torre: matchActa.datos.edificio }, torres);
      setMatchActa(m => (m ? { ...m, torres, torreId, cargandoTorres: false } : m));
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchActa?.proyectoId]);

  useEffect(() => {
    if (!matchActa?.torreId) return;
    let cancelado = false;
    setMatchActa(m => (m ? { ...m, cargandoDeptos: true } : m));
    (async () => {
      const { data, error: err } = await supabase
        .from('departamentos').select('id, numero').eq('torre_id', matchActa.torreId).order('numero');
      if (cancelado) return;
      const deptos = (data as DeptoOpt[]) ?? [];
      const deptoId = err ? '' : sugerirDeptoId({ depto: matchActa.datos.deptoNumero }, deptos);
      setMatchActa(m => (m ? { ...m, deptos, deptoId, cargandoDeptos: false } : m));
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchActa?.torreId]);

  const cambiarProyectoActa = (id: string) =>
    setMatchActa(m => (m ? { ...m, proyectoId: id, torres: [], torreId: '', cargandoTorres: true, deptos: [], deptoId: '' } : m));
  const cambiarTorreActa = (id: string) =>
    setMatchActa(m => (m ? { ...m, torreId: id, deptos: [], deptoId: '', cargandoDeptos: true } : m));
  const cambiarDeptoActa = (id: string) =>
    setMatchActa(m => (m ? { ...m, deptoId: id } : m));

  const cancelarSubidaActa = () => { setMatchActa(null); setErrorSubida(''); };

  // Confirma proyecto/torre/depto, agenda la visita en preentrega_agenda Y
  // precarga los datos del acta directo en departamentos — PreEntregaDepto.tsx
  // ya lee esas mismas columnas al montar (propietario_nombre,
  // acta_propietario_rut, acta_fecha_promesa, acta_banco,
  // acta_proceso_venta), así que no hace falta tocar ese archivo para que
  // el formulario aparezca pre-llenado.
  const confirmarYCrearActa = async () => {
    if (!matchActa) return;
    const proyecto = matchActa.proyectos.find(p => p.id === matchActa.proyectoId);
    const torre = matchActa.torres.find(t => t.id === matchActa.torreId);
    const depto = matchActa.deptos.find(x => x.id === matchActa.deptoId);
    if (!proyecto || !torre || !depto) {
      setErrorSubida('Selecciona proyecto, torre y depto antes de continuar.');
      return;
    }

    setCreandoActa(true); setErrorSubida('');
    try {
      const d = matchActa.datos;
      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;

      const { error: errAgenda } = await supabase.from(T_PREENTREGA).insert({
        departamento_id: depto.id,
        proyecto_id: proyecto.id,
        proyecto_codigo: proyecto.codigo || null,
        torre_codigo: torre.nombre,
        depto_numero: depto.numero,
        condominio: d.proyecto || null,
        fecha_atencion: d.fechaAtencion || null,
        hora_atencion: d.horaAtencion || null,
        proceso_venta: d.procesoVenta || null,
        estado: 'EN_PROGRESO',
        usuario_id: user?.id ?? null,
        usuario_email: (user?.email ?? '').toLowerCase() || null,
      });
      if (errAgenda) throw errAgenda;

      // Solo se escriben los campos que el Acta realmente trajo — si el
      // depto ya tenía algo cargado a mano y el PDF vino vacío en ese campo
      // (ej. banco, que casi siempre llega en blanco), no se pisa con ''.
      const updates: Record<string, any> = {};
      if (d.propietarioNombre) updates.propietario_nombre = d.propietarioNombre;
      if (d.propietarioRut) updates.acta_propietario_rut = d.propietarioRut;
      if (d.fechaPromesaIso) updates.acta_fecha_promesa = d.fechaPromesaIso;
      if (d.banco) updates.acta_banco = d.banco;
      if (d.procesoVenta) updates.acta_proceso_venta = d.procesoVenta;

      if (Object.keys(updates).length > 0) {
        const { error: errUpd } = await supabase.from('departamentos').update(updates).eq('id', depto.id);
        if (errUpd) throw errUpd;
      }

      await aprenderAliasProyecto({ proyecto: d.proyecto }, proyecto, matchActa.aliasesConocidos);

      setMatchActa(null);
      // Ver el mismo comentario en confirmarYCrear (flujo de postventa).
      setTimeout(() => {
        history.push(`/pre-entrega/${depto.id}`, {
          depto: { id: depto.id, numero: depto.numero },
          torre: { id: torre.id, nombre: torre.nombre },
          proyecto: { id: proyecto.id, nombre: proyecto.nombre, codigo: proyecto.codigo },
        });
      }, 350);
    } catch (e: any) {
      console.error('Error creando agenda de pre-entrega desde el calendario:', e);
      setErrorSubida('No se pudo agendar la pre-entrega. Intenta de nuevo.');
    }
    setCreandoActa(false);
  };

  /* ---------- drag táctil ---------- */
  // Por qué NO se usa HTML5 drag-and-drop (draggable + onDragStart/onDrop):
  // esa API no tiene equivalente táctil — no dispara nada en pantallas touch
  // (iOS/Android WebView de Capacitor, que es donde corre esta app). Se
  // implementa a mano con Pointer Events: un "long press" (350ms sin mover)
  // activa el modo arrastre; moverse antes de eso se interpreta como scroll
  // o com tap normal. Al soltar, se mira qué celda de día hay debajo del
  // dedo (elementFromPoint) y se reagenda ahí.
  const iniciarPointerDown = (e: React.PointerEvent, p: PapeletaCalendario) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    const startX = e.clientX;
    const startY = e.clientY;
    let activado = false;
    let abortado = false;

    // maestro_postventa solo navega tocando un chip: nunca entra en modo
    // arrastre para reagendar. No se activa el timer del long-press; el tap
    // normal sigue funcionando abajo en onUp (activado nunca pasa a true).
    const timer = esMaestro ? null : setTimeout(() => {
      activado = true;
      setArrastrandoId(p.id);
      setPosArrastre({ x: startX, y: startY });
      if (navigator.vibrate) navigator.vibrate(15);
    }, 350);

    const onMove = (ev: PointerEvent) => {
      if (abortado) return;
      if (!activado) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) > 10) {
          // Se movió antes del long-press: probablemente es scroll, no drag.
          abortado = true;
          if (timer) clearTimeout(timer);
          limpiar();
        }
        return;
      }
      setPosArrastre({ x: ev.clientX, y: ev.clientY });
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const celda = el?.closest('[data-fecha-key]') as HTMLElement | null;
      setCeldaSobre(celda?.dataset.fechaKey ?? null);
    };

    const onUp = (ev: PointerEvent) => {
      if (timer) clearTimeout(timer);
      if (activado) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const celda = el?.closest('[data-fecha-key]') as HTMLElement | null;
        const clave = celda?.dataset.fechaKey;
        if (clave) {
          const [y, m, d] = clave.split('-').map(Number);
          reagendar(p, new Date(y, m - 1, d));
        }
      } else if (!abortado) {
        // Tap normal: sin long-press y sin moverse -> abrir el depto.
        abrirDepto(p);
      }
      limpiar();
    };

    const limpiar = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setArrastrandoId(null);
      setPosArrastre(null);
      setCeldaSobre(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /**
   * Regla de agregación pedida: una sola observación PENDIENTE hace que
   * TODA la visita se vea pendiente (es la señal más urgente, gana sobre
   * cualquier otra cosa). Si no hay ninguna pendiente pero tampoco están
   * todas SOLUCIONADO (o sea, queda al menos una EN_PROCESO), la visita se
   * ve "en proceso". Solo si TODAS están SOLUCIONADO se ve completada.
   */
  const estadoAgregado = (estados: string[]): 'PENDIENTE' | 'EN_PROCESO' | 'SOLUCIONADO' => {
    if (estados.some(e => e === 'PENDIENTE')) return 'PENDIENTE';
    if (estados.every(e => e === 'SOLUCIONADO')) return 'SOLUCIONADO';
    return 'EN_PROCESO';
  };

  /* ---------- estilos por estado ---------- */
  /**
   * Para POSTVENTA, el color ya no depende del campo `estado` de la
   * papeleta (que solo dice si el FORMULARIO se guardó o se finalizó) —
   * ahora depende del estado AGREGADO de sus observaciones (ver
   * estadoAgregado): pendiente (ámbar) > en proceso (azul) > solucionada
   * (verde). Si la papeleta todavía no tiene ninguna observación cargada
   * (recién creada, o "sin papeleta"), se cae al color por el campo
   * `estado` de siempre, porque no hay nada que agregar todavía.
   *
   * Para PRE_ENTREGA se mantiene el criterio de siempre (no tiene
   * observaciones en esta tabla): COMPLETADA = verde, cualquier otra cosa
   * (agendada, en progreso) = azul.
   */
  const colorEstado = (p: PapeletaCalendario) => {
    if (p.tipo === 'postventa') {
      const agregado = estadoAgregadoPorPapeleta.get(p.id);
      if (agregado === 'PENDIENTE') return pendienteColor;
      if (agregado === 'EN_PROCESO') return accent;
      if (agregado === 'SOLUCIONADO') return verde;
    }
    if (p.estado === 'COMPLETADA') return verde;
    return accent; // EN_PROGRESO u otros
  };

  const papeletaArrastrada = papeletas.find(p => p.id === arrastrandoId) ?? null;

  /**
   * Devuelve 2 líneas en vez de un solo string largo: una celda de día mide
   * ~1/7 del ancho de pantalla (unos 45-50px reales en un teléfono), donde
   * "PSC2- B 408 9:00am" en una sola línea SIEMPRE se trunca — no entra ni
   * a fuente mínima. Partido en 2 líneas cortas (torre-depto arriba, hora
   * abajo) cada una cabe cómoda. El código de proyecto se omite cuando ya
   * hay un filtro de proyecto activo (ver `filtroProyectoId`): mostrarlo
   * ahí es redundante y solo resta espacio a lo que sí varía entre chips.
   */
  const etiquetaChip = (p: PapeletaCalendario, hora: string): { linea1: string; linea2: string } => {
    const codigo = filtroProyectoId ? '' : (p.proyecto_codigo || p.condominio || '');
    const torreDepto = [p.torre_codigo, p.depto_numero].filter(Boolean).join('-');
    return {
      linea1: [codigo, torreDepto].filter(Boolean).join(' ') || '—',
      linea2: hora || '',
    };
  };

  /**
   * Agrupa por depto + hora mostrada. Existe porque, en la práctica, varias
   * papeletas idénticas (mismo depto, misma hora) casi siempre son el
   * resultado de subir el mismo PDF más de una vez por error — no visitas
   * distintas. En vez de listarlas repetidas y comerse el espacio del día
   * (y verse roto, como en el reporte que motivó esto), se muestran como UN
   * chip con un contador "×N". El "+N más" del día sigue contando GRUPOS,
   * no filas crudas — si hay 5 papeletas duplicadas + 2 distintas, eso son
   * 3 grupos, no 7 chips.
   */
  const agruparPorDeptoHora = (items: PapeletaCalendario[]): PapeletaCalendario[][] => {
    const mapa = new Map<string, PapeletaCalendario[]>();
    for (const p of items) {
      const key = `${p.departamento_id}|${p.tipo}|${formatHora12h(p.hora_atencion)}`;
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key)!.push(p);
    }
    return Array.from(mapa.values());
  };

  /* ---------- render de un chip ---------- */
  const Chip = ({ p }: { p: PapeletaCalendario }) => {
    const color = colorEstado(p);
    const esFantasma = arrastrandoId === p.id;
    const hora = formatHora12h(p.hora_atencion);
    const { linea1, linea2 } = etiquetaChip(p, hora);
    const esPreEntrega = p.tipo === 'pre_entrega';
    // Solo para el tooltip — el color del chip ya comunica el estado
    // agregado, esto es texto de apoyo nada más.
    const agregado = p.tipo === 'postventa' ? estadoAgregadoPorPapeleta.get(p.id) : undefined;
    const etiquetaEstado = agregado === 'PENDIENTE' ? 'pendiente'
      : agregado === 'EN_PROCESO' ? 'en proceso'
      : agregado === 'SOLUCIONADO' ? 'solucionada'
      : (p.estado === 'COMPLETADA' ? 'completada' : 'en progreso');

    return (
      <div
        onPointerDown={(e) => iniciarPointerDown(e, p)}
        style={{
          background: dark ? `${color}1f` : `${color}14`,
          border: `${esPreEntrega ? '1px dashed' : '0.5px solid'} ${color}55`,
          borderRadius: 4,
          padding: '2px 4px 3px',
          marginBottom: 2,
          color,
          cursor: 'pointer',
          overflow: 'hidden',
          opacity: esFantasma ? 0.25 : 1,
          touchAction: 'none',
          userSelect: 'none',
        }}
        title={`${esPreEntrega ? 'Pre Entrega' : 'Post Venta'} · ${p.proyecto_codigo || p.condominio ? (p.proyecto_codigo || p.condominio) + ' · ' : ''}Torre ${p.torre_codigo ?? '—'} · Depto ${p.depto_numero ?? '—'}${hora ? ' · ' + hora : ''} · ${etiquetaEstado}`}
      >
        <div style={{
          fontSize: 10, lineHeight: '13px', fontWeight: 700,
          wordBreak: 'break-word',
        }}>
          {linea1}
        </div>
        {linea2 && (
          <div style={{ fontSize: 8.5, lineHeight: '11px', fontWeight: 600, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {linea2}
          </div>
        )}
      </div>
    );
  };

  /**
   * Un grupo de 1 se ve y se comporta exactamente igual que antes (tap para
   * abrir, long-press para arrastrar). Un grupo de 2+ se colapsa en un solo
   * chip con "×N": tocarlo abre el detalle del día en vez de un depto
   * puntual (no hay forma no ambigua de saber cuál de las N arrastrar), así
   * el usuario ve ahí las filas repetidas y puede decidir qué hacer.
   */
  const ChipGrupo = ({ grupo, claveDia }: { grupo: PapeletaCalendario[]; claveDia: string }) => {
    if (grupo.length === 1) return <Chip p={grupo[0]} />;

    const p = grupo[0];
    const color = colorEstado(p);
    const hora = formatHora12h(p.hora_atencion);
    const { linea1, linea2 } = etiquetaChip(p, hora);
    const esPreEntrega = p.tipo === 'pre_entrega';

    return (
      <div
        onClick={() => { setDiaExpandido(claveDia); setHoraExpandida(hora); }}
        style={{
          background: dark ? `${color}1f` : `${color}14`,
          border: `${esPreEntrega ? '1px dashed' : '0.5px solid'} ${color}55`,
          borderRadius: 4,
          padding: '2px 4px 3px',
          marginBottom: 2,
          color,
          cursor: 'pointer',
          position: 'relative',
          userSelect: 'none',
        }}
        title={`${grupo.length} ${esPreEntrega ? 'actas de pre entrega' : 'papeletas'} iguales (mismo depto y hora) — probablemente subidas por duplicado. Toca para verlas.`}
      >
        <div style={{
          fontSize: 10, lineHeight: '13px', fontWeight: 700,
          wordBreak: 'break-word', paddingRight: 16,
        }}>
          {linea1}
        </div>
        {linea2 && (
          <div style={{ fontSize: 8.5, lineHeight: '11px', fontWeight: 600, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {linea2}
          </div>
        )}
        <span style={{
          position: 'absolute', top: 1, right: 3,
          background: color, color: dark ? '#0B1220' : '#fff', borderRadius: 4,
          padding: '0 3px', fontSize: 7.5, fontWeight: 800, lineHeight: '11px',
        }}>
          ×{grupo.length}
        </span>
      </div>
    );
  };

  /* ---------- render ---------- */
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#fff' } as any}>
          <IonTitle style={{ fontSize: 16, fontWeight: 700 }}>Calendario Post Venta / Pre Entrega</IonTitle>
          {!esMaestro && (
            <IonButtons slot="end">
              <IonButton onClick={abrirSelectorArchivo} disabled={leyendo} title="Subir papeleta de Post Venta">
                {leyendo ? <IonSpinner name="dots" /> : <IonIcon icon={cloudUploadOutline} style={{ fontSize: 20 }} />}
              </IonButton>
              <IonButton onClick={abrirSelectorArchivoActa} disabled={leyendoActa} title="Subir Acta de Pre Entrega">
                {leyendoActa ? <IonSpinner name="dots" /> : <IonIcon icon={documentTextOutline} style={{ fontSize: 20 }} />}
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={onSeleccionarPdf}
      />

      <input
        ref={fileInputActaRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={onSeleccionarActaPreEntrega}
      />

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16, paddingBottom: 96 }}>

          {/* Navegación de mes */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button onClick={mesAnterior} style={navBtnStyle(card, border, textPrimary)}>
              <IonIcon icon={chevronBack} style={{ fontSize: 18 }} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary }}>
                {MESES[cursor.getMonth()]} {cursor.getFullYear()}
              </div>
              <button
                onClick={irAHoy}
                style={{ background: 'transparent', border: 'none', color: accent, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 2 }}
              >
                Ir a hoy
              </button>
            </div>
            <button onClick={mesSiguiente} style={navBtnStyle(card, border, textPrimary)}>
              <IonIcon icon={chevronForward} style={{ fontSize: 18 }} />
            </button>
          </div>

          {/* Filtro por proyecto — sobre todo útil para admin, que ve todos
              los proyectos asignados mezclados en el mismo calendario. Si
              solo hay 0 o 1 proyecto no tiene sentido mostrarlo. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {proyectosFiltro.length > 1 && (
              <select
                value={filtroProyectoId}
                onChange={e => setFiltroProyectoId(e.target.value)}
                style={{
                  flex: 1, height: 40, borderRadius: 10, padding: '0 12px',
                  background: dark ? '#1B2C48' : '#ffffff',
                  border: `0.5px solid ${border}`, color: textPrimary, fontSize: 13,
                  boxSizing: 'border-box', appearance: 'auto', minWidth: 0,
                }}
              >
                <option value="">Todos los proyectos</option>
                {proyectosFiltro.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (${p.codigo})` : ''}</option>
                ))}
              </select>
            )}

            {/* "Lo que nos queda por hacer": deja solo las papeletas con al
                menos 1 observación PENDIENTE. El conteo se recalcula cada
                vez que se recarga el calendario (cargar()), incluida la
                recarga automática por Realtime. */}
            <button
              onClick={() => setSoloPendientes(v => !v)}
              style={{
                flexShrink: 0, height: 40, borderRadius: 10, padding: '0 14px',
                display: 'flex', alignItems: 'center', gap: 6,
                background: soloPendientes ? `${pendienteColor}22` : (dark ? '#1B2C48' : '#ffffff'),
                border: `0.5px solid ${soloPendientes ? pendienteColor : border}`,
                color: soloPendientes ? pendienteColor : textSecondary,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: pendienteColor, flexShrink: 0 }} />
              Pendientes
            </button>
          </div>

          {/* Leyenda — en postventa, el color representa el estado agregado
              de las observaciones (una sola pendiente pinta toda la
              visita); en pre-entrega sigue siendo el estado del formulario,
              ya que no tiene observaciones en esta tabla. */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 10, color: textSecondary, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 3, background: pendienteColor }} />
              Pendiente
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 3, background: accent }} />
              En proceso
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 3, background: verde }} />
              Solucionada / Completada
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 0, borderTop: `1px dashed ${textSecondary}` }} />
              Pre Entrega (borde sólido = Post Venta)
            </div>
          </div>

          {(error || errorSubida) && (
            <div style={{
              background: dark ? 'rgba(248,113,113,0.08)' : '#fef2f2',
              border: `0.5px solid ${dark ? 'rgba(248,113,113,0.25)' : '#fecaca'}`,
              borderRadius: 10, padding: '8px 12px', marginBottom: 12,
              fontSize: 11, color: dark ? '#f87171' : '#b91c1c',
            }}>
              {error || errorSubida}
            </div>
          )}

          {/* Encabezado días de la semana */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, marginBottom: 4 }}>
            {DIAS_SEMANA.map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: textMuted, textTransform: 'uppercase' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Grilla del mes — minmax(0, 1fr) en vez de 1fr: en CSS Grid, un
              ítem NO se achica por debajo del tamaño de su propio contenido
              a menos que se le fuerce min-width:0 (acá, vía minmax). Sin
              esto, un chip con texto largo (white-space: nowrap) empuja el
              ancho de toda la columna más allá del 100% y corta las
              columnas de la derecha (sáb/dom) — el bug real detrás de
              "se ve pésimo en Android": no era del renderer, era CSS Grid
              estándar en cualquier navegador, solo que en el WebView de
              Android se notaba más. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
            {grid.map((fecha, i) => {
              const clave = claveFecha(fecha);
              const delMes = fecha.getMonth() === cursor.getMonth();
              const esHoy = esMismoDia(fecha, hoy);
              const items = porDia.get(clave) ?? [];
              const grupos = agruparPorDeptoHora(items);
              const gruposVisibles = grupos.slice(0, 3);
              const gruposRestantes = grupos.length - gruposVisibles.length;
              const esObjetivoDrag = celdaSobre === clave;

              return (
                <div
                  key={i}
                  data-fecha-key={clave}
                  style={{
                    // minHeight (no height fijo): en CSS Grid, todas las
                    // celdas de una misma FILA ya se emparejan solas al alto
                    // de la más alta — lo único que hacía que no crecieran
                    // era este valor fijo. Con minHeight, un día con más
                    // chips estira su fila completa (columnas de ese ancho
                    // no se tocan), igual que en Google Calendar: se
                    // deforma verticalmente, nunca horizontalmente.
                    minHeight: 88,
                    minWidth: 0, // ver comentario de arriba sobre CSS Grid
                    borderRadius: 8,
                    padding: '3px 2px',
                    background: esObjetivoDrag
                      ? (dark ? 'rgba(96,165,250,0.15)' : '#dbeafe')
                      : (delMes ? card : (dark ? 'rgba(22,35,59,0.35)' : '#f8fafc')),
                    border: `0.5px solid ${esHoy ? accent : border}`,
                    opacity: delMes ? 1 : 0.5,
                    transition: 'background 0.1s',
                  }}
                >
                  {/* El número de fecha es el "abrir el día" explícito que
                      pedía el reporte — no depende de acertarle a un chip
                      angosto. Abre el modal en modo "lista de horas". */}
                  <div
                    onClick={() => { setDiaExpandido(clave); setHoraExpandida(null); }}
                    style={{
                      fontSize: 10, fontWeight: esHoy ? 800 : 600,
                      color: esHoy ? accent : (delMes ? textPrimary : textMuted),
                      marginBottom: 2, paddingLeft: 2, cursor: 'pointer',
                    }}
                  >
                    {fecha.getDate()}
                  </div>

                  {gruposVisibles.map(g => <ChipGrupo key={g[0].id} grupo={g} claveDia={clave} />)}

                  {gruposRestantes > 0 && (
                    <button
                      onClick={() => { setDiaExpandido(clave); setHoraExpandida(null); }}
                      style={{
                        width: '100%',
                        background: dark ? 'rgba(96,165,250,0.1)' : 'rgba(37,99,235,0.06)',
                        border: `0.5px solid ${dark ? 'rgba(96,165,250,0.25)' : 'rgba(37,99,235,0.2)'}`,
                        borderRadius: 4,
                        padding: '3px 0',
                        fontSize: 9, fontWeight: 700,
                        color: accent,
                        cursor: 'pointer',
                        marginTop: 1,
                      }}
                    >
                      +{gruposRestantes} más
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: 24, color: textMuted, fontSize: 12 }}>
              Cargando visitas agendadas...
            </div>
          )}

          {!loading && papeletasFiltradas.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: textMuted, fontSize: 12 }}>
              {filtroProyectoId
                ? 'Este proyecto no tiene visitas agendadas.'
                : 'No hay visitas agendadas todavía.'}
            </div>
          )}
        </div>
      </IonContent>

      {/* Avatar flotante mientras se arrastra un chip */}
      {arrastrandoId && posArrastre && papeletaArrastrada && (
        <div
          style={{
            position: 'fixed',
            left: posArrastre.x - 40,
            top: posArrastre.y - 16,
            width: 80,
            pointerEvents: 'none',
            zIndex: 999,
            background: colorEstado(papeletaArrastrada),
            color: '#fff',
            borderRadius: 8,
            padding: '4px 8px',
            fontSize: 10,
            fontWeight: 700,
            textAlign: 'center',
            boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
            transform: 'scale(1.1)',
          }}
        >
          {[papeletaArrastrada.proyecto_codigo || papeletaArrastrada.condominio, papeletaArrastrada.torre_codigo, papeletaArrastrada.depto_numero].filter(Boolean).join(' ')}
        </div>
      )}

      {/* Modal: confirmar a qué depto pertenece la papeleta recién subida */}
      <IonModal isOpen={!!match} onDidDismiss={cancelarSubida} initialBreakpoint={0.75} breakpoints={[0, 0.75, 1]}>
        {match && (
          <div style={{ padding: 20, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>Confirma el depto</div>
              <button onClick={cancelarSubida} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <IonIcon icon={closeOutline} style={{ fontSize: 22, color: textSecondary }} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: textSecondary, marginBottom: 16 }}>
              Se preseleccionó lo más parecido a lo que dice el PDF. Revisa y corrige si hace falta.
            </div>

            {/* Lo que se leyó del PDF, para comparar visualmente */}
            <div style={{
              background: dark ? 'rgba(96,165,250,0.08)' : '#eff6ff',
              border: `0.5px solid ${dark ? 'rgba(96,165,250,0.25)' : '#bfdbfe'}`,
              borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: 11, color: textSecondary,
            }}>
              <div><strong style={{ color: textPrimary }}>Leído del PDF:</strong></div>
              <div>{match.datos.proyecto || match.datos.condominio || '—'}{match.datos.etapa ? ` · ${match.datos.etapa}` : ''}</div>
              <div>Torre/Edificio: {match.datos.torre || '—'} · Depto: {match.datos.depto || '—'}</div>
              <div>{match.observaciones.length} observación(es)</div>
            </div>

            {/* Fecha/hora editables — la plantilla "orden_visita" no
                siempre trae una hora de visita confiable (ver
                extraerPapeletaPdf.ts: esa plantilla imprime la hora de
                REGISTRO del pedido, no la de la visita), así que quedan
                editables acá en vez de solo mostradas como texto. */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={selectLabelStyle(textMuted)}>Fecha de visita</label>
                <input
                  type="date"
                  value={fechaTextoAIso(match.datos.fechaAtencion)}
                  onChange={e => {
                    const nueva = isoAFechaTexto(e.target.value);
                    setMatch(m => (m ? { ...m, datos: { ...m.datos, fechaAtencion: nueva } } : m));
                  }}
                  style={selectStyle(dark, border, textPrimary)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={selectLabelStyle(textMuted)}>Hora</label>
                <input
                  type="text"
                  placeholder="Ej: 10:30"
                  value={match.datos.horaAtencion}
                  onChange={e => {
                    const nueva = e.target.value;
                    setMatch(m => (m ? { ...m, datos: { ...m.datos, horaAtencion: nueva } } : m));
                  }}
                  style={selectStyle(dark, border, textPrimary)}
                />
              </div>
            </div>

            <label style={selectLabelStyle(textMuted)}>Proyecto</label>
            <select
              value={match.proyectoId}
              onChange={e => cambiarProyecto(e.target.value)}
              style={selectStyle(dark, border, textPrimary)}
            >
              <option value="">Seleccionar proyecto...</option>
              {match.proyectos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (${p.codigo})` : ''}</option>
              ))}
            </select>
            {(() => {
              const proyectoSel = match.proyectos.find(p => p.id === match.proyectoId);
              const textoPdf = (match.datos.proyecto || match.datos.condominio || '').trim();
              if (!proyectoSel || !textoPdf) return null;
              const t = norm(sinPrefijoProyecto(textoPdf));
              const yaCalzan = t === norm(sinPrefijoProyecto(proyectoSel.nombre));
              const yaAprendido = match.aliasesConocidos.some(a => a.alias_normalizado === t);
              if (yaCalzan || yaAprendido) return null;
              return (
                <div style={{ fontSize: 10, color: textMuted, marginTop: -8, marginBottom: 14 }}>
                  Se va a recordar que "{textoPdf}" corresponde a {proyectoSel.nombre} — las próximas papeletas con ese mismo texto van a matchear solas.
                </div>
              );
            })()}

            <label style={selectLabelStyle(textMuted)}>Torre</label>
            <select
              value={match.torreId}
              onChange={e => cambiarTorre(e.target.value)}
              disabled={!match.proyectoId || match.cargandoTorres}
              style={selectStyle(dark, border, textPrimary)}
            >
              <option value="">
                {match.cargandoTorres ? 'Cargando...' : (match.proyectoId ? 'Seleccionar torre...' : 'Elige un proyecto primero')}
              </option>
              {match.torres.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>

            <label style={selectLabelStyle(textMuted)}>Departamento</label>
            <select
              value={match.deptoId}
              onChange={e => cambiarDepto(e.target.value)}
              disabled={!match.torreId || match.cargandoDeptos}
              style={selectStyle(dark, border, textPrimary)}
            >
              <option value="">
                {match.cargandoDeptos ? 'Cargando...' : (match.torreId ? 'Seleccionar depto...' : 'Elige una torre primero')}
              </option>
              {match.deptos.map(x => (
                <option key={x.id} value={x.id}>{x.numero}</option>
              ))}
            </select>

            {errorSubida && (
              <div style={{ fontSize: 11, color: dark ? '#f87171' : '#b91c1c', marginBottom: 12 }}>
                {errorSubida}
              </div>
            )}

            {(() => {
              const fechaPdf = parseFechaFlexible(match.datos.fechaAtencion);
              if (!match.deptoId || !fechaPdf) return null;
              const duplicados = papeletas.filter(x => {
                if (x.departamento_id !== match.deptoId) return false;
                const f = parseFechaFlexible(x.fecha_atencion);
                return f && claveFecha(f) === claveFecha(fechaPdf);
              });
              if (duplicados.length === 0) return null;
              return (
                <div style={{
                  background: dark ? 'rgba(251,191,36,0.08)' : '#fffbeb',
                  border: `0.5px solid ${dark ? 'rgba(251,191,36,0.3)' : '#fde68a'}`,
                  borderRadius: 10, padding: '10px 12px', marginBottom: 14,
                  fontSize: 11, color: dark ? '#fbbf24' : '#92400e',
                }}>
                  Ya hay {duplicados.length === 1 ? 'una visita agendada' : `${duplicados.length} visitas agendadas`} para
                  este depto el {match.datos.fechaAtencion}. Si continúas, se va a crear otra papeleta separada — revisa
                  que no sea la misma que ya subiste antes de confirmar.
                </div>
              );
            })()}

            <button
              onClick={confirmarYCrear}
              disabled={!match.proyectoId || !match.torreId || !match.deptoId || creando}
              style={{
                width: '100%', height: 48, borderRadius: 12, marginTop: 8,
                background: (!match.proyectoId || !match.torreId || !match.deptoId || creando)
                  ? (dark ? '#1E2E4A' : '#f1f5f9')
                  : (dark ? 'linear-gradient(135deg, #243550, #2E4468)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)'),
                border: 'none',
                color: (!match.proyectoId || !match.torreId || !match.deptoId || creando) ? textMuted : '#fff',
                fontSize: 15, fontWeight: 700,
                cursor: (!match.proyectoId || !match.torreId || !match.deptoId || creando) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {creando ? <IonSpinner name="dots" /> : 'Confirmar y continuar'}
            </button>
          </div>
        )}
      </IonModal>

      {/* Modal: confirmar a qué depto pertenece el Acta de Pre Entrega recién subida */}
      <IonModal isOpen={!!matchActa} onDidDismiss={cancelarSubidaActa} initialBreakpoint={0.75} breakpoints={[0, 0.75, 1]}>
        {matchActa && (
          <div style={{ padding: 20, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>Confirma el depto</div>
              <button onClick={cancelarSubidaActa} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <IonIcon icon={closeOutline} style={{ fontSize: 22, color: textSecondary }} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: textSecondary, marginBottom: 16 }}>
              Se preseleccionó lo más parecido a lo que dice el Acta. Revisa y corrige si hace falta.
            </div>

            {/* Lo que se leyó del PDF, para comparar visualmente */}
            <div style={{
              background: dark ? 'rgba(96,165,250,0.08)' : '#eff6ff',
              border: `0.5px solid ${dark ? 'rgba(96,165,250,0.25)' : '#bfdbfe'}`,
              borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: 11, color: textSecondary,
            }}>
              <div><strong style={{ color: textPrimary }}>Leído del Acta:</strong></div>
              <div>{matchActa.datos.proyecto || '—'}{matchActa.datos.ciudad ? ` · ${matchActa.datos.ciudad}` : ''}</div>
              <div>Edificio: {matchActa.datos.edificio || '—'} · Depto: {matchActa.datos.deptoNumero || '—'}</div>
              <div>Propietario: {matchActa.datos.propietarioNombre || '—'}{matchActa.datos.propietarioRut ? ` · ${matchActa.datos.propietarioRut}` : ''}</div>
              {matchActa.datos.fechaPromesaLarga && <div>Promesa: {matchActa.datos.fechaPromesaLarga}</div>}
              {matchActa.datos.procesoVenta && <div>Proceso de venta: {matchActa.datos.procesoVenta}</div>}
              {matchActa.datos.banco && <div>Banco: {matchActa.datos.banco}</div>}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={selectLabelStyle(textMuted)}>Fecha de visita</label>
                <input
                  type="date"
                  value={fechaTextoAIso(matchActa.datos.fechaAtencion)}
                  onChange={e => {
                    const nueva = isoAFechaTexto(e.target.value);
                    setMatchActa(m => (m ? { ...m, datos: { ...m.datos, fechaAtencion: nueva } } : m));
                  }}
                  style={selectStyle(dark, border, textPrimary)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={selectLabelStyle(textMuted)}>Hora</label>
                <input
                  type="text"
                  placeholder="Ej: 10:30"
                  value={matchActa.datos.horaAtencion}
                  onChange={e => {
                    const nueva = e.target.value;
                    setMatchActa(m => (m ? { ...m, datos: { ...m.datos, horaAtencion: nueva } } : m));
                  }}
                  style={selectStyle(dark, border, textPrimary)}
                />
              </div>
            </div>

            <label style={selectLabelStyle(textMuted)}>Proyecto</label>
            <select
              value={matchActa.proyectoId}
              onChange={e => cambiarProyectoActa(e.target.value)}
              style={selectStyle(dark, border, textPrimary)}
            >
              <option value="">Seleccionar proyecto...</option>
              {matchActa.proyectos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}{p.codigo ? ` (${p.codigo})` : ''}</option>
              ))}
            </select>
            {(() => {
              const proyectoSel = matchActa.proyectos.find(p => p.id === matchActa.proyectoId);
              const textoPdf = (matchActa.datos.proyecto || '').trim();
              if (!proyectoSel || !textoPdf) return null;
              const t = norm(sinPrefijoProyecto(textoPdf));
              const yaCalzan = t === norm(sinPrefijoProyecto(proyectoSel.nombre));
              const yaAprendido = matchActa.aliasesConocidos.some(a => a.alias_normalizado === t);
              if (yaCalzan || yaAprendido) return null;
              return (
                <div style={{ fontSize: 10, color: textMuted, marginTop: -8, marginBottom: 14 }}>
                  Se va a recordar que "{textoPdf}" corresponde a {proyectoSel.nombre} — las próximas actas con ese mismo texto van a matchear solas.
                </div>
              );
            })()}

            <label style={selectLabelStyle(textMuted)}>Edificio / Torre</label>
            <select
              value={matchActa.torreId}
              onChange={e => cambiarTorreActa(e.target.value)}
              disabled={!matchActa.proyectoId || matchActa.cargandoTorres}
              style={selectStyle(dark, border, textPrimary)}
            >
              <option value="">
                {matchActa.cargandoTorres ? 'Cargando...' : (matchActa.proyectoId ? 'Seleccionar torre...' : 'Elige un proyecto primero')}
              </option>
              {matchActa.torres.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>

            <label style={selectLabelStyle(textMuted)}>Departamento</label>
            <select
              value={matchActa.deptoId}
              onChange={e => cambiarDeptoActa(e.target.value)}
              disabled={!matchActa.torreId || matchActa.cargandoDeptos}
              style={selectStyle(dark, border, textPrimary)}
            >
              <option value="">
                {matchActa.cargandoDeptos ? 'Cargando...' : (matchActa.torreId ? 'Seleccionar depto...' : 'Elige una torre primero')}
              </option>
              {matchActa.deptos.map(x => (
                <option key={x.id} value={x.id}>{x.numero}</option>
              ))}
            </select>

            {errorSubida && (
              <div style={{ fontSize: 11, color: dark ? '#f87171' : '#b91c1c', marginBottom: 12 }}>
                {errorSubida}
              </div>
            )}

            {(() => {
              const fechaPdf = parseFechaFlexible(matchActa.datos.fechaAtencion);
              if (!matchActa.deptoId || !fechaPdf) return null;
              const duplicados = papeletas.filter(x => {
                if (x.tipo !== 'pre_entrega' || x.departamento_id !== matchActa.deptoId) return false;
                const f = parseFechaFlexible(x.fecha_atencion);
                return f && claveFecha(f) === claveFecha(fechaPdf);
              });
              if (duplicados.length === 0) return null;
              return (
                <div style={{
                  background: dark ? 'rgba(251,191,36,0.08)' : '#fffbeb',
                  border: `0.5px solid ${dark ? 'rgba(251,191,36,0.3)' : '#fde68a'}`,
                  borderRadius: 10, padding: '10px 12px', marginBottom: 14,
                  fontSize: 11, color: dark ? '#fbbf24' : '#92400e',
                }}>
                  Ya hay {duplicados.length === 1 ? 'una pre-entrega agendada' : `${duplicados.length} pre-entregas agendadas`} para
                  este depto el {matchActa.datos.fechaAtencion}. Revisa que no sea la misma que ya subiste antes de confirmar.
                </div>
              );
            })()}

            <button
              onClick={confirmarYCrearActa}
              disabled={!matchActa.proyectoId || !matchActa.torreId || !matchActa.deptoId || creandoActa}
              style={{
                width: '100%', height: 48, borderRadius: 12, marginTop: 8,
                background: (!matchActa.proyectoId || !matchActa.torreId || !matchActa.deptoId || creandoActa)
                  ? (dark ? '#1E2E4A' : '#f1f5f9')
                  : (dark ? 'linear-gradient(135deg, #243550, #2E4468)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)'),
                border: 'none',
                color: (!matchActa.proyectoId || !matchActa.torreId || !matchActa.deptoId || creandoActa) ? textMuted : '#fff',
                fontSize: 15, fontWeight: 700,
                cursor: (!matchActa.proyectoId || !matchActa.torreId || !matchActa.deptoId || creandoActa) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {creandoActa ? <IonSpinner name="dots" /> : 'Confirmar y continuar'}
            </button>
          </div>
        )}
      </IonModal>

      {/* Modal: día expandido — drill-down de 2 niveles.
          Nivel 1 (horaExpandida === null): lista de horas agendadas ese día.
          Nivel 2 (horaExpandida !== null): detalle de esa hora (proyecto/
          torre/depto + observaciones si es postventa). Existe porque un chip
          de la grilla es demasiado angosto para mostrar código de proyecto +
          torre + depto + hora legible a la vez — acá sí hay espacio. */}
      <IonModal isOpen={!!diaExpandido} onDidDismiss={cerrarModalDia} initialBreakpoint={0.6} breakpoints={[0, 0.6, 1]}>
        <div style={{ padding: 20, background: card, height: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            {horaExpandida && (
              <button onClick={() => setHoraExpandida(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <IonIcon icon={chevronBack} style={{ fontSize: 18, color: textSecondary }} />
              </button>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary, flex: 1 }}>
              {horaExpandida
                ? horaExpandida
                : (diaExpandido ? `Visitas del ${diaExpandido.split('-').reverse().join('-')}` : '')}
            </div>
            <button onClick={cerrarModalDia} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <IonIcon icon={closeOutline} style={{ fontSize: 22, color: textSecondary }} />
            </button>
          </div>

          {(() => {
            const itemsDia = porDia.get(diaExpandido ?? '') ?? [];

            // ---------- Nivel 1: lista de horas ----------
            if (!horaExpandida) {
              const porHora = new Map<string, PapeletaCalendario[]>();
              for (const p of itemsDia) {
                const h = formatHora12h(p.hora_atencion) || 'Sin hora';
                if (!porHora.has(h)) porHora.set(h, []);
                porHora.get(h)!.push(p);
              }
              const horas = Array.from(porHora.entries());
              if (horas.length === 0) {
                return <div style={{ fontSize: 12, color: textMuted, textAlign: 'center', padding: 24 }}>No hay visitas agendadas este día.</div>;
              }
              return horas.map(([hora, items]) => {
                const resumen = items
                  .map(p => `${p.proyecto_codigo || p.condominio || ''}-${p.torre_codigo || ''} ${p.depto_numero || ''}`.trim())
                  .join(', ');

                // Reemplaza el punto de color de antes: en vez de solo avisar
                // "hay algo pendiente" con un punto, dice textualmente cuál
                // es el estado agregado del grupo — considerando que una
                // misma hora puede mezclar postventa y pre-entrega, y que
                // postventa puede a su vez mezclar varias papeletas con
                // distinto estado agregado cada una.
                const { texto: textoEstadoHora, color: colorEstadoHora } = (() => {
                  const postventaItems = items.filter(p => p.tipo === 'postventa');
                  const preEntregaItems = items.filter(p => p.tipo === 'pre_entrega');

                  // Cualquier PENDIENTE domina sobre todo lo demás.
                  if (postventaItems.some(p => estadoAgregadoPorPapeleta.get(p.id) === 'PENDIENTE')) {
                    return { texto: 'Pendiente', color: pendienteColor };
                  }
                  if (postventaItems.some(p => estadoAgregadoPorPapeleta.get(p.id) === 'EN_PROCESO')) {
                    return { texto: 'En proceso', color: accent };
                  }

                  const todasPostventaOk = postventaItems.length === 0 ||
                    postventaItems.every(p => estadoAgregadoPorPapeleta.get(p.id) === 'SOLUCIONADO');
                  const todasPreEntregaOk = preEntregaItems.length === 0 ||
                    preEntregaItems.every(p => p.estado === 'COMPLETADA');

                  if (postventaItems.length > 0 && preEntregaItems.length === 0) {
                    return todasPostventaOk
                      ? { texto: 'Solucionada', color: verde }
                      : { texto: 'Sin observaciones', color: textMuted };
                  }
                  if (preEntregaItems.length > 0 && postventaItems.length === 0) {
                    return todasPreEntregaOk
                      ? { texto: 'Acta generada', color: verde }
                      : { texto: 'Agendada', color: accent };
                  }
                  // Mezcla de ambos tipos en la misma hora.
                  return (todasPostventaOk && todasPreEntregaOk)
                    ? { texto: 'Solucionada', color: verde }
                    : { texto: 'En proceso', color: accent };
                })();

                return (
                  <button
                    key={hora}
                    onClick={() => setHoraExpandida(hora)}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px', marginBottom: 8, borderRadius: 10,
                      border: `0.5px solid ${border}`, background: dark ? '#1B2C48' : '#f8fafc', cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: accent, minWidth: 72 }}>{hora}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {resumen}
                      </div>
                      <div style={{ fontSize: 10, color: textMuted, marginTop: 1 }}>
                        {items.length === 1 ? '1 visita' : `${items.length} visitas`}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: colorEstadoHora, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {textoEstadoHora}
                    </div>
                    <IonIcon icon={chevronForward} style={{ fontSize: 14, color: textMuted, flexShrink: 0 }} />
                  </button>
                );
              });
            }

            // ---------- Nivel 2: detalle de la hora tocada ----------
            const itemsHora = itemsDia.filter(p => (formatHora12h(p.hora_atencion) || 'Sin hora') === horaExpandida);
            return itemsHora.map(p => {
              const obs = obsPorPapeleta[p.id];
              return (
                <div
                  key={p.id}
                  style={{
                    borderRadius: 10, border: `0.5px solid ${border}`,
                    background: dark ? '#1B2C48' : '#f8fafc', marginBottom: 8, overflow: 'hidden',
                  }}
                >
                  <div
                    onClick={() => { cerrarModalDia(); abrirDepto(p); }}
                    style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>
                        {p.proyecto_codigo || p.condominio || ''} · Torre {p.torre_codigo} · Depto {p.depto_numero}
                      </div>
                      <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>
                        {p.tipo === 'pre_entrega' ? 'Pre Entrega' : 'Post Venta'} · {formatHora12h(p.hora_atencion)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (borrandoEvento !== p.id) eliminarEvento(p); }}
                      disabled={borrandoEvento === p.id}
                      title="Eliminar (agendado por error)"
                      style={{
                        flexShrink: 0, background: 'transparent', border: 'none', padding: 6, marginTop: -4, marginRight: -6,
                        cursor: borrandoEvento === p.id ? 'default' : 'pointer',
                        color: dark ? '#f87171' : '#b91c1c',
                        opacity: borrandoEvento === p.id ? 0.4 : 1,
                        display: esMaestro ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <IonIcon icon={trashOutline} style={{ fontSize: 16 }} />
                    </button>
                  </div>

                  <div style={{ padding: '0 14px 12px 14px' }}>
                    {p.tipo === 'pre_entrega' ? (
                      <div style={{
                        display: 'inline-block', fontSize: 8, fontWeight: 800, borderRadius: 5,
                        padding: '2px 6px', color: dark ? '#0B1220' : '#fff',
                        background: colorEstado(p),
                      }}>
                        {p.estado === 'COMPLETADA' ? 'ACTA GENERADA' : 'AGENDADA'}
                      </div>
                    ) : (
                      <>
                        {obs === undefined && cargandoObsDia && (
                          <div style={{ fontSize: 10, color: textMuted }}>Cargando observaciones...</div>
                        )}
                        {obs && obs.length === 0 && (
                          <div style={{ fontSize: 10, color: textMuted }}>Sin observaciones registradas.</div>
                        )}
                        {obs && obs.map((o, i) => {
                          const colorBadge = o.estado === 'SOLUCIONADO' ? verde
                            : o.estado === 'EN_PROCESO' ? accent
                            : pendienteColor;
                          const textoBadge = o.estado === 'SOLUCIONADO' ? 'SOLUCIONADO'
                            : o.estado === 'EN_PROCESO' ? 'EN PROCESO'
                            : 'PENDIENTE';
                          const textoObs = o.solicitud_cliente || o.observacion || 'Sin descripción';
                          return (
                            <div
                              key={i}
                              style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0',
                                borderTop: i === 0 ? `0.5px solid ${border}` : 'none',
                              }}
                            >
                              <span style={{
                                flexShrink: 0, marginTop: 1, fontSize: 8, fontWeight: 800, borderRadius: 5,
                                padding: '2px 5px', whiteSpace: 'nowrap',
                                color: dark ? '#0B1220' : '#fff',
                                background: colorBadge,
                              }}>
                                {textoBadge}
                              </span>
                              <span style={{ fontSize: 11, color: textSecondary, lineHeight: 1.4 }}>
                                {o.ambiente && <strong style={{ color: textPrimary }}>{o.ambiente}: </strong>}
                                {textoObs}
                              </span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </IonModal>

      <BottomNavBar activeTab={'calendario' as any} />
    </IonPage>
  );
};

const navBtnStyle = (card: string, border: string, color: string): React.CSSProperties => ({
  width: 36, height: 36, borderRadius: 10, background: card,
  border: `0.5px solid ${border}`, color, display: 'flex',
  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
});

const selectLabelStyle = (color: string): React.CSSProperties => ({
  fontSize: 9, color, display: 'block', marginBottom: 6,
  textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600,
});

const selectStyle = (dark: boolean, border: string, color: string): React.CSSProperties => ({
  width: '100%', height: 44, borderRadius: 10, padding: '0 12px',
  background: dark ? '#1B2C48' : '#ffffff',
  border: `0.5px solid ${border}`, color, fontSize: 14,
  boxSizing: 'border-box', marginBottom: 14, appearance: 'auto',
});

export default CalendarioPostVenta;
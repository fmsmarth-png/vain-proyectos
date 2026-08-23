import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonButton, IonSpinner, IonModal
} from '@ionic/react';
import { useEffect, useState, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { cache } from '../Context/CacheContext';
import { comprimirImagen } from '../utils/comprimirImagen';
import FotoAnnotator from '../components/FotoAnnotator';
import { generarActaPreEntrega, ObsActa } from '../utils/pdfActaPreEntrega';
import { nombreSemanaActual } from '../utils/semanasVain';

interface FotoUploaderProps {
  preview: string | null;
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onAnnotate?: () => void;
  label: string;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  labelStyle: React.CSSProperties;
  border: string;
  dark: boolean;
  textMuted: string;
}

const FotoUploader: React.FC<FotoUploaderProps> = ({
  preview, onSelect, onClear, onAnnotate, label,
  inputRef, labelStyle, border, dark, textMuted,
}) => (
  <>
    <label style={{ ...labelStyle, color: textMuted }}>{label}</label>
    {preview ? (
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <img src={preview} style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'cover' }} />
        {onAnnotate && (
          <button onClick={onAnnotate} style={{ position: 'absolute', top: 8, right: 44, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>
        )}
        <button onClick={onClear} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
      </div>
    ) : (
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 80, borderRadius: 12, border: `0.5px dashed ${border}`, marginBottom: 16, cursor: 'pointer', color: textMuted, gap: 6, background: dark ? 'transparent' : '#f8fafc' }}>
        <span style={{ fontSize: 22 }}>📷</span>
        <span style={{ fontSize: 12 }}>Tomar o adjuntar foto</span>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onSelect} style={{ display: 'none' }} />
      </label>
    )}
  </>
);

const SESSION_KEY = 'pre_entrega_depto_state';
const datosKey = (id: string) => `pre_entrega_datos_${id}`;

const urlToBase64 = async (url: string): Promise<string | undefined> => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return undefined; }
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      resolve(res.substring(res.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const formatRut = (value: string): string => {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean;
  const dv = clean.slice(-1);
  const cuerpo = clean.slice(0, -1).replace(/[^0-9]/g, '').slice(0, 8);
  const cuerpoFmt = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpoFmt}-${dv}`;
};

const guardarPdf = async (pdf: any, fileName: string, deptoNumero: any) => {
  if (Capacitor.isNativePlatform()) {
    const blob = pdf.output('blob');
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    try {
      await Share.share({
        title: fileName,
        text: `Acta de pre-entrega · Depto ${deptoNumero}`,
        url: uri,
        dialogTitle: 'Guardar / compartir acta',
      });
    } catch {
      // El usuario cerró el diálogo
    }
  } else {
    pdf.save(fileName);
  }
};

const PreEntregaDepto: React.FC = () => {
  const history  = useHistory();
  const location = useLocation<any>();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { online, pendientes, agregarPendientePreEntrega } = useOffline();
  const userIdRef      = useRef<string>('');
  // Nombre tal cual está en `usuarios`. El state inspectorNombre va en
  // mayúsculas para el acta; en la BD se guarda sin transformar.
  const userNombreRef  = useRef<string>(localStorage.getItem('detalles_user_nombre') ?? '');
  const firmaCanvasRef = useRef<HTMLCanvasElement>(null);
  const dibujandoRef   = useRef(false);
  const mountedRef     = useRef(false);
  const inputFotoRef   = useRef<HTMLInputElement | null>(null);
  const fotoWorkerRef  = useRef(false); // evita que el worker de subida corra dos veces a la vez

  const resolveNavState = () => {
    if (location.state?.depto) return location.state;
    try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };

  const navState = resolveNavState();
  const depto    = navState?.depto    ?? null;
  const torre    = navState?.torre    ?? null;
  const proyectoNav = navState?.proyecto ?? null;

  // ✅ FIX: Estado para proyecto completo (con todos los campos acta_*)
  const [proyectoCompleto, setProyectoCompleto] = useState<any>(proyectoNav);
  const proyecto = proyectoCompleto; // Usar el proyecto completo

  const bg            = dark ? '#0B1220' : '#f0f4f8';
  const card          = dark ? '#16233B'  : '#ffffff';
  const border        = dark ? '#243550'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#5D728F' : '#94a3b8';
  const toolbar       = dark ? '#0E1728' : '#1e3a5f';
  const inputBg       = dark ? '#1B2C48' : '#ffffff';
  const inputBorder   = dark ? '#243550' : '#cbd5e1';

  const [ambientes, setAmbientes] = useState<any[]>([]);
  const [partidas, setPartidas]   = useState<any[]>([]);
  const [bancos, setBancos]       = useState<any[]>([]);

  const [ambienteId, setAmbienteId]   = useState('');
  const [partidaId, setPartidaId]     = useState('');
  const [observacion, setObservacion] = useState('');
  const [foto, setFoto]               = useState<File | Blob | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  const [guardando, setGuardando]         = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [registrosDepto, setRegistrosDepto] = useState<number>(0);
  const [guardadoOk, setGuardadoOk]       = useState(false);

  const [modalTerminar, setModalTerminar] = useState(false);
  const [propNombre, setPropNombre]       = useState('');
  const [propRut, setPropRut]             = useState('');
  const [fechaPromesa, setFechaPromesa]   = useState('');
  const [bancoSel, setBancoSel]           = useState('');
  const [procesoVenta, setProcesoVenta]   = useState('');
  const [inspectorRut, setInspectorRut]   = useState('');
  const [inspectorNombre, setInspectorNombre] = useState('');
  const [firmaDataUrl, setFirmaDataUrl]   = useState<string | null>(null);
  const [generando, setGenerando]         = useState(false);
  const [errorActa, setErrorActa]         = useState('');
  const [actaGenerada, setActaGenerada]   = useState(false);

  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [datosOk, setDatosOk]               = useState(false);

  const [fotoParaAnotar, setFotoParaAnotar] = useState<string | null>(null);

  useEffect(() => {
    if (location.state?.depto) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(location.state)); } catch {}
    }
  }, [location.state]);

  // ✅ FIX: Cargar proyecto completo desde BD para garantizar que trae TODOS los campos acta_*
  useEffect(() => {
    if (!proyectoNav?.id) return;

    const cargarProyectoCompleto = async () => {
      try {
        const { data, error } = await supabase
          .from('proyectos')
          .select('*')
          .eq('id', proyectoNav.id)
          .maybeSingle();

        if (error) {
          console.error('[PreEntregaDepto] Error cargando proyecto completo:', error);
          // Mantener el proyecto del navigation state si falla
          setProyectoCompleto(proyectoNav);
        } else if (data) {
          console.log('[PreEntregaDepto] ✅ Proyecto completo cargado:', {
            id: data.id,
            acta_nombre_inmobiliaria: data.acta_nombre_inmobiliaria,
            acta_direccion: data.acta_direccion,
            acta_ciudad: data.acta_ciudad,
            acta_telefono: data.acta_telefono,
            acta_email: data.acta_email,
            acta_nombre_legal: data.acta_nombre_legal,
            acta_logo_url: data.acta_logo_url,
          });
          setProyectoCompleto(data);
        } else {
          setProyectoCompleto(proyectoNav);
        }
      } catch (err: any) {
        console.error('[PreEntregaDepto] Excepción cargando proyecto:', err.message);
        setProyectoCompleto(proyectoNav);
      }
    };

    cargarProyectoCompleto();
  }, [proyectoNav?.id]);

  useIonViewDidEnter(() => {
    const currentState = (() => {
      if (location.state?.depto) return location.state;
      try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
    })();
    if (!currentState?.depto) { history.replace('/pre-entrega'); return; }
    mountedRef.current = false;
    if (!mountedRef.current) {
      mountedRef.current = true;
      resetFormulario();
      cargar(currentState.depto);
      // Reintenta subir fotos que quedaron pendientes de una sesión anterior
      // (cierre de app / señal caída durante la subida en segundo plano).
      reintentarFotosPendientes();
    }
  });

  const salir = () => {
    sessionStorage.removeItem(SESSION_KEY);
    history.goBack();
  };

  const resetFormulario = () => {
    setRegistrosDepto(0);
    setAmbienteId(''); setPartidaId(''); setObservacion('');
    setFoto(null); setFotoPreview(null);
  };

  useEffect(() => {
    if (!modalTerminar) return;
    const timer = setTimeout(() => {
      const canvas = firmaCanvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d'); if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (rect.width > 0 && rect.height > 0) {
        canvas.width  = Math.round(rect.width  * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 2 * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setFirmaDataUrl(null);

      const prevent = (e: TouchEvent) => e.preventDefault();
      canvas.addEventListener('touchstart', prevent, { passive: false });
      canvas.addEventListener('touchmove', prevent, { passive: false });
      return () => { canvas.removeEventListener('touchstart', prevent); canvas.removeEventListener('touchmove', prevent); };
    }, 300);
    return () => clearTimeout(timer);
  }, [modalTerminar]);

  const getPos = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = firmaCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = rect.width  > 0 ? canvas.width  / rect.width  : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  };

  const iniciarDibujo = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault(); dibujandoRef.current = true;
    const canvas = firmaCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const dibujar = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    if (!dibujandoRef.current) return; e.preventDefault();
    const canvas = firmaCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
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

  const cargar = async (deptoData?: any) => {
    const deptoActual = deptoData ?? depto;
    if (!deptoActual) return;
    setLoading(true);
    const ambCache = cache.getAmbientes(), partCache = cache.getPartidas();
    if (ambCache.length > 0) setAmbientes(ambCache);
    if (partCache.length > 0) setPartidas(partCache);
    const idGuardado = localStorage.getItem('detalles_user_id') ?? '';
    if (idGuardado) userIdRef.current = idGuardado;

    try {
      const raw = localStorage.getItem(datosKey(deptoActual.id));
      if (raw) {
        const d = JSON.parse(raw);
        if (d.propNombre)   setPropNombre(d.propNombre);
        if (d.propRut)      setPropRut(d.propRut);
        if (d.fechaPromesa) setFechaPromesa(d.fechaPromesa);
        if (d.bancoSel)     setBancoSel(d.bancoSel);
        if (d.procesoVenta) setProcesoVenta(d.procesoVenta);
      }
    } catch {}

    if (online) {
      try {
        const [amb, part, bnc] = await Promise.all([
          supabase.from('ambientes').select('*').order('nombre'),
          supabase.from('partidas').select('*').order('nombre'),
          supabase.from('bancos').select('*').eq('activo', true).order('orden'),
        ]);
        if (amb.data)  { setAmbientes(amb.data); cache.setAmbientes(amb.data); }
        if (part.data) { setPartidas(part.data); cache.setPartidas(part.data); }
        if (bnc.data)  setBancos(bnc.data);
      } catch {}

      try {
        // Se filtra por departamento_id: es la clave real. Filtrar por
        // depto_numero + proyecto_id mezclaría torres distintas del mismo
        // proyecto si algún día se repite un número de departamento.
        const { count } = await supabase.from('observacionesinformepv').select('id', { count: 'exact' })
          .eq('departamento_id', deptoActual.id)
          .eq('tipo', 'PRE-E');
        if (count !== null) setRegistrosDepto(count);
      } catch {}

      try {
        const { data: d } = await supabase.from('departamentos')
          .select('propietario_nombre, acta_propietario_rut, acta_fecha_promesa, acta_banco, acta_proceso_venta')
          .eq('id', deptoActual.id).maybeSingle();
        if (d) {
          if (d.propietario_nombre)   setPropNombre(String(d.propietario_nombre).toUpperCase());
          if (d.acta_propietario_rut) setPropRut(formatRut(String(d.acta_propietario_rut)));
          if (d.acta_fecha_promesa)   setFechaPromesa(String(d.acta_fecha_promesa));
          if (d.acta_banco)           setBancoSel(String(d.acta_banco));
          if (d.acta_proceso_venta)   setProcesoVenta(String(d.acta_proceso_venta).toUpperCase());
        }
      } catch {}

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          userIdRef.current = user.id;
          localStorage.setItem('detalles_user_id', user.id);
          const { data: u } = await supabase.from('usuarios').select('nombre, rut').eq('id', user.id).single();
          if (u) {
            const nom = String(u.nombre ?? '').trim();
            setInspectorNombre(nom.toUpperCase());
            userNombreRef.current = nom;
            try { localStorage.setItem('detalles_user_nombre', nom); } catch {}
            if (u.rut) setInspectorRut(formatRut(u.rut));
          }
        }
      } catch {}
    }
    setLoading(false);
  };

  const seleccionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFoto(file); setFotoPreview(URL.createObjectURL(file));
    if (inputFotoRef.current) inputFotoRef.current.value = '';
    try { const blob = await comprimirImagen(file); setFoto(blob); } catch {}
  };

  const handleAnnotationConfirm = async (blob: Blob) => {
    if (!fotoParaAnotar) return;
    const urlOriginal = fotoParaAnotar;
    setFotoParaAnotar(null);
    setFotoPreview(URL.createObjectURL(blob)); setFoto(blob);
    URL.revokeObjectURL(urlOriginal);
    try {
      const f = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      const comprimido = await comprimirImagen(f); setFoto(comprimido);
    } catch {}
  };

  // ────────────────────────────────────────────────────────────────────────
  // Subida de fotos en SEGUNDO PLANO (no bloquea el registro de la obs).
  // La foto se persiste en localStorage → sobrevive a un cierre de app y se
  // reintenta al volver a entrar a la pantalla. La obs se inserta al toque con
  // foto_url=null; cuando la imagen sube, se hace UPDATE de foto_url por id.
  // ────────────────────────────────────────────────────────────────────────
  const FOTOS_PEND_KEY = 'pre_entrega_fotos_pendientes';

  const blobToDataURL = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  const leerFotosPendientes = (): any[] => {
    try { return JSON.parse(localStorage.getItem(FOTOS_PEND_KEY) || '[]'); } catch { return []; }
  };
  const guardarFotosPendientes = (arr: any[]) => {
    try { localStorage.setItem(FOTOS_PEND_KEY, JSON.stringify(arr)); } catch {}
  };

  // Sube UNA foto (subida + update de foto_url por id). Devuelve true si lo logró.
  const subirUnaFoto = async (item: any): Promise<boolean> => {
    try {
      const blob = await (await fetch(item.base64)).blob();
      const fileName = `pre-entrega/${item.proyectoId}/${item.deptoId}/${item.obsId}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('fotos-registros')
        .upload(fileName, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('fotos-registros').getPublicUrl(fileName);
      const { error: updErr } = await supabase
        .from('observacionesinformepv')
        .update({ foto_url: publicUrl })
        .eq('id', item.obsId);
      if (updErr) throw updErr;
      return true;
    } catch (e) {
      console.warn('[PreEntrega] Foto no subió, se reintentará:', e);
      return false;
    }
  };

  // WORKER: procesa la cola de fotos DE A UNA (en serie). Con red lenta, subir
  // en paralelo es contraproducente (compiten por el ancho de banda); en serie
  // cada foto usa todo el ancho y una falla no arrastra a las demás. Un flag
  // impide que el worker corra dos veces a la vez aunque se registren varias obs
  // seguidas. Las que fallan se reintentan con backoff (2s, 4s, 8s... máx 30s).
  const procesarColaFotos = async () => {
    if (fotoWorkerRef.current) return;      // ya hay un worker corriendo
    if (!online) return;
    fotoWorkerRef.current = true;
    try {
      let fallosSeguidos = 0;
      while (online) {
        const cola = leerFotosPendientes();
        if (cola.length === 0) break;
        const item = cola[0];
        const ok = await subirUnaFoto(item);
        if (ok) {
          guardarFotosPendientes(leerFotosPendientes().filter((f: any) => f.obsId !== item.obsId));
          fallosSeguidos = 0;
        } else {
          fallosSeguidos++;
          if (fallosSeguidos >= 5) break; // cortar: se reintenta al reentrar o al recuperar señal
          const delay = Math.min(2000 * Math.pow(2, fallosSeguidos - 1), 30000);
          await new Promise(res => setTimeout(res, delay));
        }
      }
    } finally {
      fotoWorkerRef.current = false;
    }
  };

  // Encola la foto (persistida) y despierta al worker sin bloquear.
  const encolarFotoPendiente = async (obsId: string, fotoBlob: File | Blob) => {
    try {
      const base64 = await blobToDataURL(fotoBlob);
      const arr = leerFotosPendientes();
      arr.push({ obsId, proyectoId: proyecto.id, deptoId: depto.id, base64 });
      guardarFotosPendientes(arr);
      void procesarColaFotos();
    } catch (e) {
      console.warn('[PreEntrega] No se pudo encolar la foto:', e);
    }
  };

  // Reintenta la cola (al entrar a la pantalla / recuperar señal).
  const reintentarFotosPendientes = () => {
    void procesarColaFotos();
  };

  const guardar = async () => {
    if (!ambienteId || !partidaId || !observacion.trim()) { setError('Ambiente, partida y observación son obligatorios'); return; }
    setGuardando(true); setError(''); setGuardadoOk(false);
    try {
      // userId/email desde ref/localStorage: ya se resolvieron en cargar().
      // Evitamos el getUser() bloqueante (timeout 3s) en cada obs.
      const userId = userIdRef.current || localStorage.getItem('detalles_user_id') || '';
      const userEmail = localStorage.getItem('detalles_user_email') || '';
      if (!userId) { setError('No se pudo identificar el usuario'); setGuardando(false); return; }

      // Nombres resueltos EN MEMORIA (ya cargados en los <select>): sin ir a la red.
      const ambienteName = ambientes.find(a => a.id === ambienteId)?.nombre || '';
      const partidaName  = partidas.find(p => p.id === partidaId)?.nombre || '';

      const semanaCreacion = nombreSemanaActual();
      if (!semanaCreacion) {
        console.warn('Hoy quedó fuera del calendario de semanas VAIN: hay que extender la tabla');
      }

      // id de fila generado en cliente → insert idempotente + enlace de la foto.
      const obsId = (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const datosObservacion = {
        id: obsId,
        proyecto_id: proyecto.id,
        proyecto_codigo: proyecto.codigo || '',
        torre_codigo: torre.nombre || torre.codigo || '',
        depto_numero: depto.numero,
        departamento_id: depto.id,
        tipo: 'PRE-E',
        estado: 'PENDIENTE',
        observacion: observacion.trim(),
        ambiente: ambienteName,
        partida_afectada: partidaName,
        causa: null,
        usuario_id: userId,
        usuario_email: userEmail.toLowerCase(),
        usuario_nombre: userNombreRef.current || null,
        fecha_creacion: new Date().toISOString(),
        semana_creacion: semanaCreacion,
        foto_url: null, // la foto sube en segundo plano y luego actualiza esta fila
      };

      // Capturamos la foto antes de limpiar el formulario.
      const fotoActual = foto;

      if (online) {
        // Carrera contra 2s: si la red RESPONDE rápido, guardado normal (confirmado
        // al toque). Si tarda más, NO bloqueamos al inspector: la obs va a la cola
        // offline, que la sincroniza cuando pueda. Como es upsert idempotente por id,
        // aunque el insert lento sí llegue tarde, la cola no lo duplica.
        const resultado = await Promise.race([
          supabase
            .from('observacionesinformepv')
            .upsert(datosObservacion, { onConflict: 'id', ignoreDuplicates: true })
            .then(r => (r.error ? { estado: 'error' as const, msg: r.error.message } : { estado: 'ok' as const })),
          new Promise<{ estado: 'timeout' }>(res => setTimeout(() => res({ estado: 'timeout' }), 2000)),
        ]);

        if (resultado.estado === 'error') {
          console.error('Error al guardar:', resultado.msg);
          setError('Error: ' + resultado.msg);
          setGuardando(false);
          return;
        }

        if (resultado.estado === 'timeout') {
          // Red lenta → a la cola (misma obs con id; el OfflineContext hace upsert).
          await agregarPendientePreEntrega(datosObservacion, fotoActual ?? undefined);
        } else {
          // Insert rápido OK → la foto va en segundo plano (worker en serie).
          if (fotoActual) void encolarFotoPendiente(obsId, fotoActual);
        }
      } else {
        // Offline: la cola del OfflineContext maneja obs + foto (ya idempotente por id).
        await agregarPendientePreEntrega(datosObservacion, fotoActual ?? undefined);
      }

      setObservacion(''); setAmbienteId(''); setPartidaId('');
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
      setFoto(null); setFotoPreview(null);
      if (inputFotoRef.current) inputFotoRef.current.value = '';
      setRegistrosDepto(prev => prev + 1);
      setGuardadoOk(true); setTimeout(() => setGuardadoOk(false), 2500);
    } catch (e: any) { setError('Error inesperado: ' + e.message); }
    setGuardando(false);
  };

  const guardarDatosPropietario = async () => {
    if (!depto?.id) return;
    if (!propNombre.trim() && !propRut.trim() && !fechaPromesa && !bancoSel && !procesoVenta.trim()) {
      setErrorActa('Ingresa al menos un dato del propietario para guardar');
      return;
    }
    setGuardandoDatos(true);
    setErrorActa('');
    setDatosOk(false);

    let guardoEnBd = false;
    if (online) {
      try {
        const { error } = await supabase.from('departamentos').update({
          propietario_nombre:   propNombre.trim(),
          acta_propietario_rut: propRut.trim(),
          acta_fecha_promesa:   fechaPromesa || null,
          acta_banco:           bancoSel,
          acta_proceso_venta:   procesoVenta.trim() || null,
        }).eq('id', depto.id);

        if (error) throw new Error(error.message);
        guardoEnBd = true;
      } catch (e: any) {
        setErrorActa(`Error: ${e.message}`);
        setGuardandoDatos(false);
      }
    }

    try {
      localStorage.setItem(datosKey(depto.id), JSON.stringify({
        propNombre,
        propRut,
        fechaPromesa,
        bancoSel,
        procesoVenta,
      }));
    } catch {}

    setGuardandoDatos(false);
    if (guardoEnBd || !online) {
      setErrorActa('');
      setDatosOk(true);
      setTimeout(() => setDatosOk(false), 3000);
    }
  };

  const generarActa = async () => {
    // ✅ FIX: Validar que proyecto tiene datos requeridos para el acta
    if (!proyecto) { setErrorActa('Error: Proyecto no cargado'); return; }
    if (!proyecto.acta_nombre_inmobiliaria) { setErrorActa('Error: Nombre inmobiliaria no configurado en Admin'); return; }
    if (!proyecto.acta_direccion) { setErrorActa('Error: Dirección no configurada en Admin'); return; }
    if (!proyecto.acta_ciudad) { setErrorActa('Error: Ciudad no configurada en Admin'); return; }
    // Teléfono es opcional: muchos proyectos no tienen número asociado.
    // El PDF ya lo omite si viene vacío (ver pdfActaPreEntrega.ts).
    if (!proyecto.acta_email) { setErrorActa('Error: Email no configurado en Admin'); return; }
    if (!proyecto.acta_nombre_legal) { setErrorActa('Error: Nombre legal no configurado en Admin'); return; }

    if (!propNombre.trim()) { setErrorActa('El nombre del propietario es obligatorio'); return; }
    if (!propRut.trim())    { setErrorActa('El RUT del propietario es obligatorio'); return; }
    if (!fechaPromesa)      { setErrorActa('La fecha de la promesa es obligatoria'); return; }
    if (!inspectorRut.trim()) { setErrorActa('El RUT del inspector es obligatorio'); return; }
    if (!firmaDataUrl)      { setErrorActa('La firma del propietario es obligatoria'); return; }

    setGenerando(true); setErrorActa('');
    try {
      // ✅ FIX: Logs detallados de los datos que se van a usar en el PDF
      console.log('[PreEntregaDepto] Generando acta con datos:', {
        proyecto_id: proyecto.id,
        nombreInmobiliaria: proyecto.acta_nombre_inmobiliaria,
        direccion: proyecto.acta_direccion,
        ciudad: proyecto.acta_ciudad,
        telefono: proyecto.acta_telefono,
        email: proyecto.acta_email,
        nombreLegal: proyecto.acta_nombre_legal,
        logoUrl: proyecto.acta_logo_url,
        propNombre,
        depto: depto.numero,
        torre: torre?.nombre,
      });

      const { data: regs, error: regErr } = await supabase
        .from('observacionesinformepv')
        .select('observacion, ambiente')
        .eq('departamento_id', depto.id)
        .eq('tipo', 'PRE-E');
      if (regErr) throw new Error(regErr.message);

      const observaciones: ObsActa[] = (regs ?? []).map((r: any) => ({
        ambiente: r.ambiente ?? '',
        descripcion: r.observacion ?? '',
      }));

      let logoBase64: string | undefined;
      if (proyecto.acta_logo_url) logoBase64 = await urlToBase64(proyecto.acta_logo_url);

      const pdf = generarActaPreEntrega({
        nombreInmobiliaria: proyecto.acta_nombre_inmobiliaria ?? proyecto.nombre ?? '',
        direccion:          proyecto.acta_direccion ?? proyecto.direccion ?? '',
        ciudad:             proyecto.acta_ciudad ?? '',
        telefono:           proyecto.acta_telefono ?? '',
        email:              proyecto.acta_email ?? '',
        nombreLegal:        proyecto.acta_nombre_legal ?? '',
        logoBase64,
        deptoNumero:        depto.numero,
        edificio:           torre?.nombre,
        propietarioNombre:  propNombre.trim(),
        propietarioRut:     propRut.trim(),
        fechaPromesa,
        banco:              bancoSel,
        procesoVenta:       procesoVenta.trim(),
        inspectorNombre,
        inspectorRut:       inspectorRut.trim(),
        observaciones,
        firmaPropietarioBase64: firmaDataUrl,
        fechaGeneracion:    new Date(),
      });

      const fileName = `Acta_PreEntrega_Depto_${depto.numero}_${Date.now()}.pdf`;
      await guardarPdf(pdf, fileName, depto.numero);

      // La firma ya quedó embebida en el PDF (se generó arriba con
      // firmaDataUrl), así que el propietario se lleva su acta firmada aunque
      // esto falle. Pero si esta subida falla, `firma_propietario_url` queda
      // en null en la base de datos mientras `fecha_firma` se guarda igual,
      // como si todo hubiera salido bien — cualquiera que revise el registro
      // después vería "firmado" sin poder ver la firma. Por eso reintentamos
      // un par de veces antes de darnos por vencidos, y si aun así falla,
      // avisamos explícitamente en vez de guardar silenciosamente.
      let firmaUrl: string | null = null;
      let firmaFallo = false;
      try {
        const firmaBlob = await fetch(firmaDataUrl).then(r => r.blob());
        if (firmaBlob.size > 0) {
          const firmaFileName = `firma_depto_${depto.id}_${Date.now()}.png`;
          const firmaFile = new File([firmaBlob], firmaFileName, { type: 'image/png' });

          let subida = false;
          for (let intento = 0; intento < 3 && !subida; intento++) {
            if (intento > 0) await new Promise(res => setTimeout(res, 1000 * intento));
            const { error: fErr } = await supabase.storage
              .from('fotos-registros')
              .upload(`firmas/${firmaFileName}`, firmaFile, { upsert: true });
            if (!fErr) {
              const { data } = supabase.storage
                .from('fotos-registros')
                .getPublicUrl(`firmas/${firmaFileName}`);
              firmaUrl = data.publicUrl;
              subida = true;
            }
          }
          if (!subida) firmaFallo = true;
        }
      } catch {
        firmaFallo = true;
      }

      // El RUT va solo a acta_propietario_rut. Antes también se escribía en
      // propietario_contacto, que es donde vive el teléfono, y lo destruía.
      const { error: updErr } = await supabase.from('departamentos').update({
        propietario_nombre:     propNombre.trim(),
        acta_propietario_rut:   propRut.trim(),
        acta_fecha_promesa:     fechaPromesa,
        acta_banco:             bancoSel,
        acta_proceso_venta:     procesoVenta.trim() || null,
        acta_generada_en:       new Date().toISOString(),
        firma_propietario_url:  firmaUrl,
        fecha_firma:            new Date().toISOString(),
      }).eq('id', depto.id);

      if (updErr) throw new Error(updErr.message);

      try { localStorage.removeItem(datosKey(depto.id)); } catch {}

      if (firmaFallo) {
        // El acta en PDF ya se generó y descargó/compartió con la firma
        // incluida, así que no bloqueamos eso. Pero avisamos que el enlace de
        // la firma no quedó guardado en el sistema, para que alguien lo
        // resuelva manualmente (volviendo a generar el acta con conexión).
        // Mantenemos el formulario visible (no la pantalla de éxito) para
        // que el aviso se vea, y no cerramos el modal ni salimos solos.
        setErrorActa('El acta se generó y descargó correctamente, pero no se pudo guardar la firma en el sistema (revisa tu conexión). El PDF ya tiene la firma incluida.');
      } else {
        setActaGenerada(true);
        setTimeout(() => {
          setModalTerminar(false);
          setActaGenerada(false);
          salir();
        }, 1800);
      }

    } catch (e: any) {
      setErrorActa('Error: ' + e.message);
    }
    setGenerando(false);
  };

  const labelStyle  = { fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };
  const selectStyle = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };
  const taStyle     = { width: '100%', height: 80, borderRadius: 10, padding: '10px 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, resize: 'none' as any, marginBottom: 12 };
  const inputStyle  = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };
  const sepLine     = dark ? 'linear-gradient(90deg, transparent, #243550, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';

  if (loading && ambientes.length === 0) return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }} onClick={salir}>← Volver</IonButton>
          <IonTitle style={{ fontSize: 15 }}>Cargando...</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': bg }}>
        <div style={{ textAlign: 'center', marginTop: 100 }}><IonSpinner name="crescent" /></div>
      </IonContent>
    </IonPage>
  );

  return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }} onClick={salir}>← Volver</IonButton>
          <IonTitle style={{ fontSize: 14, fontWeight: 600 }}>ACTA · TORRE {torre?.nombre} · {depto?.numero}</IonTitle>
          <div slot="end" style={{ paddingRight: 14 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : '#fbbf24' }} />
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          <div style={{ background: dark ? 'linear-gradient(135deg, #16233B 0%, #1E2E4A 100%)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 12, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: dark ? 'linear-gradient(135deg, #1E2E4A, #26395C)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: dark ? '0.5px solid #2E4468' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: dark ? '#888' : '#fff', flexShrink: 0 }}>
              {depto?.numero}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: dark ? '#60a5fa' : '#2563eb', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>{proyecto?.nombre}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>
                Torre {torre?.nombre}{torre?.frente ? ` (${torre.frente})` : ''} · Depto {depto?.numero}
              </div>
              <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{depto?.id_obra}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: registrosDepto > 0 ? (dark ? '#f87171' : '#b91c1c') : textMuted, lineHeight: 1 }}>{registrosDepto}</div>
              <div style={{ fontSize: 9, color: textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '1px' }}>obs</div>
            </div>
          </div>

          <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 12, padding: '8px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d', fontWeight: 500 }}>🏠 Pre-entrega — obs para el acta</span>
          </div>

          {!online && (
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#fbbf24' }}>Sin conexión — obs en cola{pendientes > 0 ? ` · ${pendientes}` : ''}</span>
            </div>
          )}
          {guardadoOk && (
            <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d' }}>✓ Observación registrada</span>
            </div>
          )}

          <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Nueva observación</div>
          <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

          <div style={{ background: dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#fff', borderRadius: 16, padding: 16, border: `0.5px solid ${border}`, marginBottom: 12 }}>
            <label style={labelStyle}>ambiente *</label>
            <select value={ambienteId} onChange={e => setAmbienteId(e.target.value)} style={selectStyle}>
              <option value="">Seleccionar ambiente...</option>
              {ambientes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>

            <label style={labelStyle}>partida afectada *</label>
            <select value={partidaId} onChange={e => setPartidaId(e.target.value)} style={selectStyle}>
              <option value="">Seleccionar partida...</option>
              {partidas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>

            <label style={labelStyle}>observación *</label>
            <textarea value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Describe la observación..." style={taStyle} />

            <FotoUploader
              labelStyle={labelStyle} border={border} dark={dark} textMuted={textMuted}
              preview={fotoPreview}
              onSelect={seleccionarFoto}
              onClear={() => { if (fotoPreview) URL.revokeObjectURL(fotoPreview); setFoto(null); setFotoPreview(null); if (inputFotoRef.current) inputFotoRef.current.value = ''; }}
              onAnnotate={fotoPreview ? () => setFotoParaAnotar(fotoPreview) : undefined}
              label="foto"
              inputRef={inputFotoRef}
            />

            {error && (
              <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px', borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca' }}>{error}</div>
            )}

            <button onClick={guardar} disabled={guardando} style={{
              width: '100%', height: 48, borderRadius: 12,
              background: guardando ? (dark ? 'linear-gradient(135deg, #1E2E4A, #26395C)' : '#f1f5f9') : (dark ? 'linear-gradient(135deg, #243550, #2E4468)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)'),
              border: guardando ? `0.5px solid ${border}` : 'none',
              color: guardando ? textMuted : '#fff',
              fontSize: 15, fontWeight: 700, cursor: guardando ? 'not-allowed' : 'pointer'
            }}>
              {guardando ? 'Guardando...' : '✓ Registrar observación'}
            </button>
          </div>

          <button onClick={() => setModalTerminar(true)} style={{
            width: '100%', height: 46, borderRadius: 12, background: 'transparent',
            border: `0.5px solid ${dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0'}`,
            color: dark ? '#4ade80' : '#15803d',
            fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 40
          }}>
            📝 Datos del propietario / generar acta
          </button>

        </div>

        <IonModal isOpen={modalTerminar} onDidDismiss={() => setModalTerminar(false)}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            {actaGenerada ? (
              <div style={{ textAlign: 'center', paddingTop: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: dark ? '#4ade80' : '#15803d' }}>Acta generada correctamente</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Datos del acta</div>
                <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>Torre {torre?.nombre} · Depto {depto?.numero} · {registrosDepto} obs registradas</div>

                <label style={labelStyle}>nombre propietario *</label>
                <input value={propNombre} onChange={e => setPropNombre(e.target.value.toUpperCase())} placeholder="EJ: JUAN PEDRO PEREZ PEREZ" style={inputStyle} />

                <label style={labelStyle}>RUT propietario *</label>
                <input value={propRut} onChange={e => setPropRut(formatRut(e.target.value))} inputMode="text" maxLength={12} placeholder="Ej: 12.345.678-9" style={inputStyle} />

                <label style={labelStyle}>fecha promesa de compra venta *</label>
                <input type="date" value={fechaPromesa} onChange={e => setFechaPromesa(e.target.value)} style={inputStyle} />

                <label style={labelStyle}>banco (crédito hipotecario)</label>
                <select value={bancoSel} onChange={e => setBancoSel(e.target.value)} style={selectStyle}>
                  <option value="">Seleccionar banco...</option>
                  {bancos.map(b => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
                </select>

                <label style={labelStyle}>n° proceso de venta</label>
                <input value={procesoVenta} onChange={e => setProcesoVenta(e.target.value.toUpperCase())} placeholder="Ej: 12345" style={inputStyle} />

                <button onClick={guardarDatosPropietario} disabled={guardandoDatos} style={{
                  width: '100%', height: 46, borderRadius: 12, background: 'transparent',
                  border: `0.5px solid ${dark ? '#2E4468' : '#cbd5e1'}`,
                  color: guardandoDatos ? textMuted : (dark ? '#93c5fd' : '#1e3a5f'),
                  fontSize: 14, fontWeight: 600, cursor: guardandoDatos ? 'not-allowed' : 'pointer', marginBottom: 8
                }}>
                  {guardandoDatos ? 'Guardando...' : '💾 Guardar datos del propietario'}
                </button>
                <div style={{ fontSize: 11, color: textMuted, marginBottom: 8, lineHeight: 1.4 }}>
                  Puedes guardarlos ahora y volver luego para firmar y generar el acta. Quedan asociados a este departamento.
                </div>
                {datosOk && (
                  <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 10, padding: '8px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d' }}>✓ Datos del propietario guardados{!online ? ' (en el dispositivo)' : ''}</span>
                  </div>
                )}

                <div style={{ height: '0.5px', background: sepLine, margin: '8px 0 20px' }} />

                <label style={labelStyle}>RUT inspector (quien toma las obs) *</label>
                <input value={inspectorRut} onChange={e => setInspectorRut(formatRut(e.target.value))} inputMode="text" maxLength={12} placeholder="Ej: 12.552.916-K" style={inputStyle} />
                <div style={{ fontSize: 11, color: textMuted, marginTop: -6, marginBottom: 14 }}>Inspector: {inspectorNombre || '—'}</div>

                <label style={{ ...labelStyle, marginBottom: 8 }}>firma del propietario *</label>
                <div style={{ border: `0.5px solid ${border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 8, background: '#ffffff' }}>
                  <canvas
                    ref={firmaCanvasRef}
                    style={{ display: 'block', width: '100%', height: 160, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                    onMouseDown={iniciarDibujo} onMouseMove={dibujar} onMouseUp={terminarDibujo} onMouseLeave={terminarDibujo}
                    onTouchStart={e => { e.preventDefault(); iniciarDibujo(e); }}
                    onTouchMove={e => { e.preventDefault(); dibujar(e); }}
                    onTouchEnd={e => { e.preventDefault(); terminarDibujo(); }}
                  />
                </div>
                <button onClick={limpiarFirma} style={{ background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 12, borderRadius: 8, padding: '4px 12px', cursor: 'pointer', marginBottom: 20 }}>
                  🗑️ Limpiar firma
                </button>

                {errorActa && (
                  <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px', borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca' }}>{errorActa}</div>
                )}

                <button onClick={generarActa} disabled={generando} style={{
                  width: '100%', height: 48, borderRadius: 12,
                  background: generando ? (dark ? 'linear-gradient(135deg, #1E2E4A, #26395C)' : '#f1f5f9') : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                  border: 'none', color: generando ? textMuted : '#fff',
                  fontSize: 14, fontWeight: 700, cursor: generando ? 'not-allowed' : 'pointer'
                }}>
                  {generando ? 'Generando acta...' : '📄 Generar acta PDF'}
                </button>
                <button onClick={() => setModalTerminar(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>
                  Cerrar
                </button>
              </>
            )}
          </div>
        </IonModal>

      </IonContent>

      {fotoParaAnotar && (
        <FotoAnnotator
          imageSrc={fotoParaAnotar}
          onConfirm={handleAnnotationConfirm}
          onCancel={() => { URL.revokeObjectURL(fotoParaAnotar); setFotoParaAnotar(null); }}
        />
      )}

    </IonPage>
  );
};

export default PreEntregaDepto;
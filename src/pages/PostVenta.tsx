import { IonContent, IonPage, IonHeader, IonToolbar, IonTitle, IonButton, IonSpinner } from '@ionic/react';
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

const SESSION_KEY = 'post_venta_depto_state';
const OTRO = '__OTRO__';

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

interface Catalogo { id: string; nombre: string }
interface Causa extends Catalogo { tipo: 'estandar' | 'tercero' | 'nombre_tercero' }

interface RevisionObs {
  ambienteSel: string;   // nombre del catálogo, '' o OTRO
  ambienteLibre: string; // usado solo cuando ambienteSel === OTRO
  observacion: string;
  partida: string;
  causa: string;
  estado: 'PENDIENTE' | 'SOLUCIONADO';
  fotoAntes: string | null;
  fotoDespues: string | null;
}

const DATOS_VACIOS: DatosSolicitud = {
  condominio: '', depto: '', torre: '', requerimiento: '',
  fechaRegistro: '', fechaAtencion: '', horaAtencion: '',
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

  const [anotando, setAnotando] = useState<{ idx: number; tipo: 'antes' | 'despues'; src: string } | null>(null);

  /* ---------- paleta ---------- */
  const bg = dark ? '#000000' : '#f0f4f8';
  const cardGrad = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border = dark ? '#1e1e1e' : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted = dark ? '#444444' : '#94a3b8';
  const toolbar = dark ? '#000000' : '#1e3a5f';
  const inputBg = dark ? '#111111' : '#ffffff';
  const inputBorder = dark ? '#1e1e1e' : '#cbd5e1';
  const accent = dark ? '#60a5fa' : '#2563eb';
  const sepLine = dark
    ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)'
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
      ? (dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : '#f1f5f9')
      : (dark ? 'linear-gradient(135deg, #1e1e1e, #2a2a2a)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)'),
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
          .from('usuarios').select('nombre').eq('id', uid).maybeSingle();
        if (u?.nombre) {
          const n = String(u.nombre).trim();
          setInspectorNombre(n);
          try { localStorage.setItem('detalles_user_nombre', n); } catch {}
        }
      }
    } catch (e) {
      console.error('Error cargando catálogos:', e);
    }
    setLoading(false);
  };

  const salir = () => history.goBack();

  const reiniciar = () => {
    setDatos(DATOS_VACIOS); setObs([]); setRev([]); setAbierta(null);
    setDesajuste(''); setDesajusteOk(false);
    setRecNombre(''); setRecRut('');
    setFirmaDataUrl(null); setError(''); setPaso('carga');
  };

  const usarDatosPropietario = () => {
    setRecNombre(propietario.nombre);
    setRecRut(formatRut(propietario.rut));
  };

  /* ---------- lectura del PDF ---------- */
  const seleccionarPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

      setDatos(d);
      setObs(observaciones);
      setRev(observaciones.map(o => ({
        ambienteSel: sugerirAmbiente(o.ambiente, ambientes),
        ambienteLibre: '',
        observacion: '', partida: '', causa: '',
        estado: 'SOLUCIONADO' as const,
        fotoAntes: null, fotoDespues: null,
      })));
      setAbierta(0);
      setPaso('revision');
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo leer el PDF');
    }
    setLeyendo(false);
  };

  /* ---------- edición ---------- */
  const setCampo = (idx: number, campo: keyof RevisionObs, valor: any) => {
    setRev(prev => prev.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)));
  };

  const ambienteFinal = (r: RevisionObs) =>
    (r.ambienteSel === OTRO ? r.ambienteLibre : r.ambienteSel).trim();

  const seleccionarFoto = async (idx: number, tipo: 'antes' | 'despues', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const campo = tipo === 'antes' ? 'fotoAntes' : 'fotoDespues';
    try {
      setCampo(idx, campo, await blobToDataUrl(await comprimirImagen(file)));
    } catch {
      setCampo(idx, campo, await blobToDataUrl(file));
    }
  };

  const confirmarAnotacion = async (blob: Blob) => {
    if (!anotando) return;
    const { idx, tipo } = anotando;
    setAnotando(null);
    const campo = tipo === 'antes' ? 'fotoAntes' : 'fotoDespues';
    try {
      const f = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      setCampo(idx, campo, await blobToDataUrl(await comprimirImagen(f)));
    } catch {
      setCampo(idx, campo, await blobToDataUrl(blob));
    }
  };

  const completa = (r: RevisionObs) =>
    !!ambienteFinal(r) && !!r.observacion.trim() && !!r.fotoAntes && !!r.fotoDespues;

  const irAFirma = () => {
    if (desajuste && !desajusteOk) { setError('Confirma la advertencia sobre el departamento antes de continuar'); return; }

    const faltante = rev.findIndex(r => !completa(r));
    if (faltante !== -1) {
      setError(`Observación #${obs[faltante].numero}: falta ambiente, observación o alguna foto`);
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

    setGuardando(true); setError('');
    try {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;
      if (!user?.id) throw new Error('No se pudo identificar el usuario');

      // La fecha de atención es la fecha real de la visita, no el día en que se
      // carga la papeleta. La semana VAIN se calcula desde ahí, no desde hoy.
      const fechaVisita = fechaDesdeDdMmAaaa(datos.fechaAtencion) ?? new Date();
      const fechaCreacion = fechaVisita.toISOString();
      const semanaCreacion = nombreSemana(fechaVisita);

      if (!semanaCreacion) {
        console.warn('Fecha fuera del calendario de semanas VAIN:', datos.fechaAtencion);
      }

      // Firma → storage. No bloquea: si falla, igual queda embebida en el PDF.
      let firmaUrl: string | null = null;
      try {
        const firmaBlob = await fetch(firmaDataUrl).then(r => r.blob());
        if (firmaBlob.size > 0) {
          const nombre = `firma_pv_${depto.id}_${Date.now()}.png`;
          const { error: upErr } = await supabase.storage
            .from('fotos-registros')
            .upload(`firmas/${nombre}`, new File([firmaBlob], nombre, { type: 'image/png' }), { upsert: true });
          if (!upErr) {
            firmaUrl = supabase.storage.from('fotos-registros').getPublicUrl(`firmas/${nombre}`).data.publicUrl;
          }
        }
      } catch { /* ignorado a propósito */ }

      // Los datos del propietario NO se repiten acá: viven en `departamentos`
      // y se alcanzan por departamento_id. Lo que sí es propio de esta visita
      // es quien la recibió y su firma.
      const filas = obs.map((o, i) => ({
        proyecto_id: proyecto.id,
        proyecto_codigo: proyectoCodigo || '',
        torre_codigo: torre.nombre,
        depto_numero: depto.numero,
        departamento_id: depto.id,
        tipo: 'PV',
        estado: rev[i].estado,
        n_requerimiento: datos.requerimiento || null,
        solicitud_cliente: o.descripcion,
        observacion: rev[i].observacion.trim(),
        ambiente: ambienteFinal(rev[i]),
        partida_afectada: rev[i].partida || null,
        causa: rev[i].causa || null,
        receptor_nombre: recNombre.trim(),
        receptor_rut: recRut.trim(),
        receptor_firma_url: firmaUrl,
        usuario_id: user.id,
        usuario_email: (user.email ?? '').toLowerCase(),
        usuario_nombre: inspectorNombre || null,
        fecha_creacion: fechaCreacion,
        semana_creacion: semanaCreacion,
      }));

      const { error: insErr } = await supabase.from('observacionesinformepv').insert(filas);
      if (insErr) throw new Error(insErr.message);

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
          numero: o.numero,
          ambiente: ambienteFinal(rev[i]),
          solicitudCliente: o.descripcion,
          observacion: rev[i].observacion.trim(),
          partida: rev[i].partida || undefined,
          causa: rev[i].causa || undefined,
          estado: rev[i].estado,
          fotoAntes: rev[i].fotoAntes ?? undefined,
          fotoDespues: rev[i].fotoDespues ?? undefined,
        })),
        firmaDataUrl: firmaDataUrl,
        fecha: fechaVisita,
      });

      const fileName = `PostVenta_${torre.nombre}_${depto.numero}_${datos.requerimiento || Date.now()}.pdf`;
      await guardarPdfBlob(pdfBlob, fileName, `Post venta · Torre ${torre.nombre} · Depto ${depto.numero}`);

      setListo(true);
      setTimeout(() => { setListo(false); reiniciar(); }, 2000);
    } catch (e: any) {
      setError('Error: ' + (e?.message ?? 'desconocido'));
    }
    setGuardando(false);
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
      background: dark ? '#111111' : '#f8fafc', border: `0.5px solid ${border}`,
      borderRadius: 10, padding: '6px 10px', flex: '1 1 auto', minWidth: 96,
    }}>
      <div style={{ fontSize: 8, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{valor || '—'}</div>
    </div>
  );

  const tarjetaDepto = (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 14, background: dark ? 'linear-gradient(135deg, #0e0e0e 0%, #161616 100%)' : '#fff' }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12,
        background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
        border: dark ? '0.5px solid #2a2a2a' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color: dark ? '#888' : '#fff', flexShrink: 0,
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
    const campo = tipo === 'antes' ? 'fotoAntes' : 'fotoDespues';
    return (
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>{tipo === 'antes' ? 'antes' : 'después'}</label>
        {src ? (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <img src={src} style={{ width: '100%', borderRadius: 12, maxHeight: 160, objectFit: 'cover', display: 'block' }} />
            <button onClick={() => setAnotando({ idx, tipo, src })}
              style={{ position: 'absolute', top: 6, right: 40, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 26, height: 26, color: '#fff', fontSize: 13, cursor: 'pointer' }}>✏️</button>
            <button onClick={() => setCampo(idx, campo, null)}
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 26, height: 26, color: '#fff', fontSize: 15, cursor: 'pointer' }}>×</button>
          </div>
        ) : (
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: 80, borderRadius: 12, border: `0.5px dashed ${border}`, marginBottom: 12,
            cursor: 'pointer', color: textMuted, gap: 4, background: dark ? 'transparent' : '#f8fafc',
          }}>
            <span style={{ fontSize: 20 }}>📷</span>
            <span style={{ fontSize: 11 }}>Adjuntar</span>
            <input type="file" accept="image/*" capture="environment"
              onChange={e => seleccionarFoto(idx, tipo, e)} style={{ display: 'none' }} />
          </label>
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
            <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any}
              onClick={() => history.push('/dashboard')}>← Volver</IonButton>
            <IonTitle style={{ fontSize: 14, fontWeight: 600 }}>POST VENTA</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg } as any}>
          <div style={{ padding: 24, textAlign: 'center', marginTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🏠</div>
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
            style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any}
            onClick={() => (paso === 'carga' ? salir() : paso === 'firma' ? setPaso('revision') : reiniciar())}>
            ← Volver
          </IonButton>
          <IonTitle style={{ fontSize: 14, fontWeight: 600 }}>
            POST VENTA · TORRE {torre?.nombre} · {depto?.numero}
          </IonTitle>
          <div slot="end" style={{ paddingRight: 14 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : '#fbbf24' }} />
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16 }}>

          {/* ============ PASO 1 · CARGA ============ */}
          {paso === 'carga' && (
            loading ? (
              <div style={{ textAlign: 'center', marginTop: 80 }}><IonSpinner name="crescent" /></div>
            ) : (
              <>
                {tarjetaDepto}

                <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Cargar papeleta</div>
                <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

                <div style={cardStyle}>
                  {errorBox}

                  <input ref={fileInputRef} type="file" accept="application/pdf,.pdf"
                    onChange={seleccionarPdf} style={{ display: 'none' }} />

                  <button onClick={() => fileInputRef.current?.click()}
                    disabled={leyendo} style={btnPrimary(leyendo)}>
                    {leyendo ? 'Leyendo PDF...' : '📄 Seleccionar papeleta PDF'}
                  </button>

                  <div style={{ fontSize: 11, color: textMuted, marginTop: 10, lineHeight: 1.4 }}>
                    Se verifica que la papeleta corresponda a este departamento y se extraen
                    fechas, horario y el listado de requerimientos del cliente.
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
                  <div style={{ fontSize: 12, fontWeight: 700, color: dark ? '#fbbf24' : '#92400e', marginBottom: 6 }}>
                    ⚠️ La papeleta no coincide
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

              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {metaChip('registro', datos.fechaRegistro)}
                {metaChip('atención', datos.fechaAtencion)}
                {metaChip('horario', datos.horaAtencion)}
              </div>

              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Requerimientos del cliente</div>
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
                        background: ok ? (dark ? 'rgba(74,222,128,0.12)' : '#dcfce7') : (dark ? '#161616' : '#f1f5f9'),
                        border: `0.5px solid ${ok ? (dark ? 'rgba(74,222,128,0.3)' : '#bbf7d0') : border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        color: ok ? (dark ? '#4ade80' : '#15803d') : textMuted,
                      }}>{ok ? '✓' : o.numero}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: amb ? textPrimary : textMuted }}>
                          {amb || 'Elegir ambiente'}
                        </div>
                        <div style={{ fontSize: 11, color: textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.descripcion}
                        </div>
                      </div>
                      <div style={{ color: textMuted, fontSize: 12, flexShrink: 0 }}>{open ? '▲' : '▼'}</div>
                    </div>

                    {open && (
                      <div style={{ padding: '0 14px 14px' }}>
                        <div style={{ height: '0.5px', background: sepLine, marginBottom: 14 }} />

                        <label style={labelStyle}>solicitud del cliente</label>
                        <div style={{
                          background: dark ? 'rgba(96,165,250,0.05)' : '#eff6ff',
                          border: `0.5px solid ${dark ? 'rgba(96,165,250,0.15)' : '#bfdbfe'}`,
                          borderRadius: 10, padding: '10px 12px', marginBottom: 6,
                          fontSize: 13, lineHeight: 1.5, color: textPrimary,
                        }}>{o.descripcion}</div>
                        <div style={{ fontSize: 10, color: textMuted, marginBottom: 14 }}>
                          Ubicación indicada por el cliente: <strong>{o.ambiente || '—'}</strong>
                        </div>

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

                        <label style={labelStyle}>estado</label>
                        <select value={r.estado} onChange={e => setCampo(idx, 'estado', e.target.value)} style={inputStyle}>
                          <option value="SOLUCIONADO">Solucionado</option>
                          <option value="PENDIENTE">Pendiente</option>
                        </select>

                        <div style={{ display: 'flex', gap: 12 }}>
                          {fotoSlot(idx, 'antes')}
                          {fotoSlot(idx, 'despues')}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, margin: '20px 0 12px' }}>Quien recibe la visita</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

              <div style={cardStyle}>
                {propietario.nombre ? (
                  <button onClick={usarDatosPropietario}
                    style={{ ...btnGhost, marginBottom: 14, color: accent, borderColor: dark ? 'rgba(96,165,250,0.3)' : '#bfdbfe' }}>
                    👤 Es el propietario ({propietario.nombre})
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

                <label style={labelStyle}>nombre *</label>
                <input value={recNombre} onChange={e => setRecNombre(e.target.value.toUpperCase())}
                  placeholder="EJ: JUAN PEDRO PEREZ" style={inputStyle} />
                <label style={labelStyle}>RUT *</label>
                <input value={recRut} onChange={e => setRecRut(formatRut(e.target.value))}
                  inputMode="text" maxLength={12} placeholder="Ej: 12.345.678-9" style={inputStyle} />
              </div>

              {errorBox}

              <button onClick={irAFirma} style={btnPrimary(false)}>✍️ Continuar a la firma</button>
              <button onClick={reiniciar} style={{ ...btnGhost, marginTop: 8, marginBottom: 40 }}>Cargar otra papeleta</button>
            </>
          )}

          {/* ============ PASO 3 · FIRMA ============ */}
          {paso === 'firma' && (
            listo ? (
              <div style={{ textAlign: 'center', paddingTop: 80 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: dark ? '#4ade80' : '#15803d' }}>Informe generado correctamente</div>
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
                    style={{ background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 12, borderRadius: 8, padding: '4px 12px', cursor: 'pointer', marginBottom: 18 }}>
                    🗑️ Limpiar firma
                  </button>

                  {errorBox}

                  <button onClick={finalizar} disabled={guardando} style={btnPrimary(guardando)}>
                    {guardando ? 'Guardando...' : '📄 Guardar y generar informe'}
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
    </IonPage>
  );
};

export default PostVenta;
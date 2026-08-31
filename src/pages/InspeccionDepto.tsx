import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonButton, IonSpinner
} from '@ionic/react';
import { useEffect, useState, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { cache } from '../Context/CacheContext';
import { comprimirImagen } from '../utils/comprimirImagen';
import FotoAnnotator from '../components/FotoAnnotator';

// ─────────────────────────────────────────────────────────────────────────────
// InspeccionDepto registra SIEMPRE en etapa 'obra'.
//
// Las observaciones se levantan ANTES de que exista propietario, para llegar
// a la pre entrega con menos hallazgos. El flujo con firma de propietario
// vive en PreEntregaDepto.tsx, no acá.
// ─────────────────────────────────────────────────────────────────────────────
const ETAPA_REGISTRO = 'obra';

// ─── FotoUploader FUERA del componente padre ─────────────────────────────────
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
          <button
            onClick={onAnnotate}
            style={{ position: 'absolute', top: 8, right: 44, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✏️</button>
        )}
        <button
          onClick={onClear}
          style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', fontSize: 16, cursor: 'pointer' }}
        >×</button>
      </div>
    ) : (
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 80, borderRadius: 12, border: `0.5px dashed ${border}`, marginBottom: 16, cursor: 'pointer', color: textMuted, gap: 6, background: dark ? 'transparent' : '#f8fafc' }}>
        <span style={{ fontSize: 22 }}>📷</span>
        <span style={{ fontSize: 12 }}>Tomar o adjuntar foto</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onSelect}
          style={{ display: 'none' }}
        />
      </label>
    )}
  </>
);
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'inspeccion_depto_state';

const InspeccionDepto: React.FC = () => {
  const history  = useHistory();
  const location = useLocation<any>();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { online, pendientes, agregarPendiente } = useOffline();
  const userIdRef  = useRef<string>('');
  const mountedRef = useRef(false);

  const inputFotoRef = useRef<HTMLInputElement | null>(null);

  const resolveNavState = () => {
    if (location.state?.depto) return location.state;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const navState = resolveNavState();
  const depto    = navState?.depto    ?? null;
  const torre    = navState?.torre    ?? null;
  const proyecto = navState?.proyecto ?? null;

  const bg            = dark ? '#000000' : '#f0f4f8';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#444444' : '#94a3b8';
  const toolbar       = dark ? '#000000' : '#1e3a5f';
  const inputBg       = dark ? '#111111' : '#ffffff';
  const inputBorder   = dark ? '#1e1e1e' : '#cbd5e1';

  const [ambientes, setAmbientes]                     = useState<any[]>([]);
  const [partidas, setPartidas]                       = useState<any[]>([]);
  const [causasEstandar, setCausasEstandar]           = useState<string[]>([]);
  const [causasTerceros, setCausasTerceros]           = useState<string[]>([]);
  const [nombresTerceros, setNombresTerceros]         = useState<string[]>([]);
  const [ambienteId, setAmbienteId]                   = useState('');
  const [partidaId, setPartidaId]                     = useState('');
  const [observacion, setObservacion]                 = useState('');
  const [causaSeleccionada, setCausaSeleccionada]     = useState('');
  const [terceroSeleccionado, setTerceroSeleccionado] = useState('');
  const [foto, setFoto]                               = useState<File | Blob | null>(null);
  const [fotoPreview, setFotoPreview]                 = useState<string | null>(null);
  const [guardando, setGuardando]                     = useState(false);
  const [error, setError]                             = useState('');
  const [loading, setLoading]                         = useState(true);
  const [registrosDepto, setRegistrosDepto]           = useState<number>(0);
  const [guardadoOk, setGuardadoOk]                   = useState(false);

  // ── Estado anotador: null = oculto, objeto = visible ─────────────────────
  // NO usa IonModal → no contamina el historial de Ionic.
  const [fotoParaAnotar, setFotoParaAnotar] = useState<string | null>(null);

  const esCausaTercero = causasTerceros.includes(causaSeleccionada);
  const causaFinal = esCausaTercero && terceroSeleccionado
    ? `${causaSeleccionada} — ${terceroSeleccionado}`
    : causaSeleccionada;

  useEffect(() => {
    if (location.state?.depto) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(location.state)); } catch {}
    }
  }, [location.state]);

  useIonViewDidEnter(() => {
    const currentState = (() => {
      if (location.state?.depto) return location.state;
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    })();
    if (!currentState?.depto) { history.replace('/inspeccion'); return; }
    mountedRef.current = false;
    if (!mountedRef.current) {
      mountedRef.current = true;
      resetFormulario();
      cargar(currentState.depto);
    }
  });

  const salirAInspeccion = () => {
    sessionStorage.removeItem(SESSION_KEY);
    history.push('/inspeccion');
  };

  const resetFormulario = () => {
    setRegistrosDepto(0);
    setAmbienteId(''); setPartidaId(''); setObservacion('');
    setCausaSeleccionada(''); setTerceroSeleccionado('');
    setFoto(null); setFotoPreview(null);
  };

  const cargar = async (deptoData?: any) => {
    const deptoActual = deptoData ?? depto;
    if (!deptoActual) return;
    setLoading(true);
    const ambCache = cache.getAmbientes(), partCache = cache.getPartidas();
    if (ambCache.length > 0)  setAmbientes(ambCache);
    if (partCache.length > 0) setPartidas(partCache);
    const idGuardado = localStorage.getItem('detalles_user_id') ?? '';
    if (idGuardado) userIdRef.current = idGuardado;
    if (online) {
      try {
        const [amb, part, causas] = await Promise.all([
          supabase.from('ambientes').select('*').order('nombre'),
          supabase.from('partidas').select('*').order('nombre'),
          supabase.from('causas').select('*').order('nombre'),
        ]);
        if (amb.data)  { setAmbientes(amb.data);  cache.setAmbientes(amb.data); }
        if (part.data) { setPartidas(part.data);  cache.setPartidas(part.data); }
        if (causas.data) {
          setCausasEstandar(causas.data.filter(c => c.tipo === 'estandar').map(c => c.nombre));
          setCausasTerceros(causas.data.filter(c => c.tipo === 'tercero').map(c => c.nombre));
          setNombresTerceros(causas.data.filter(c => c.tipo === 'nombre_tercero').map(c => c.nombre));
        }
      } catch {}
      try { const { count } = await supabase.from('registros').select('id', { count: 'exact' }).eq('departamento_id', deptoActual.id); if (count !== null) setRegistrosDepto(count); } catch {}
      try { const { data: { user } } = await supabase.auth.getUser(); if (user?.id) { userIdRef.current = user.id; localStorage.setItem('detalles_user_id', user.id); } } catch {}
    }
    if (!online) { try { const cola = JSON.parse(localStorage.getItem('registros_pendientes') ?? '[]'); setRegistrosDepto(cola.filter((r: any) => r.datos?.departamento_id === deptoActual.id).length); } catch {} }
    setLoading(false);
  };

  const seleccionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    const preview = URL.createObjectURL(file);
    setFoto(file);
    setFotoPreview(preview);
    if (inputFotoRef.current) inputFotoRef.current.value = '';
    try {
      const blob = await comprimirImagen(file);
      setFoto(blob);
    } catch {}
  };

  const limpiarFoto = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFoto(null);
    setFotoPreview(null);
    if (inputFotoRef.current) inputFotoRef.current.value = '';
  };

  const handleAnnotationConfirm = async (blob: Blob) => {
    if (!fotoParaAnotar) return;
    const urlOriginal = fotoParaAnotar;
    setFotoParaAnotar(null);
    const previewUrl = URL.createObjectURL(blob);
    setFotoPreview(previewUrl);
    setFoto(blob);
    URL.revokeObjectURL(urlOriginal);
    try {
      const fileAnotado = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      const comprimido  = await comprimirImagen(fileAnotado);
      setFoto(comprimido);
    } catch {}
  };

  const subirFoto = async (file: File | Blob, userId: string): Promise<string | null> => {
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('fotos-registros')
      .upload(fileName, file, { contentType: 'image/jpeg' });
    // Antes: si fallaba la subida (señal débil, timeout) esto devolvía null
    // y el código seguía insertando la observación SIN foto — de forma
    // silenciosa, sin aviso y sin reintento. Ahora se lanza el error para
    // que el "guardar" de más abajo trate todo el registro (texto + foto)
    // como una falla y lo mande completo a la cola offline, que sí reintenta.
    if (uploadError) throw new Error('No se pudo subir la foto: ' + uploadError.message);
    const { data: urlData } = supabase.storage.from('fotos-registros').getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const guardar = async () => {
    if (!ambienteId || !partidaId || !observacion.trim()) { setError('Ambiente, partida y observación son obligatorios'); return; }
    if (esCausaTercero && !terceroSeleccionado) { setError('Selecciona el tercero responsable'); return; }
    setGuardando(true); setError(''); setGuardadoOk(false);
    try {
      let userId = userIdRef.current || localStorage.getItem('detalles_user_id') || '';
      if (!userId && online) {
        try { const { data: { user } } = await Promise.race([supabase.auth.getUser(), new Promise<any>((_, reject) => setTimeout(() => reject('timeout'), 3000))]); if (user?.id) { userId = user.id; userIdRef.current = user.id; localStorage.setItem('detalles_user_id', user.id); } } catch {}
      }
      if (!userId) { setError('No se pudo identificar el usuario'); setGuardando(false); return; }

      const datos = {
        proyecto_id: proyecto.id,
        torre_id: torre.id,
        departamento_id: depto.id,
        ambiente_id: ambienteId,
        partida_id: partidaId,
        observacion: observacion.trim(),
        causa: causaFinal || null,
        creado_por: userId,
        etapa: ETAPA_REGISTRO,
      };

      if (online) {
        try {
          let foto_url = null;
          if (foto) foto_url = await subirFoto(foto, userId);
          const { error } = await supabase.from('registros').insert({ ...datos, foto_url });
          if (error) throw new Error(error.message);
        } catch { await agregarPendiente(datos, foto as File ?? undefined); }
      } else {
        await agregarPendiente(datos, foto as File ?? undefined);
      }

      setObservacion(''); setCausaSeleccionada(''); setTerceroSeleccionado('');
      limpiarFoto();
      setRegistrosDepto(prev => prev + 1);
      setGuardadoOk(true); setTimeout(() => setGuardadoOk(false), 2500);
    } catch (e: any) { setError('Error inesperado: ' + e.message); }
    setGuardando(false);
  };

  const labelStyle  = { fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };
  const selectStyle = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };
  const taStyle     = { width: '100%', height: 80, borderRadius: 10, padding: '10px 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, resize: 'none' as any, marginBottom: 12 };

  const sepLine    = dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';
  const etapaBg    = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const etapaBord  = dark ? 'rgba(96,165,250,0.2)'  : '#bfdbfe';
  const etapaDot   = dark ? '#60a5fa' : '#3b82f6';
  const etapaColor = dark ? '#60a5fa' : '#1d4ed8';

  const fotoUploaderCommons = { labelStyle, border, dark, textMuted };

  if (loading && ambientes.length === 0) return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' }} onClick={salirAInspeccion}>← Volver</IonButton>
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
          <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' }} onClick={salirAInspeccion}>← Volver</IonButton>
          <IonTitle style={{ fontSize: 14, fontWeight: 600 }}>TORRE {torre?.nombre} · {depto?.numero}</IonTitle>
          <div slot="end" style={{ paddingRight: 14 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : '#fbbf24' }} />
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          {/* Header depto */}
          <div style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e 0%, #161616 100%)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 12, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: dark ? '0.5px solid #2a2a2a' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: dark ? '#888' : '#fff', flexShrink: 0 }}>
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
              <div style={{ fontSize: 9, color: textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '1px' }}>fallas</div>
            </div>
          </div>

          {/* Etapa badge — siempre obra */}
          <div style={{ background: etapaBg, border: `0.5px solid ${etapaBord}`, borderRadius: 12, padding: '8px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: etapaDot, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: etapaColor, fontWeight: 500 }}>
              🏗️ Obra — obs registradas bajo esta etapa
            </span>
          </div>

          {/* Banners estado */}
          {!online && (
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#fbbf24' }}>Sin conexión — guardando localmente{pendientes > 0 ? ` · ${pendientes} en cola` : ''}</span>
            </div>
          )}
          {online && pendientes > 0 && (
            <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d' }}>Sincronizando {pendientes} registro{pendientes !== 1 ? 's' : ''}...</span>
            </div>
          )}
          {guardadoOk && (
            <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d' }}>{online ? '✓ Falla registrada correctamente' : '✓ Guardado localmente'}</span>
            </div>
          )}

          <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Nueva observación</div>
          <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

          {/* Formulario */}
          <div style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#fff', borderRadius: 16, padding: 16, border: `0.5px solid ${border}`, marginBottom: 12 }}>
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
            <textarea value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Describe la falla observada..." style={taStyle} />

            <label style={labelStyle}>causa</label>
            <select value={causaSeleccionada} onChange={e => { setCausaSeleccionada(e.target.value); setTerceroSeleccionado(''); }} style={selectStyle}>
              <option value="">Seleccionar causa...</option>
              <optgroup label="Causas Estándar">
                {causasEstandar.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="Otras Cuadrillas">
                {causasTerceros.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            </select>

            {esCausaTercero && (
              <>
                <label style={{ ...labelStyle, color: '#f97316' }}>cuadrilla responsable *</label>
                <select value={terceroSeleccionado} onChange={e => setTerceroSeleccionado(e.target.value)} style={{ ...selectStyle, border: '0.5px solid rgba(249,115,22,0.4)' }}>
                  <option value="">Seleccionar cuadrilla...</option>
                  {nombresTerceros.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}

            {causaSeleccionada && (
              <div style={{ background: dark ? '#111' : '#f8fafc', border: `0.5px solid ${border}`, borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: textSecondary }}>
                <span style={{ color: textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: '1px' }}>CAUSA: </span>
                {causaFinal || <span style={{ color: textMuted, fontStyle: 'italic' }}>Selecciona la cuadrilla</span>}
              </div>
            )}

            <FotoUploader
              {...fotoUploaderCommons}
              preview={fotoPreview}
              onSelect={seleccionarFoto}
              onClear={limpiarFoto}
              onAnnotate={fotoPreview ? () => setFotoParaAnotar(fotoPreview) : undefined}
              label="foto"
              inputRef={inputFotoRef}
            />

            {error && (
              <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px', borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca' }}>{error}</div>
            )}

            <button onClick={guardar} disabled={guardando} style={{
              width: '100%', height: 48, borderRadius: 12,
              background: guardando ? (dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : '#f1f5f9') : (dark ? 'linear-gradient(135deg, #1e1e1e, #2a2a2a)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)'),
              border: guardando ? `0.5px solid ${border}` : 'none',
              color: guardando ? textMuted : '#fff',
              fontSize: 15, fontWeight: 700, cursor: guardando ? 'not-allowed' : 'pointer'
            }}>
              {guardando ? 'Guardando...' : '✓ Registrar falla'}
            </button>
          </div>

          <button onClick={salirAInspeccion} style={{
            width: '100%', height: 46, borderRadius: 12, background: 'transparent',
            border: `0.5px solid ${border}`,
            color: textMuted,
            fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 40
          }}>
            Terminar inspección
          </button>

        </div>
      </IonContent>

      {/* ── Anotador: div position:fixed, fuera del IonContent ──────────────
          Renderizado condicionalmente SIN IonModal para no contaminar el
          historial de navegación de Ionic.                                */}
      {fotoParaAnotar && (
        <FotoAnnotator
          imageSrc={fotoParaAnotar}
          onConfirm={handleAnnotationConfirm}
          onCancel={() => {
            URL.revokeObjectURL(fotoParaAnotar);
            setFotoParaAnotar(null);
          }}
        />
      )}

    </IonPage>
  );
};

export default InspeccionDepto;
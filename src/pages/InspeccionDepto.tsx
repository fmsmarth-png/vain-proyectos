import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonButton, IonSpinner, IonModal
} from '@ionic/react';
import { useEffect, useState, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { cache } from '../Context/CacheContext';

const etapaLabel: Record<string, string> = {
  obra:        '🏗️ Obra',
  pre_entrega: '🏠 Pre-entrega',
  postventa:   '🔧 Postventa',
};

const InspeccionDepto: React.FC = () => {
  const history  = useHistory();
  const location = useLocation<any>();
  const { depto, torre, proyecto } = location.state || {};
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { online, pendientes, agregarPendiente } = useOffline();
  const userIdRef      = useRef<string>('');
  const firmaCanvasRef = useRef<HTMLCanvasElement>(null);
  const dibujandoRef   = useRef(false);

  const etapaActual: string = proyecto?.etapa === 'pre_entrega_postventa'
    ? (depto?.estado_entrega === 'postventa' ? 'postventa' : 'pre_entrega')
    : 'obra';
  const esPostventa  = etapaActual === 'postventa';
  const esPreEntrega = etapaActual === 'pre_entrega';

  const bg          = dark ? '#000000' : '#f0f4f8';
  const card        = dark ? '#0e0e0e'  : '#ffffff';
  const border      = dark ? '#1e1e1e'  : '#e2e8f0';
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
  const [foto, setFoto]                               = useState<File | null>(null);
  const [fotoPreview, setFotoPreview]                 = useState<string | null>(null);
  const [fotoAntes, setFotoAntes]                     = useState<File | null>(null);
  const [fotoAntesPreview, setFotoAntesPreview]       = useState<string | null>(null);
  const [guardando, setGuardando]                     = useState(false);
  const [error, setError]                             = useState('');
  const [loading, setLoading]                         = useState(true);
  const [registrosDepto, setRegistrosDepto]           = useState<number>(0);
  const [guardadoOk, setGuardadoOk]                   = useState(false);

  const [modalTerminar, setModalTerminar]   = useState(false);
  const [propNombre, setPropNombre]         = useState('');
  const [propRut, setPropRut]               = useState('');
  const [propTelefono, setPropTelefono]     = useState('');
  const [firmaDataUrl, setFirmaDataUrl]     = useState<string | null>(null);
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const [errorFirma, setErrorFirma]         = useState('');
  const [firmaGuardada, setFirmaGuardada]   = useState(false);

  const esCausaTercero = causasTerceros.includes(causaSeleccionada);
  const causaFinal = esCausaTercero && terceroSeleccionado
    ? `${causaSeleccionada} — ${terceroSeleccionado}`
    : causaSeleccionada;

  useEffect(() => {
    if (!depto) { history.push('/inspeccion'); return; }
    setRegistrosDepto(0);
    setAmbienteId(''); setPartidaId(''); setObservacion('');
    setCausaSeleccionada(''); setTerceroSeleccionado('');
    setFoto(null); setFotoPreview(null);
    setFotoAntes(null); setFotoAntesPreview(null);
    cargar();
  }, [depto?.id]);

  useEffect(() => {
    if (!modalTerminar) return;
    const timer = setTimeout(() => {
      const canvas = firmaCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const preventScroll = (e: TouchEvent) => e.preventDefault();
      canvas.addEventListener('touchstart', preventScroll, { passive: false });
      canvas.addEventListener('touchmove', preventScroll, { passive: false });
      return () => { canvas.removeEventListener('touchstart', preventScroll); canvas.removeEventListener('touchmove', preventScroll); };
    }, 300);
    return () => clearTimeout(timer);
  }, [modalTerminar]);

  const iniciarDibujo = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault(); dibujandoRef.current = true;
    const canvas = firmaCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top  : e.clientY - rect.top;
    ctx.beginPath(); ctx.moveTo(x, y);
  };

  const dibujar = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    if (!dibujandoRef.current) return; e.preventDefault();
    const canvas = firmaCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top  : e.clientY - rect.top;
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

  const guardarDatosPreEntrega = async () => {
    if (!propNombre.trim()) { setErrorFirma('El nombre del propietario es obligatorio'); return; }
    if (!firmaDataUrl) { setErrorFirma('La firma del propietario es obligatoria'); return; }
    setGuardandoFirma(true); setErrorFirma('');
    try {
      let firma_url = null;
      const blob = await fetch(firmaDataUrl).then(r => r.blob());
      const fileName = `firmas/${depto.id}_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from('fotos-registros').upload(fileName, blob, { contentType: 'image/png' });
      if (!uploadError) { const { data: urlData } = supabase.storage.from('fotos-registros').getPublicUrl(fileName); firma_url = urlData.publicUrl; }
      const { error } = await supabase.from('departamentos').update({ propietario_nombre: propNombre.trim(), propietario_contacto: `${propRut.trim()} | ${propTelefono.trim()}`, firma_propietario_url: firma_url, fecha_firma: new Date().toISOString() }).eq('id', depto.id);
      if (error) { setErrorFirma('Error al guardar: ' + error.message); setGuardandoFirma(false); return; }
      setFirmaGuardada(true);
      setTimeout(() => { setModalTerminar(false); setFirmaGuardada(false); setPropNombre(''); setPropRut(''); setPropTelefono(''); setFirmaDataUrl(null); history.push('/inspeccion'); }, 1500);
    } catch (e: any) { setErrorFirma('Error inesperado: ' + e.message); }
    setGuardandoFirma(false);
  };

  const cargar = async () => {
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
      try { const { count } = await supabase.from('registros').select('id', { count: 'exact' }).eq('departamento_id', depto.id); if (count !== null) setRegistrosDepto(count); } catch {}
      try { const { data: { user } } = await supabase.auth.getUser(); if (user?.id) { userIdRef.current = user.id; localStorage.setItem('detalles_user_id', user.id); } } catch {}
    }
    if (!online) { try { const cola = JSON.parse(localStorage.getItem('registros_pendientes') ?? '[]'); setRegistrosDepto(cola.filter((r: any) => r.datos?.departamento_id === depto.id).length); } catch {} }
    setLoading(false);
  };

  const seleccionarFoto = (e: React.ChangeEvent<HTMLInputElement>, tipo: 'antes' | 'despues') => {
    const file = e.target.files?.[0]; if (!file) return;
    if (tipo === 'antes') { setFotoAntes(file); setFotoAntesPreview(URL.createObjectURL(file)); }
    else { setFoto(file); setFotoPreview(URL.createObjectURL(file)); }
  };

  const subirFoto = async (file: File, userId: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('fotos-registros').upload(fileName, file);
    if (uploadError) return null;
    const { data: urlData } = supabase.storage.from('fotos-registros').getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const guardar = async () => {
    if (!ambienteId || !partidaId || !observacion.trim()) { setError('Ambiente, partida y observación son obligatorios'); return; }
    if (esCausaTercero && !terceroSeleccionado) { setError('Selecciona el tercero responsable'); return; }
    if (esPostventa && !fotoAntes) { setError('La foto de antes es obligatoria en Postventa'); return; }
    setGuardando(true); setError(''); setGuardadoOk(false);
    try {
      let userId = userIdRef.current || localStorage.getItem('detalles_user_id') || '';
      if (!userId && online) {
        try { const { data: { user } } = await Promise.race([supabase.auth.getUser(), new Promise<any>((_, reject) => setTimeout(() => reject('timeout'), 3000))]); if (user?.id) { userId = user.id; userIdRef.current = user.id; localStorage.setItem('detalles_user_id', user.id); } } catch {}
      }
      if (!userId) { setError('No se pudo identificar el usuario'); setGuardando(false); return; }
      const datos = { proyecto_id: proyecto.id, torre_id: torre.id, departamento_id: depto.id, ambiente_id: ambienteId, partida_id: partidaId, observacion: observacion.trim(), causa: causaFinal || null, creado_por: userId, etapa: etapaActual };
      if (online) {
        try {
          let foto_url = null, foto_antes_url = null;
          if (esPostventa) { if (fotoAntes) foto_antes_url = await subirFoto(fotoAntes, userId); if (foto) foto_url = await subirFoto(foto, userId); }
          else { if (foto) foto_url = await subirFoto(foto, userId); }
          const { error } = await supabase.from('registros').insert({ ...datos, foto_url, foto_antes_url });
          if (error) throw new Error(error.message);
        } catch { await agregarPendiente(datos, foto ?? undefined); }
      } else { await agregarPendiente(datos, esPostventa ? (fotoAntes ?? undefined) : (foto ?? undefined)); }
      setObservacion(''); setCausaSeleccionada(''); setTerceroSeleccionado('');
      setFoto(null); setFotoPreview(null); setFotoAntes(null); setFotoAntesPreview(null);
      setRegistrosDepto(prev => prev + 1);
      setGuardadoOk(true); setTimeout(() => setGuardadoOk(false), 2500);
    } catch (e: any) { setError('Error inesperado: ' + e.message); }
    setGuardando(false);
  };

  const labelStyle  = { fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };
  const selectStyle = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };
  const taStyle     = { width: '100%', height: 80, borderRadius: 10, padding: '10px 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, resize: 'none' as any, marginBottom: 12 };
  const inputStyle  = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };

  const sepLine = dark
    ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';

  const FotoUploader = ({ preview, onSelect, onClear, label, obligatorio = false }: {
    preview: string | null; onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClear: () => void; label: string; obligatorio?: boolean;
  }) => (
    <>
      <label style={{ ...labelStyle, color: obligatorio && !preview ? '#f97316' : textMuted }}>
        {label}{obligatorio ? ' *' : ''}
      </label>
      {preview ? (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <img src={preview} style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'cover' }} />
          <button onClick={onClear} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>
      ) : (
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 80, borderRadius: 12, border: `0.5px dashed ${obligatorio ? 'rgba(249,115,22,0.5)' : border}`, marginBottom: 16, cursor: 'pointer', color: textMuted, gap: 6, background: dark ? 'transparent' : '#f8fafc' }}>
          <span style={{ fontSize: 22 }}>📷</span>
          <span style={{ fontSize: 12 }}>Tomar o adjuntar foto</span>
          <input type="file" accept="image/*" capture="environment" onChange={onSelect} style={{ display: 'none' }} />
        </label>
      )}
    </>
  );

  // Colores etapa badge
  const etapaBg    = esPostventa ? (dark ? 'rgba(251,191,36,0.06)' : '#fffbeb') : esPreEntrega ? (dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4') : (dark ? 'rgba(96,165,250,0.06)' : '#eff6ff');
  const etapaBord  = esPostventa ? (dark ? 'rgba(251,191,36,0.2)' : '#fde68a') : esPreEntrega ? (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : (dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe');
  const etapaDot   = esPostventa ? '#fbbf24' : esPreEntrega ? (dark ? '#4ade80' : '#22c55e') : (dark ? '#60a5fa' : '#3b82f6');
  const etapaColor = esPostventa ? (dark ? '#fbbf24' : '#a16207') : esPreEntrega ? (dark ? '#4ade80' : '#15803d') : (dark ? '#60a5fa' : '#1d4ed8');

  if (loading && ambientes.length === 0) return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' }} onClick={() => history.push('/inspeccion')}>← Volver</IonButton>
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
          <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' }} onClick={() => history.push('/inspeccion')}>← Volver</IonButton>
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

          {/* Etapa badge */}
          <div style={{ background: etapaBg, border: `0.5px solid ${etapaBord}`, borderRadius: 12, padding: '8px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: etapaDot, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: etapaColor, fontWeight: 500 }}>
              {etapaLabel[etapaActual]} — obs registradas bajo esta etapa
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

          {/* Separador */}
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

            {esPostventa ? (
              <>
                <FotoUploader preview={fotoAntesPreview} onSelect={e => seleccionarFoto(e, 'antes')} onClear={() => { setFotoAntes(null); setFotoAntesPreview(null); }} label="foto antes" obligatorio={true} />
                <FotoUploader preview={fotoPreview} onSelect={e => seleccionarFoto(e, 'despues')} onClear={() => { setFoto(null); setFotoPreview(null); }} label="foto después" />
              </>
            ) : (
              <FotoUploader preview={fotoPreview} onSelect={e => seleccionarFoto(e, 'despues')} onClear={() => { setFoto(null); setFotoPreview(null); }} label="foto" />
            )}

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

          {/* Botón terminar */}
          <button onClick={() => esPreEntrega ? setModalTerminar(true) : history.push('/inspeccion')} style={{
            width: '100%', height: 46, borderRadius: 12, background: 'transparent',
            border: `0.5px solid ${esPreEntrega ? (dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0') : border}`,
            color: esPreEntrega ? (dark ? '#4ade80' : '#15803d') : textMuted,
            fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 40
          }}>
            {esPreEntrega ? '✅ Terminar y registrar propietario' : 'Terminar inspección'}
          </button>

        </div>

        {/* Modal propietario */}
        <IonModal isOpen={modalTerminar} onDidDismiss={() => setModalTerminar(false)} initialBreakpoint={0.95} breakpoints={[0, 0.95, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            {firmaGuardada ? (
              <div style={{ textAlign: 'center', paddingTop: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: dark ? '#4ade80' : '#15803d' }}>Datos guardados correctamente</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Datos del propietario</div>
                <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>Torre {torre?.nombre} · Depto {depto?.numero} · {depto?.id_obra}</div>

                <label style={labelStyle}>nombre completo *</label>
                <input value={propNombre} onChange={e => setPropNombre(e.target.value)} placeholder="Ej: Juan Pérez González" style={inputStyle} />
                <label style={labelStyle}>RUT</label>
                <input value={propRut} onChange={e => setPropRut(e.target.value)} placeholder="Ej: 12.345.678-9" style={inputStyle} />
                <label style={labelStyle}>teléfono</label>
                <input value={propTelefono} onChange={e => setPropTelefono(e.target.value)} placeholder="Ej: +56 9 1234 5678" type="tel" style={inputStyle} />

                <label style={{ ...labelStyle, marginBottom: 8 }}>firma del propietario *</label>
                <div style={{ border: `0.5px solid ${border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 8, background: '#ffffff' }}>
                  <canvas
                    ref={firmaCanvasRef} width={340} height={160}
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

                {errorFirma && (
                  <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px', borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca' }}>{errorFirma}</div>
                )}

                <button onClick={guardarDatosPreEntrega} disabled={guardandoFirma} style={{
                  width: '100%', height: 48, borderRadius: 12,
                  background: guardandoFirma ? (dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : '#f1f5f9') : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                  border: 'none', color: guardandoFirma ? textMuted : '#fff',
                  fontSize: 14, fontWeight: 700, cursor: guardandoFirma ? 'not-allowed' : 'pointer'
                }}>
                  {guardandoFirma ? 'Guardando...' : '✓ Guardar y terminar'}
                </button>
                <button onClick={() => setModalTerminar(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        </IonModal>

      </IonContent>
    </IonPage>
  );
};

export default InspeccionDepto;
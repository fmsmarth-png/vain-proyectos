import React, { useRef, useState } from 'react';
import {
  IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar,
  IonTitle, IonAlert, useIonViewDidEnter,
} from '@ionic/react';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { comprimirImagen } from '../utils/comprimirImagen';
import { generarPDFPostventa } from '../utils/pdfPostventa';

// ─── tipos ────────────────────────────────────────────────────────────────────

interface Proyecto { id: string; nombre: string; }
interface Torre    { id: string; nombre: string; }
interface Depto    { id: string; numero: string; propietario_nombre: string | null; propietario_contacto: string | null; }

interface Trabajo {
  id: string;
  descripcion: string;
  fotoAntes:   File | null;
  fotoDespues: File | null;
  prevAntes:   string;
  prevDespues: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const localId = () => Math.random().toString(36).slice(2);
const nuevoTrabajo = (): Trabajo => ({
  id: localId(), descripcion: '',
  fotoAntes: null, fotoDespues: null, prevAntes: '', prevDespues: '',
});

// ─── FirmaCanvas ─────────────────────────────────────────────────────────────

interface FirmaCanvasProps { onFirma: (dataUrl: string) => void; onLimpiar: () => void; dark: boolean; }

const FirmaCanvas: React.FC<FirmaCanvasProps> = ({ onFirma, onLimpiar, dark }) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const dibujando  = useRef(false);
  const [tieneFirma, setTieneFirma] = useState(false);

  const ink    = dark ? '#f9fafb' : '#0f172a';
  const border = dark ? '#1e1e1e' : '#cbd5e1';

  const getCtx = () => canvasRef.current?.getContext('2d');

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const iniciar = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault(); dibujando.current = true;
    const ctx = getCtx(); if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(x, y);
  };

  const dibujar = (e: React.TouchEvent | React.MouseEvent) => {
    if (!dibujando.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault();
    const ctx = getCtx(); if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = ink;
    ctx.lineTo(x, y); ctx.stroke();
  };

  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    const canvas = canvasRef.current; if (!canvas) return;
    setTieneFirma(true);
    onFirma(canvas.toDataURL('image/png'));
  };

  const limpiar = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    getCtx()?.clearRect(0, 0, canvas.width, canvas.height);
    setTieneFirma(false); onLimpiar();
  };

  return (
    <div>
      <canvas
        ref={canvasRef} width={600} height={200}
        style={{ width: '100%', height: 120, border: `1px dashed ${border}`, borderRadius: 8, touchAction: 'none', display: 'block', background: dark ? '#111111' : '#ffffff' }}
        onMouseDown={iniciar} onMouseMove={dibujar} onMouseUp={terminar}
        onTouchStart={iniciar} onTouchMove={dibujar} onTouchEnd={terminar}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: dark ? '#6b7280' : '#64748b' }}>
          {tieneFirma ? '✓ Firma registrada' : 'Firme en el recuadro'}
        </span>
        {tieneFirma && (
          <button onClick={limpiar} style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#6b7280' : '#64748b', padding: 0 }}>
            ↺ Borrar y repetir
          </button>
        )}
      </div>
    </div>
  );
};

// ─── FotoSelector ─────────────────────────────────────────────────────────────

interface FotoSelectorProps {
  label: string; preview: string;
  onFile: (file: File) => void; onClear: () => void;
  dark: boolean; inputRef: React.MutableRefObject<HTMLInputElement | null>;
}

const FotoSelector: React.FC<FotoSelectorProps> = ({ label, preview, onFile, onClear, dark, inputRef }) => {
  const border   = dark ? '#1e1e1e'  : '#e2e8f0';
  const bgSecond = dark ? '#111111'  : '#f8fafc';
  const textSec  = dark ? '#6b7280'  : '#64748b';
  const textMut  = dark ? '#444444'  : '#94a3b8';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: textSec, textAlign: 'center' }}>{label}</span>
      {preview ? (
        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}>
          <img src={preview} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button onClick={onClear} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 7px', fontSize: 11, cursor: 'pointer' }}>✕</button>
        </div>
      ) : (
        <div onClick={() => inputRef.current?.click()} style={{ border: `1px dashed ${border}`, borderRadius: 8, background: bgSecond, aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
          <span style={{ fontSize: 24 }}>📷</span>
          <span style={{ fontSize: 10, color: textMut }}>Cámara o archivo</span>
        </div>
      )}
      <input
        ref={inputRef} type="file" accept="image/*" capture="environment"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (!f) return; onFile(f); if (inputRef.current) inputRef.current.value = ''; }}
      />
    </div>
  );
};

// ─── PostVenta ────────────────────────────────────────────────────────────────

const PostVenta: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);

  // ── tokens — idénticos al resto de la app ──────────────────────────────────
  const bg          = dark ? '#000000' : '#f0f4f8';
  const card        = dark ? '#0e0e0e'  : '#ffffff';
  const cardGrad    = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border      = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted   = dark ? '#444444'  : '#94a3b8';
  const toolbar     = dark ? '#000000'  : '#1e3a5f';
  const inputBg     = dark ? '#111111'  : '#ffffff';
  const inputBorder = dark ? '#1e1e1e'  : '#cbd5e1';
  const sepLine     = dark
    ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';

  // ── estado ─────────────────────────────────────────────────────────────────
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [torres,    setTorres]    = useState<Torre[]>([]);
  const [deptos,    setDeptos]    = useState<Depto[]>([]);
  const [proyId,    setProyId]    = useState('');
  const [torreId,   setTorreId]   = useState('');
  const [deptoId,   setDeptoId]   = useState('');

  const [nombre,   setNombre]   = useState('');
  const [rut,      setRut]      = useState('');
  const [telefono, setTelefono] = useState('');

  const [trabajos, setTrabajos]     = useState<Trabajo[]>([nuevoTrabajo()]);
  const [firmaDataUrl, setFirmaDataUrl] = useState('');
  const [guardando, setGuardando]   = useState(false);
  const [alerta,    setAlerta]      = useState('');

  const refsAntes   = useRef<Record<string, React.MutableRefObject<HTMLInputElement | null>>>({});
  const refsDespues = useRef<Record<string, React.MutableRefObject<HTMLInputElement | null>>>({});
  const getRefAntes   = (id: string) => { if (!refsAntes.current[id])   refsAntes.current[id]   = { current: null }; return refsAntes.current[id]; };
  const getRefDespues = (id: string) => { if (!refsDespues.current[id]) refsDespues.current[id] = { current: null }; return refsDespues.current[id]; };

  // ── carga ──────────────────────────────────────────────────────────────────
  useIonViewDidEnter(() => { if (!mounted.current) { mounted.current = true; cargarProyectos(); } });

  const cargarProyectos = async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).maybeSingle();
    let query = supabase.from('proyectos').select('id, nombre').eq('estado', 'activo').order('nombre');
    if (perfil?.rol !== 'administrador') {
      const { data: asig } = await supabase.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user.id);
      const ids = (asig ?? []).map(a => a.proyecto_id);
      if (ids.length === 0) return;
      query = query.in('id', ids);
    }
    const { data } = await query;
    setProyectos(data ?? []);
  };

  const handleProyecto = async (id: string) => {
    setProyId(id); setTorreId(''); setDeptoId(''); setTorres([]); setDeptos([]);
    if (!id) return;
    const { data } = await supabase.from('torres').select('id, nombre').eq('proyecto_id', id).order('nombre');
    setTorres(data ?? []);
  };

  const handleTorre = async (id: string) => {
    setTorreId(id); setDeptoId(''); setDeptos([]);
    if (!id) return;
    const { data } = await supabase.from('departamentos').select('id, numero, propietario_nombre, propietario_contacto').eq('torre_id', id).order('numero');
    setDeptos(data ?? []);
  };

  const handleDepto = (id: string) => {
    setDeptoId(id);
    const d = deptos.find(x => x.id === id); if (!d) return;
    setNombre(d.propietario_nombre ?? '');
    setTelefono(d.propietario_contacto ?? '');
    setRut('');
  };

  // ── trabajos ───────────────────────────────────────────────────────────────
  const agregarTrabajo  = () => setTrabajos(prev => [...prev, nuevoTrabajo()]);
  const eliminarTrabajo = (id: string) => setTrabajos(prev => prev.filter(t => t.id !== id));
  const actualizarTrabajo = (id: string, campo: Partial<Trabajo>) =>
    setTrabajos(prev => prev.map(t => t.id === id ? { ...t, ...campo } : t));

  const setFoto = (wid: string, tipo: 'antes' | 'despues', file: File) => {
    const url = URL.createObjectURL(file);
    tipo === 'antes'
      ? actualizarTrabajo(wid, { fotoAntes: file, prevAntes: url })
      : actualizarTrabajo(wid, { fotoDespues: file, prevDespues: url });
  };
  const clearFoto = (wid: string, tipo: 'antes' | 'despues') =>
    tipo === 'antes'
      ? actualizarTrabajo(wid, { fotoAntes: null, prevAntes: '' })
      : actualizarTrabajo(wid, { fotoDespues: null, prevDespues: '' });

  // ── guardar ────────────────────────────────────────────────────────────────
  const validar = () => {
    if (!proyId || !torreId || !deptoId) return 'Selecciona proyecto, torre y departamento.';
    if (!nombre.trim()) return 'Ingresa el nombre del propietario.';
    if (!rut.trim())    return 'Ingresa el RUT del propietario.';
    if (trabajos.some(t => !t.descripcion.trim())) return 'Todos los trabajos deben tener descripción.';
    if (!firmaDataUrl)  return 'Se requiere la firma del propietario.';
    return null;
  };

  const subir = async (file: File | null, path: string): Promise<string> => {
    if (!file) return '';
    const blob = await comprimirImagen(file);
    const { error } = await supabase.storage.from('fotos-registros').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return supabase.storage.from('fotos-registros').getPublicUrl(path).data.publicUrl;
  };

  const subirFirma = async (dataUrl: string, registroId: string): Promise<string> => {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `postventa/firmas/${registroId}.png`;
    await supabase.storage.from('fotos-registros').upload(path, blob, { contentType: 'image/png', upsert: true });
    return supabase.storage.from('fotos-registros').getPublicUrl(path).data.publicUrl;
  };

  const handleGenerar = async () => {
    const err = validar(); if (err) { setAlerta(err); return; }
    setGuardando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const proy  = proyectos.find(p => p.id === proyId);
      const torre = torres.find(t => t.id === torreId);
      const depto = deptos.find(d => d.id === deptoId);

      const { data: reg, error: regErr } = await supabase
        .from('registros_postventa')
        .insert({ proyecto_id: proyId, torre_id: torreId, departamento_id: deptoId, propietario_nombre: nombre.trim(), propietario_rut: rut.trim(), propietario_telefono: telefono.trim() || null, creado_por: user?.id })
        .select('id').single();
      if (regErr || !reg) throw regErr ?? new Error('No se pudo crear el registro.');

      const firmaUrl = await subirFirma(firmaDataUrl, reg.id);
      await supabase.from('registros_postventa').update({ firma_url: firmaUrl }).eq('id', reg.id);

      const trabajosGuardados: { descripcion: string; fotoAntesUrl: string; fotoDespuesUrl: string }[] = [];
      for (let i = 0; i < trabajos.length; i++) {
        const t   = trabajos[i];
        const base = `postventa/${reg.id}/trabajo_${i + 1}`;
        const [urlAntes, urlDespues] = await Promise.all([subir(t.fotoAntes, `${base}_antes.jpg`), subir(t.fotoDespues, `${base}_despues.jpg`)]);
        await supabase.from('trabajos_postventa').insert({ registro_id: reg.id, orden: i + 1, descripcion: t.descripcion.trim(), foto_antes_url: urlAntes || null, foto_despues_url: urlDespues || null });
        trabajosGuardados.push({ descripcion: t.descripcion.trim(), fotoAntesUrl: urlAntes, fotoDespuesUrl: urlDespues });
      }

      await generarPDFPostventa({
        proyecto: proy?.nombre ?? '', torre: torre?.nombre ?? '', depto: String(depto?.numero ?? ''),
        propietarioNombre: nombre.trim(), propietarioRut: rut.trim(), propietarioTelefono: telefono.trim(),
        trabajos: trabajosGuardados, firmaDataUrl, fecha: new Date(),
      });

      setProyId(''); setTorreId(''); setDeptoId('');
      setNombre(''); setRut(''); setTelefono('');
      setTrabajos([nuevoTrabajo()]); setFirmaDataUrl('');
      setTorres([]); setDeptos([]);
    } catch (e: any) {
      setAlerta(e?.message ?? 'Error al generar el informe.');
    } finally {
      setGuardando(false);
    }
  };

  // ── estilos ────────────────────────────────────────────────────────────────
  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`,
    margin: '10px 10px 0', padding: '14px 14px',
  };
  const sSecLabel: React.CSSProperties = {
    fontSize: 9, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12,
  };
  const sFieldLabel: React.CSSProperties = { fontSize: 11, color: textSecondary, marginBottom: 4 };
  const sInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    border: `0.5px solid ${inputBorder}`, borderRadius: 10,
    padding: '8px 12px', fontSize: 14, background: inputBg,
    color: textPrimary, outline: 'none', height: 44,
  };
  const sInputSmall: React.CSSProperties = { ...sInput, height: 36, fontSize: 13 };
  const sRow2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 };
  const sMb12: React.CSSProperties = { marginBottom: 12 };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Post Venta</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ paddingBottom: 40 }}>

          {/* ── selección ── */}
          <div style={sCard}>
            <div style={sSecLabel}>📋 Selección</div>
            <div style={sMb12}>
              <div style={sFieldLabel}>Proyecto</div>
              <select value={proyId} onChange={e => handleProyecto(e.target.value)} style={sInput}>
                <option value="">Seleccionar proyecto...</option>
                {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div style={sRow2}>
              <div>
                <div style={sFieldLabel}>Torre</div>
                <select value={torreId} onChange={e => handleTorre(e.target.value)} style={sInputSmall} disabled={!proyId}>
                  <option value="">Torre...</option>
                  {torres.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <div style={sFieldLabel}>Departamento</div>
                <select value={deptoId} onChange={e => handleDepto(e.target.value)} style={sInputSmall} disabled={!torreId}>
                  <option value="">Depto...</option>
                  {deptos.map(d => <option key={d.id} value={d.id}>{d.numero}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── propietario ── */}
          <div style={sCard}>
            <div style={sSecLabel}>👤 Datos del propietario</div>
            <div style={sMb12}>
              <div style={sFieldLabel}>Nombre completo *</div>
              <input style={sInput} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del propietario" />
            </div>
            <div style={sRow2}>
              <div>
                <div style={sFieldLabel}>RUT *</div>
                <input style={sInputSmall} value={rut} onChange={e => setRut(e.target.value)} placeholder="12.345.678-9" />
              </div>
              <div>
                <div style={sFieldLabel}>Teléfono</div>
                <input style={sInputSmall} value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+56 9 ..." />
              </div>
            </div>
          </div>

          {/* ── trabajos ── */}
          {trabajos.map((t, idx) => {
            const refA = getRefAntes(t.id);
            const refD = getRefDespues(t.id);
            const esNuevo = idx === trabajos.length - 1 && idx > 0;
            return (
              <div key={t.id} style={{
                background: cardGrad, borderRadius: 16,
                border: `0.5px solid ${esNuevo ? (dark ? '#1e3a5f' : '#93c5fd') : border}`,
                margin: '10px 10px 0', overflow: 'hidden',
              }}>
                {/* header trabajo */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderBottom: `0.5px solid ${border}`,
                  background: dark ? '#0a0a0a' : '#f8fafc',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🔧 Trabajo {idx + 1}
                    {esNuevo && (
                      <span style={{ fontSize: 10, background: dark ? '#0c2340' : '#eff6ff', color: dark ? '#60a5fa' : '#1d4ed8', borderRadius: 6, padding: '2px 7px', border: `0.5px solid ${dark ? '#1e3a5f' : '#bfdbfe'}`, fontWeight: 600 }}>
                        Nuevo
                      </span>
                    )}
                  </span>
                  {idx > 0 && (
                    <button onClick={() => eliminarTrabajo(t.id)} style={{ background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: dark ? '#f87171' : '#b91c1c', padding: '4px 10px' }}>
                      🗑 Eliminar
                    </button>
                  )}
                </div>

                {/* cuerpo trabajo */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ ...sFieldLabel, marginBottom: 6 }}>Descripción del trabajo *</div>
                  <textarea
                    rows={3}
                    value={t.descripcion}
                    onChange={e => actualizarTrabajo(t.id, { descripcion: e.target.value })}
                    placeholder="Describir el trabajo realizado..."
                    style={{ ...sInput, height: 'auto', resize: 'none', lineHeight: 1.6, marginBottom: 12 } as React.CSSProperties}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <FotoSelector label="Antes"   preview={t.prevAntes}   onFile={f => setFoto(t.id, 'antes',   f)} onClear={() => clearFoto(t.id, 'antes')}   dark={dark} inputRef={refA} />
                    <FotoSelector label="Después" preview={t.prevDespues} onFile={f => setFoto(t.id, 'despues', f)} onClear={() => clearFoto(t.id, 'despues')} dark={dark} inputRef={refD} />
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── botón agregar trabajo ── */}
          <button
            onClick={agregarTrabajo}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'transparent', color: dark ? '#60a5fa' : '#1e3a5f',
              border: `1px dashed ${dark ? '#1e3a5f' : '#93c5fd'}`,
              borderRadius: 12, padding: '11px 0', fontSize: 13, fontWeight: 600,
              width: 'calc(100% - 20px)', margin: '10px 10px 0', cursor: 'pointer',
            }}
          >
            ＋ Agregar otro trabajo
          </button>

          {/* separador */}
          <div style={{ height: '0.5px', background: sepLine, margin: '16px 10px 0' }} />

          {/* ── firma ── */}
          <div style={sCard}>
            <div style={sSecLabel}>✍️ Firma del propietario</div>
            <div style={{ fontSize: 11, color: textMuted, marginBottom: 10 }}>
              Una sola firma aplica para todos los trabajos registrados.
            </div>
            <FirmaCanvas dark={dark} onFirma={url => setFirmaDataUrl(url)} onLimpiar={() => setFirmaDataUrl('')} />
          </div>

          {/* ── botón generar ── */}
          <div style={{ margin: '12px 10px 0' }}>
            <button
              onClick={handleGenerar}
              disabled={guardando}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                color: '#ffffff', border: 'none', borderRadius: 12,
                padding: '14px 0', fontSize: 14, fontWeight: 700,
                width: '100%', cursor: guardando ? 'not-allowed' : 'pointer',
                opacity: guardando ? 0.7 : 1,
              }}
            >
              {guardando ? '⏳ Generando...' : '📄 Generar informe PDF'}
            </button>
          </div>

        </div>

        <IonAlert isOpen={!!alerta} onDidDismiss={() => setAlerta('')} header="Atención" message={alerta} buttons={['OK']} />
      </IonContent>
    </IonPage>
  );
};

export default PostVenta;

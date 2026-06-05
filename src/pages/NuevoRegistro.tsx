import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonButton, IonSpinner
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';

const NuevoRegistro: React.FC = () => {
  const history = useHistory();

  const [proyectos, setProyectos]     = useState<any[]>([]);
  const [torres, setTorres]           = useState<any[]>([]);
  const [deptos, setDeptos]           = useState<any[]>([]);
  const [ambientes, setAmbientes]     = useState<any[]>([]);
  const [partidas, setPartidas]       = useState<any[]>([]);

  const [proyectoId, setProyectoId]   = useState('');
  const [torreId, setTorreId]         = useState('');
  const [deptoId, setDeptoId]         = useState('');
  const [ambienteId, setAmbienteId]   = useState('');
  const [partidaId, setPartidaId]     = useState('');
  const [observacion, setObservacion] = useState('');
  const [causa, setCausa]             = useState('');
  const [foto, setFoto]               = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  const [loading, setLoading]         = useState(true);
  const [guardando, setGuardando]     = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => { cargarDatos(); }, []);

  useEffect(() => {
    if (proyectoId) cargarTorres(proyectoId);
    setTorreId(''); setDeptoId(''); setTorres([]); setDeptos([]);
  }, [proyectoId]);

  useEffect(() => {
    if (torreId) cargarDeptos(torreId);
    setDeptoId(''); setDeptos([]);
  }, [torreId]);

  const cargarDatos = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: perfil } = await supabase
      .from('usuarios').select('rol').eq('id', user!.id).single();

    let proy;
    if (perfil?.rol === 'administrador') {
      const { data } = await supabase
        .from('proyectos').select('*').eq('estado', 'activo').order('nombre');
      proy = data;
    } else {
      const { data: asignados } = await supabase
        .from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user!.id);
      const ids = asignados?.map(a => a.proyecto_id) ?? [];
      const { data } = await supabase
        .from('proyectos').select('*').eq('estado', 'activo').in('id', ids).order('nombre');
      proy = data;
    }

    const { data: amb }  = await supabase.from('ambientes').select('*').order('nombre');
    const { data: part } = await supabase.from('partidas').select('*').order('nombre');

    setProyectos(proy ?? []);
    setAmbientes(amb ?? []);
    setPartidas(part ?? []);
    setLoading(false);
  };

  const cargarTorres = async (pId: string) => {
    const { data } = await supabase.from('torres').select('*').eq('proyecto_id', pId).order('nombre');
    setTorres(data ?? []);
  };

  const cargarDeptos = async (tId: string) => {
    const { data } = await supabase.from('departamentos').select('*').eq('torre_id', tId).order('numero');
    setDeptos(data ?? []);
  };

  const seleccionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFoto(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const guardar = async () => {
    if (!proyectoId || !torreId || !deptoId || !ambienteId || !partidaId || !observacion.trim()) {
      setError('Completa todos los campos obligatorios'); return;
    }
    setGuardando(true); setError('');

    const { data: { user } } = await supabase.auth.getUser();
    let foto_url = null;

    if (foto) {
      const ext      = foto.name.split('.').pop();
      const fileName = `${user!.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('fotos-registros').upload(fileName, foto);
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('fotos-registros').getPublicUrl(fileName);
        foto_url = urlData.publicUrl;
      }
    }

    const { error } = await supabase.from('registros').insert({
      proyecto_id:     proyectoId,
      torre_id:        torreId,
      departamento_id: deptoId,
      ambiente_id:     ambienteId,
      partida_id:      partidaId,
      observacion:     observacion.trim(),
      causa:           causa.trim() || null,
      foto_url,
      creado_por:      user!.id,
    });

    if (error) { setError('Error al guardar: ' + error.message); }
    else { history.push('/registros'); }
    setGuardando(false);
  };

  const selectStyle = {
    width: '100%', height: 44, borderRadius: 10, padding: '0 12px',
    background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)',
    color: '#f9fafb', fontSize: 14, boxSizing: 'border-box' as any,
    marginBottom: 12
  };

  const taStyle = {
    width: '100%', height: 80, borderRadius: 10, padding: '10px 12px',
    background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)',
    color: '#f9fafb', fontSize: 14, boxSizing: 'border-box' as any,
    resize: 'none' as any, marginBottom: 12
  };

  const labelStyle = {
    fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 6
  };

  if (loading) return (
    <IonPage>
      <IonContent style={{ '--background': '#111827' }}>
        <div style={{ textAlign: 'center', marginTop: 100 }}><IonSpinner name="crescent" /></div>
      </IonContent>
    </IonPage>
  );

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#1f2937', '--color': '#f9fafb' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': '#9ca3af' }}
            onClick={() => history.push('/registros')}>← Volver</IonButton>
          <IonTitle>Nueva falla</IonTitle>
          <IonButton slot="end" fill="clear" style={{ '--color': '#60a5fa' }}
            onClick={guardar} disabled={guardando}>
            {guardando ? '...' : 'Guardar'}
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#111827' }}>
        <div style={{ padding: 16 }}>

          <label style={labelStyle}>PROYECTO *</label>
          <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} style={selectStyle}>
            <option value="">Seleccionar proyecto...</option>
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>

          <label style={labelStyle}>TORRE *</label>
          <select value={torreId} onChange={e => setTorreId(e.target.value)}
            style={{ ...selectStyle, opacity: !proyectoId ? 0.5 : 1 }} disabled={!proyectoId}>
            <option value="">Seleccionar torre...</option>
            {torres.map(t => (
              <option key={t.id} value={t.id}>
                Torre {t.nombre}{t.frente ? ` (${t.frente})` : ''}
              </option>
            ))}
          </select>

          <label style={labelStyle}>DEPARTAMENTO *</label>
          <select value={deptoId} onChange={e => setDeptoId(e.target.value)}
            style={{ ...selectStyle, opacity: !torreId ? 0.5 : 1 }} disabled={!torreId}>
            <option value="">Seleccionar departamento...</option>
            {deptos.map(d => (
              <option key={d.id} value={d.id}>
                {d.numero}{d.id_obra ? ` · ${d.id_obra}` : ''}
              </option>
            ))}
          </select>

          <label style={labelStyle}>AMBIENTE *</label>
          <select value={ambienteId} onChange={e => setAmbienteId(e.target.value)} style={selectStyle}>
            <option value="">Seleccionar ambiente...</option>
            {ambientes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>

          <label style={labelStyle}>PARTIDA AFECTADA *</label>
          <select value={partidaId} onChange={e => setPartidaId(e.target.value)} style={selectStyle}>
            <option value="">Seleccionar partida...</option>
            {partidas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>

          <label style={labelStyle}>OBSERVACIÓN *</label>
          <textarea value={observacion} onChange={e => setObservacion(e.target.value)}
            placeholder="Describe la falla observada..." style={taStyle} />

          <label style={labelStyle}>CAUSA</label>
          <textarea value={causa} onChange={e => setCausa(e.target.value)}
            placeholder="¿Cuál es la causa? (opcional)"
            style={{ ...taStyle, marginBottom: 16 }} />

          <label style={labelStyle}>FOTO</label>
          {fotoPreview ? (
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <img src={fotoPreview} style={{
                width: '100%', borderRadius: 12, maxHeight: 250, objectFit: 'cover'
              }} />
              <button onClick={() => { setFoto(null); setFotoPreview(null); }} style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                width: 28, height: 28, color: '#fff', fontSize: 16, cursor: 'pointer'
              }}>×</button>
            </div>
          ) : (
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 100, borderRadius: 12,
              border: '1px dashed rgba(255,255,255,0.15)', marginBottom: 16,
              cursor: 'pointer', color: '#6b7280', gap: 8
            }}>
              <span style={{ fontSize: 28 }}>📷</span>
              <span style={{ fontSize: 13 }}>Tomar o adjuntar foto</span>
              <input type="file" accept="image/*" capture="environment"
                onChange={seleccionarFoto} style={{ display: 'none' }} />
            </label>
          )}

          {error && (
            <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12,
              background: 'rgba(239,68,68,0.1)', padding: '10px 14px', borderRadius: 10 }}>
              {error}
            </div>
          )}

          <button onClick={guardar} disabled={guardando} style={{
            width: '100%', height: 52, borderRadius: 14, background: '#2563eb',
            border: 'none', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            marginBottom: 32
          }}>
            {guardando ? 'Guardando...' : '✓ Registrar falla'}
          </button>

        </div>
      </IonContent>
    </IonPage>
  );
};

export default NuevoRegistro;
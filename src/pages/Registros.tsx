import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonButton, IonSpinner
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';

const estadoColor: Record<string, string> = {
  pendiente:   '#f87171',
  solucionado: '#60a5fa',
  aprobado:    '#4ade80',
  rechazado:   '#f87171',
  cerrado:     '#6b7280',
};

const estadoLabel: Record<string, string> = {
  pendiente:   'Pendiente',
  solucionado: 'Solucionado',
  aprobado:    'Aprobado',
  rechazado:   'Rechazado',
  cerrado:     'Cerrado',
};

const Registros: React.FC = () => {
  const history = useHistory();
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filtro, setFiltro]       = useState('todos');
  const [usuario, setUsuario]     = useState<any>(null);

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: perfil }   = await supabase
      .from('usuarios').select('*').eq('id', user!.id).single();
    setUsuario(perfil);

    let query = supabase.from('registros').select(`
      *,
      proyectos (nombre),
      torres (nombre, frente),
      departamentos (numero, id_obra),
      ambientes (nombre),
      partidas (nombre)
    `).order('creado_en', { ascending: false });

    if (perfil?.rol !== 'administrador') {
      const { data: asignados } = await supabase
        .from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user!.id);
      const ids = asignados?.map(a => a.proyecto_id) ?? [];
      query = query.in('proyecto_id', ids);
    }

    const { data } = await query;
    setRegistros(data ?? []);
    setLoading(false);
  };

  const filtrados = filtro === 'todos'
    ? registros
    : registros.filter(r => r.estado === filtro);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#1f2937', '--color': '#f9fafb' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': '#9ca3af' }}
            onClick={() => history.push('/dashboard')}>← Inicio</IonButton>
          <IonTitle>Registros</IonTitle>
          <IonButton slot="end" fill="clear" style={{ '--color': '#60a5fa' }}
            onClick={() => history.push('/nuevo-registro')}>+ Nueva</IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#111827' }}>
        <div style={{ padding: 16 }}>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {['todos', 'pendiente', 'solucionado', 'aprobado', 'rechazado', 'cerrado'].map(f => (
              <button key={f} onClick={() => setFiltro(f)} style={{
                padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500,
                background: filtro === f ? '#2563eb' : '#1f2937',
                color: filtro === f ? '#fff' : '#6b7280',
              }}>
                {f === 'todos' ? 'Todos' : estadoLabel[f]}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', marginTop: 60 }}><IonSpinner name="crescent" /></div>
          ) : filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 80, color: '#6b7280' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600 }}>Sin registros</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Agrega una falla con "+ Nueva"</div>
            </div>
          ) : (
            filtrados.map(r => (
              <div key={r.id}
                onClick={() => history.push(`/registros/${r.id}`)}
                style={{
                  background: '#1f2937', borderRadius: 14, padding: 14,
                  marginBottom: 10, border: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer', borderLeft: `3px solid ${estadoColor[r.estado]}`
                }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f9fafb', marginBottom: 2 }}>
                      {r.observacion}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {r.proyectos?.nombre} · Torre {r.torres?.nombre} · Depto {r.departamentos?.numero}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 600,
                    background: `${estadoColor[r.estado]}20`, color: estadoColor[r.estado],
                    marginLeft: 8, whiteSpace: 'nowrap'
                  }}>{estadoLabel[r.estado]}</span>
                </div>

                {/* Detalles */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#4b5563', background: '#111827',
                    padding: '2px 8px', borderRadius: 6 }}>
                    {r.ambientes?.nombre}
                  </span>
                  <span style={{ fontSize: 11, color: '#4b5563', background: '#111827',
                    padding: '2px 8px', borderRadius: 6 }}>
                    {r.partidas?.nombre}
                  </span>
                  {r.foto_url && (
                    <span style={{ fontSize: 11, color: '#4b5563', background: '#111827',
                      padding: '2px 8px', borderRadius: 6 }}>📷 Foto</span>
                  )}
                </div>

              </div>
            ))
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Registros;
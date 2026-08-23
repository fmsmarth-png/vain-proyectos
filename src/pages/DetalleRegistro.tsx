import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonButton, IonSpinner, IonAlert
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';

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

const DetalleRegistro: React.FC = () => {
  const { id }  = useParams<{ id: string }>();
  const history = useHistory();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg          = dark ? '#0B1220' : '#f3f4f6';
  const card        = dark ? '#1B2C48' : '#ffffff';
  const border      = dark ? '#222222' : '#e5e7eb';
  const textPrimary = dark ? '#f9fafb' : '#111827';
  const textSecondary = dark ? '#6b7280' : '#6b7280';
  const textMuted   = dark ? '#4b5563' : '#9ca3af';
  const toolbar     = dark ? '#1B2C48' : '#1e3a5f';

  const [registro, setRegistro]   = useState<any>(null);
  const [usuario, setUsuario]     = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [alerta, setAlerta]       = useState('');

  useEffect(() => { cargar(); }, [id]);

  const cargar = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: perfil }   = await supabase
      .from('usuarios').select('*').eq('id', user!.id).single();
    setUsuario(perfil);
    const { data } = await supabase.from('registros').select(`
      *,
      proyectos (nombre),
      torres (nombre, frente),
      departamentos (numero, id_obra),
      ambientes (nombre),
      partidas (nombre),
      usuarios!registros_creado_por_fkey (nombre)
    `).eq('id', id).single();
    setRegistro(data);
    setLoading(false);
  };

  const cambiarEstado = async (nuevoEstado: string) => {
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('registros')
      .update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() })
      .eq('id', id);
    await supabase.from('historial_estados').insert({
      registro_id:     id,
      estado_anterior: registro.estado,
      estado_nuevo:    nuevoEstado,
      usuario_id:      user!.id,
    });
    await cargar();
    setGuardando(false);
  };

  const puedeMarcarSolucionado = () =>
    registro?.estado === 'pendiente' &&
    ['jefe_terreno', 'prof_terminaciones', 'administrador'].includes(usuario?.rol);

  const puedeAprobar = () =>
    registro?.estado === 'solucionado' &&
    ['director_obra', 'administrador'].includes(usuario?.rol);

  const puedeRechazar = () =>
    registro?.estado === 'solucionado' &&
    ['director_obra', 'administrador'].includes(usuario?.rol);

  const puedeCerrar = () =>
    registro?.estado === 'aprobado' &&
    ['director_obra', 'administrador'].includes(usuario?.rol);

  if (loading) return (
    <IonPage>
      <IonContent style={{ '--background': bg }}>
        <div style={{ textAlign: 'center', marginTop: 100 }}><IonSpinner name="crescent" /></div>
      </IonContent>
    </IonPage>
  );

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': '#9ca3af' }}
            onClick={() => history.goBack()}>← Volver</IonButton>
          <IonTitle style={{ fontSize: 15 }}>Detalle falla</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          {/* Estado + flujo */}
          <div style={{
            background: card, borderRadius: 10, padding: 14, marginBottom: 12,
            border: `0.5px solid ${border}`,
            borderLeft: `3px solid ${estadoColor[registro?.estado]}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: textSecondary }}>Estado actual</div>
              <span style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                background: `${estadoColor[registro?.estado]}15`,
                color: estadoColor[registro?.estado],
                border: `0.5px solid ${estadoColor[registro?.estado]}40`
              }}>{estadoLabel[registro?.estado]}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              {['pendiente', 'solucionado', 'aprobado', 'cerrado'].map((e, i) => {
                const estados   = ['pendiente', 'solucionado', 'aprobado', 'cerrado'];
                const idxActual = estados.indexOf(registro?.estado);
                const completado = i <= idxActual && registro?.estado !== 'rechazado';
                return (
                  <div key={e} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', margin: '0 auto 4px',
                        background: completado ? estadoColor[e] : (dark ? '#26395C' : '#e5e7eb'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: '#fff', fontWeight: 500
                      }}>{i + 1}</div>
                      <div style={{ fontSize: 9, color: completado ? textSecondary : textMuted }}>
                        {estadoLabel[e]}
                      </div>
                    </div>
                    {i < 3 && <div style={{ width: 12, height: '0.5px', background: dark ? '#333' : '#e5e7eb' }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Info */}
          <div style={{ background: card, borderRadius: 10, padding: 14, marginBottom: 12, border: `0.5px solid ${border}` }}>
            {[
              { k: 'Proyecto',   v: registro?.proyectos?.nombre },
              { k: 'Torre',      v: `${registro?.torres?.nombre}${registro?.torres?.frente ? ` (${registro?.torres?.frente})` : ''}` },
              { k: 'Depto',      v: `${registro?.departamentos?.numero} · ${registro?.departamentos?.id_obra}` },
              { k: 'Ambiente',   v: registro?.ambientes?.nombre },
              { k: 'Partida',    v: registro?.partidas?.nombre },
              { k: 'Registrado', v: registro?.usuarios?.nombre },
            ].map((item, i, arr) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < arr.length - 1 ? `0.5px solid ${border}` : 'none'
              }}>
                <span style={{ fontSize: 11, color: textMuted }}>{item.k}</span>
                <span style={{ fontSize: 12, color: textPrimary, fontWeight: 500, maxWidth: '60%', textAlign: 'right' }}>{item.v}</span>
              </div>
            ))}
          </div>

          {/* Observación */}
          <div style={{ background: card, borderRadius: 10, padding: 14, marginBottom: 12, border: `0.5px solid ${border}` }}>
            <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>observación</div>
            <div style={{ fontSize: 14, color: textPrimary, lineHeight: 1.5 }}>{registro?.observacion}</div>
          </div>

          {/* Causa */}
          {registro?.causa && (
            <div style={{ background: card, borderRadius: 10, padding: 14, marginBottom: 12, border: `0.5px solid ${border}` }}>
              <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>causa</div>
              <div style={{ fontSize: 14, color: textPrimary, lineHeight: 1.5 }}>{registro?.causa}</div>
            </div>
          )}

          {/* Foto */}
          {registro?.foto_url && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>foto</div>
              <img src={registro.foto_url} style={{
                width: '100%', borderRadius: 10, maxHeight: 300, objectFit: 'cover',
                border: `0.5px solid ${border}`
              }} />
            </div>
          )}

          {/* Acciones */}
          <div style={{ marginTop: 8 }}>
            {puedeMarcarSolucionado() && (
              <button onClick={() => cambiarEstado('solucionado')} disabled={guardando} style={{
                width: '100%', height: 48, borderRadius: 10, background: '#2563eb',
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', marginBottom: 8
              }}>
                {guardando ? 'Guardando...' : '✓ Marcar como solucionado'}
              </button>
            )}

            {puedeAprobar() && (
              <button onClick={() => cambiarEstado('aprobado')} disabled={guardando} style={{
                width: '100%', height: 48, borderRadius: 10,
                background: '#14532d', border: '0.5px solid rgba(74,222,128,0.2)',
                color: '#4ade80', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', marginBottom: 8
              }}>
                {guardando ? 'Guardando...' : '✓ Aprobar'}
              </button>
            )}

            {puedeRechazar() && (
              <button onClick={() => setAlerta('rechazar')} disabled={guardando} style={{
                width: '100%', height: 48, borderRadius: 10, background: 'transparent',
                border: '0.5px solid rgba(239,68,68,0.3)', color: '#f87171',
                fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 8
              }}>
                ✗ Rechazar → vuelve a Pendiente
              </button>
            )}

            {puedeCerrar() && (
              <button onClick={() => cambiarEstado('cerrado')} disabled={guardando} style={{
                width: '100%', height: 48, borderRadius: 10,
                background: 'transparent', border: `0.5px solid ${border}`,
                color: textSecondary, fontSize: 14, fontWeight: 500,
                cursor: 'pointer', marginBottom: 8
              }}>
                {guardando ? 'Guardando...' : '🔒 Cerrar registro'}
              </button>
            )}
          </div>

          <div style={{ height: 32 }} />
        </div>

        <IonAlert isOpen={alerta === 'rechazar'} onDidDismiss={() => setAlerta('')}
          header="¿Rechazar registro?"
          message="El registro volverá a estado Pendiente para que sea corregido."
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setAlerta('') },
            { text: 'Rechazar', role: 'confirm', handler: () => { setAlerta(''); cambiarEstado('pendiente'); } }
          ]} />

      </IonContent>
    </IonPage>
  );
};

export default DetalleRegistro;
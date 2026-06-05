import {
  IonContent, IonPage, IonHeader, IonToolbar, IonTitle,
  IonButton, IonSpinner, IonModal, IonAlert, IonMenuButton
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { cache } from '../Context/CacheContext';
import useAppFocus from '../hooks/useAppFocus';
import { lineaConfig, lineas } from '../utils/lineas';

const Proyectos: React.FC = () => {
  const [proyectos, setProyectos]           = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [modal, setModal]                   = useState(false);
  const [modalEditar, setModalEditar]       = useState(false);
  const [proyectoEdit, setProyectoEdit]     = useState<any>(null);
  const [nombre, setNombre]                 = useState('');
  const [direccion, setDireccion]           = useState('');
  const [codigo, setCodigo]                 = useState('');
  const [guardando, setGuardando]           = useState(false);
  const [error, setError]                   = useState('');
  const [esAdmin, setEsAdmin]               = useState(false);
  const [userId, setUserId]                 = useState('');
  const [proyectoPrincipalId, setProyectoPrincipalId] = useState('');
  const [alertEliminar, setAlertEliminar]   = useState(false);
  const [alertCerrar, setAlertCerrar]       = useState(false);
  const [alertEtapa, setAlertEtapa]         = useState(false);
  const [proyectoAccion, setProyectoAccion] = useState<any>(null);
  const [filtroLinea, setFiltroLinea]       = useState('');
  const history = useHistory();
  const { theme } = useTheme();
  const { online } = useOffline();
  const dark = theme === 'dark';

  const bg          = dark ? '#000000' : '#f0f4f8';
  const card        = dark ? '#0e0e0e'  : '#ffffff';
  const border      = dark ? '#1a1a1a'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#444444' : '#94a3b8';
  const toolbar       = dark ? '#000000' : '#1e3a5f';
  const inputBg       = dark ? '#111111' : '#ffffff';
  const inputBorder   = dark ? '#1e1e1e' : '#cbd5e1';

  useEffect(() => { cargar(); }, []);
  useAppFocus(() => { cargar(); });

  const cargar = async () => {
    setLoading(true);
    const proyCache = cache.getProyectos();
    if (proyCache.length > 0) setProyectos(proyCache);
    const usuarioCache = cache.getUsuario();
    if (usuarioCache) setEsAdmin(usuarioCache.rol === 'administrador');
    if (online) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        setUserId(user.id);
        const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
        const esAdminActual = perfil?.rol === 'administrador';
        setEsAdmin(esAdminActual);
        const { data: up } = await supabase.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user.id).eq('es_principal', true).single();
        if (up) setProyectoPrincipalId(up.proyecto_id);
        let data;
        if (esAdminActual) {
          const { data: todos } = await supabase.from('proyectos').select('*').order('creado_en', { ascending: false }); data = todos;
        } else {
          const { data: asignados } = await supabase.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user.id);
          const ids = asignados?.map(a => a.proyecto_id) ?? [];
          if (ids.length === 0) { setProyectos([]); setLoading(false); return; }
          const { data: asignadosData } = await supabase.from('proyectos').select('*').in('id', ids).order('creado_en', { ascending: false }); data = asignadosData;
        }
        if (data) { setProyectos(data); cache.setProyectos(data); }
      } catch {}
    }
    setLoading(false);
  };

  const marcarPrincipal = async (proyId: string) => {
    if (!userId || !online) return;
    await supabase.from('usuario_proyectos').update({ es_principal: false }).eq('usuario_id', userId);
    await supabase.from('usuario_proyectos').update({ es_principal: true }).eq('usuario_id', userId).eq('proyecto_id', proyId);
    setProyectoPrincipalId(proyId);
    window.dispatchEvent(new CustomEvent('proyectoPrincipalCambiado'));
  };

  const crearProyecto = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setGuardando(true); setError('');
    const { error } = await supabase.from('proyectos').insert({ nombre: nombre.trim(), direccion: direccion.trim(), codigo: codigo.trim() || null });
    if (error) { setError('Error al crear el proyecto'); }
    else { setNombre(''); setDireccion(''); setCodigo(''); setModal(false); cargar(); }
    setGuardando(false);
  };

  const editarProyecto = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setGuardando(true); setError('');
    const { error } = await supabase.from('proyectos').update({ nombre: nombre.trim(), direccion: direccion.trim(), codigo: codigo.trim() || null }).eq('id', proyectoEdit.id);
    if (error) { setError('Error al editar'); } else { setModalEditar(false); cargar(); }
    setGuardando(false);
  };

  const cerrarProyecto   = async () => { await supabase.from('proyectos').update({ estado: 'cerrado' }).eq('id', proyectoAccion.id); cargar(); };
  const abrirProyecto    = async (p: any) => { await supabase.from('proyectos').update({ estado: 'activo' }).eq('id', p.id); cargar(); };
  const eliminarProyecto = async () => { await supabase.from('proyectos').delete().eq('id', proyectoAccion.id); cargar(); };

  const cambiarEtapa = async () => {
    const p = proyectoAccion; if (!p) return;
    const nuevaEtapa = p.etapa === 'pre_entrega_postventa' ? 'obra' : 'pre_entrega_postventa';
    const { error } = await supabase.from('proyectos').update({ etapa: nuevaEtapa }).eq('id', p.id);
    if (error) { setError('Error al cambiar etapa: ' + error.message); return; }
    const { data: torres } = await supabase.from('torres').select('id').eq('proyecto_id', p.id);
    const torreIds = torres?.map(t => t.id) ?? [];
    if (torreIds.length > 0) {
      if (nuevaEtapa === 'pre_entrega_postventa') { await supabase.from('departamentos').update({ estado_entrega: 'pre_entrega' }).in('torre_id', torreIds).eq('estado_entrega', 'obra'); }
      else { await supabase.from('departamentos').update({ estado_entrega: 'obra' }).in('torre_id', torreIds); }
    }
    cargar();
  };

  const abrirEditar  = (p: any) => { setProyectoEdit(p); setNombre(p.nombre); setDireccion(p.direccion ?? ''); setCodigo(p.codigo ?? ''); setError(''); setModalEditar(true); };
  const circuloTexto = (p: any) => p.codigo ? p.codigo.toUpperCase() : p.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  const etapaLabel      = (p: any) => p.etapa === 'pre_entrega_postventa' ? '🏠 Pre-entrega/PV' : '🏗️ Obra';
  const etapaColorFn    = (p: any) => p.etapa === 'pre_entrega_postventa' ? (dark ? '#4ade80' : '#15803d') : (dark ? '#60a5fa' : '#1d4ed8');

  const inputStyle = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any };
  const labelStyle = { fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };

  const proyectosFiltrados = filtroLinea ? proyectos.filter(p => p.linea === filtroLinea) : proyectos;

  return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonMenuButton slot="start" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' }} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Proyectos</IonTitle>
          {esAdmin && online && (
            <IonButton slot="end" fill="clear" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.8)', fontSize: 13 }}
              onClick={() => { setError(''); setNombre(''); setDireccion(''); setCodigo(''); setModal(true); }}>
              + Nuevo
            </IonButton>
          )}
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          {!online && (
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '8px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#fbbf24' }}>Sin conexión — mostrando datos guardados</span>
            </div>
          )}

          {loading && proyectos.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 60 }}><IonSpinner name="crescent" /></div>
          ) : proyectos.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 80 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: textSecondary }}>Sin proyectos aún</div>
              <div style={{ fontSize: 13, marginTop: 4, color: textMuted }}>{esAdmin ? 'Crea tu primer proyecto con "+ Nuevo"' : 'No hay proyectos disponibles'}</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Todos los proyectos</div>
              <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginBottom: 14 }} />

              {/* Filtro línea */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                <button onClick={() => setFiltroLinea('')} style={{ height: 28, padding: '0 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: filtroLinea === '' ? (dark ? '#1a1a1a' : '#1e3a5f') : 'transparent', color: filtroLinea === '' ? '#fff' : textMuted, border: `0.5px solid ${filtroLinea === '' ? (dark ? '#2a2a2a' : '#1e3a5f') : border}` }}>
                  Todas
                </button>
                {lineas.map(l => (
                  <button key={l} onClick={() => setFiltroLinea(filtroLinea === l ? '' : l)} style={{ height: 28, padding: '0 10px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, background: filtroLinea === l ? lineaConfig[l].color + '20' : 'transparent', color: filtroLinea === l ? lineaConfig[l].color : textMuted, border: `0.5px solid ${filtroLinea === l ? lineaConfig[l].color + '60' : border}` }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: lineaConfig[l].color, flexShrink: 0 }} />
                    {lineaConfig[l].label.replace('Línea ', '')}
                  </button>
                ))}
              </div>

              {proyectosFiltrados.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: 40, color: textMuted, fontSize: 13 }}>No hay proyectos en esta línea</div>
              ) : proyectosFiltrados.map(p => {
                const esPrincipal = proyectoPrincipalId === p.id;
                const lc = p.linea ? lineaConfig[p.linea] : null;
                return (
                  <div key={p.id} style={{
                    background: dark
                      ? (esPrincipal ? 'linear-gradient(135deg, #111 0%, #1a1a1a 50%, #111 100%)' : 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)')
                      : (esPrincipal ? 'linear-gradient(135deg, #eff6ff, #fff)' : '#fff'),
                    borderRadius: 16, padding: '14px 16px', marginBottom: 10,
                    border: dark
                      ? (esPrincipal ? '0.5px solid #2a2a2a' : '0.5px solid #1a1a1a')
                      : (esPrincipal ? '0.5px solid #bfdbfe' : '0.5px solid #e2e8f0'),
                    position: 'relative', overflow: 'hidden'
                  }}>
                    {esPrincipal && (
                      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: dark ? 'radial-gradient(circle, #222 0%, transparent 70%)' : 'radial-gradient(circle, #dbeafe 0%, transparent 70%)' }} />
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : (esPrincipal ? 'linear-gradient(135deg, #1e3a5f, #2563eb)' : '#f8fafc'), border: dark ? '0.5px solid #2a2a2a' : (esPrincipal ? 'none' : '0.5px solid #e2e8f0'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: dark ? '#666' : (esPrincipal ? '#fff' : '#64748b'), flexShrink: 0 }}>
                        {circuloTexto(p)}
                      </div>
                      <div onClick={() => history.push(`/proyectos/${p.id}`)} style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {esPrincipal && <span style={{ fontSize: 12 }}>⭐</span>}
                          {p.nombre}
                        </div>
                        {p.direccion && <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>📍 {p.direccion}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: etapaColorFn(p), fontWeight: 600 }}>{etapaLabel(p)}</span>
                          {lc && (
                            <>
                              <span style={{ fontSize: 10, color: textMuted }}>·</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: lc.color, flexShrink: 0 }} />
                                <span style={{ fontSize: 10, color: lc.color, fontWeight: 600 }}>{lc.label}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, flexShrink: 0, background: p.estado === 'activo' ? (dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4') : (dark ? 'rgba(107,114,128,0.06)' : '#f8fafc'), color: p.estado === 'activo' ? (dark ? '#4ade80' : '#15803d') : (dark ? '#555' : '#64748b'), border: `0.5px solid ${p.estado === 'activo' ? (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : (dark ? '#1e1e1e' : '#e2e8f0')}` }}>
                        {p.estado === 'activo' ? 'Activo' : 'Cerrado'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 6, borderTop: `0.5px solid ${border}`, paddingTop: 12, flexWrap: 'wrap' }}>
                      {online && (
                        <button onClick={() => marcarPrincipal(p.id)} style={{ flex: 1, height: 30, borderRadius: 8, background: esPrincipal ? (dark ? 'rgba(251,191,36,0.08)' : '#fffbeb') : 'transparent', border: `0.5px solid ${esPrincipal ? (dark ? 'rgba(251,191,36,0.25)' : '#fde68a') : border}`, color: esPrincipal ? (dark ? '#fbbf24' : '#a16207') : textMuted, fontSize: 11, cursor: 'pointer', fontWeight: esPrincipal ? 600 : 400 }}>
                          {esPrincipal ? '⭐ Principal' : '☆ Marcar principal'}
                        </button>
                      )}
                      {esAdmin && online && (
                        <>
                          <button onClick={() => abrirEditar(p)} style={{ flex: 1, height: 30, borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 11, cursor: 'pointer' }}>✏️ Editar</button>
                          <button onClick={() => { setProyectoAccion(p); setAlertEtapa(true); }} style={{ flex: 1, height: 30, borderRadius: 8, background: p.etapa === 'pre_entrega_postventa' ? (dark ? 'rgba(96,165,250,0.06)' : '#eff6ff') : (dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4'), border: `0.5px solid ${p.etapa === 'pre_entrega_postventa' ? (dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe') : (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0')}`, color: p.etapa === 'pre_entrega_postventa' ? (dark ? '#60a5fa' : '#1d4ed8') : (dark ? '#4ade80' : '#15803d'), fontSize: 11, cursor: 'pointer' }}>
                            {p.etapa === 'pre_entrega_postventa' ? '🏗️ → Obra' : '🏠 → Pre-E/PV'}
                          </button>
                          {p.estado === 'activo' ? (
                            <button onClick={() => { setProyectoAccion(p); setAlertCerrar(true); }} style={{ flex: 1, height: 30, borderRadius: 8, background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb', border: dark ? '0.5px solid rgba(251,191,36,0.2)' : '0.5px solid #fde68a', color: dark ? '#fbbf24' : '#a16207', fontSize: 11, cursor: 'pointer' }}>🔒 Cerrar</button>
                          ) : (
                            <button onClick={() => abrirProyecto(p)} style={{ flex: 1, height: 30, borderRadius: 8, background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', color: dark ? '#4ade80' : '#15803d', fontSize: 11, cursor: 'pointer' }}>🔓 Reabrir</button>
                          )}
                          <button onClick={() => { setProyectoAccion(p); setAlertEliminar(true); }} style={{ height: 30, padding: '0 12px', borderRadius: 8, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca', color: dark ? '#f87171' : '#b91c1c', fontSize: 11, cursor: 'pointer' }}>🗑️</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          <div style={{ height: 40 }} />
        </div>

        {/* Modal nuevo */}
        <IonModal isOpen={modal} onDidDismiss={() => setModal(false)} initialBreakpoint={0.6} breakpoints={[0, 0.6, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Nuevo proyecto</div>
            <label style={{ ...labelStyle, marginBottom: 6 }}>nombre *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Parque Eyzaguirre" style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={{ ...labelStyle, marginBottom: 6 }}>código</label>
            <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Ej: EY1A" maxLength={6} style={{ ...inputStyle, marginBottom: 12, textTransform: 'uppercase' }} />
            <label style={{ ...labelStyle, marginBottom: 6 }}>dirección</label>
            <input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Ej: Av. Las Condes 1234" style={{ ...inputStyle, marginBottom: 20 }} />
            {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px', borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca' }}>{error}</div>}
            <button onClick={crearProyecto} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : 'Crear proyecto'}
            </button>
            <button onClick={() => setModal(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal editar */}
        <IonModal isOpen={modalEditar} onDidDismiss={() => setModalEditar(false)} initialBreakpoint={0.6} breakpoints={[0, 0.6, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Editar proyecto</div>
            <label style={{ ...labelStyle, marginBottom: 6 }}>nombre *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={{ ...labelStyle, marginBottom: 6 }}>código</label>
            <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Ej: EY1A" maxLength={6} style={{ ...inputStyle, marginBottom: 12, textTransform: 'uppercase' }} />
            <label style={{ ...labelStyle, marginBottom: 6 }}>dirección</label>
            <input value={direccion} onChange={e => setDireccion(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }} />
            {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px', borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca' }}>{error}</div>}
            <button onClick={editarProyecto} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button onClick={() => setModalEditar(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        <IonAlert isOpen={alertEtapa} onDidDismiss={() => setAlertEtapa(false)}
          header="¿Cambiar etapa?"
          message={proyectoAccion?.etapa === 'pre_entrega_postventa' ? `"${proyectoAccion?.nombre}" volverá a etapa de Obra.` : `"${proyectoAccion?.nombre}" pasará a Pre-entrega/Postventa.`}
          buttons={[{ text: 'Cancelar', handler: () => setAlertEtapa(false) }, { text: 'Confirmar', handler: () => { setAlertEtapa(false); cambiarEtapa(); } }]} />

        <IonAlert isOpen={alertCerrar} onDidDismiss={() => setAlertCerrar(false)}
          header="¿Cerrar proyecto?"
          message={`"${proyectoAccion?.nombre}" pasará a estado cerrado.`}
          buttons={[{ text: 'Cancelar', role: 'cancel' }, { text: 'Cerrar proyecto', role: 'confirm', handler: cerrarProyecto }]} />

        <IonAlert isOpen={alertEliminar} onDidDismiss={() => setAlertEliminar(false)}
          header="⚠️ Eliminar proyecto"
          message={`Esto eliminará "${proyectoAccion?.nombre}" con todas sus torres, departamentos y registros.`}
          buttons={[{ text: 'Cancelar', role: 'cancel' }, { text: 'Eliminar', role: 'confirm', handler: eliminarProyecto }]} />

      </IonContent>
    </IonPage>
  );
};

export default Proyectos;
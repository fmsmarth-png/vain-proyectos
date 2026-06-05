import {
  IonContent, IonPage, IonHeader, IonToolbar, IonTitle,
  IonSpinner, IonMenu, IonMenuButton, IonModal,
  IonRefresher, IonRefresherContent
} from '@ionic/react';
import { useEffect, useState, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import useAppFocus from '../hooks/useAppFocus';
import { lineaConfig } from '../utils/lineas';

const Dashboard: React.FC = () => {
  const history  = useHistory();
  const { theme, toggleTheme } = useTheme();
  const { online, pendientes } = useOffline();
  const dark = theme === 'dark';

  const [usuario, setUsuario]                     = useState<any>(null);
  const [proyectos, setProyectos]                 = useState<any[]>([]);
  const [proyectoPrincipal, setProyectoPrincipal] = useState<any>(null);
  const [ultimoDepto, setUltimoDepto]             = useState<any>(null);
  const [deptoMasObs, setDeptoMasObs]             = useState<any>(null);
  const [avance, setAvance]                       = useState<{ conObs: number; total: number } | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [modalAccion, setModalAccion]             = useState(false);
  const [deptoAccionData, setDeptoAccionData]     = useState<any>(null);
  const menuRef = useRef<HTMLIonMenuElement>(null);

  const bg          = dark ? '#000000' : '#f0f4f8';
  const card        = dark ? '#0e0e0e'  : '#ffffff';
  const border      = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#444444' : '#94a3b8';
  const toolbar       = dark ? '#000000' : '#1e3a5f';

  const kpiCardBg     = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #181818 100%)' : '#ffffff';
  const kpiCardBorder = dark ? '#1e1e1e' : '#e2e8f0';
  const kpiSepBorder  = dark ? '#1a1a1a' : '#f1f5f9';
  const kpiNumColor   = dark ? '#f9fafb' : '#0f172a';
  const kpiSubColor   = dark ? '#444'    : '#94a3b8';
  const kpiInfoColor  = dark ? '#555'    : '#94a3b8';
  const donutTrack    = dark ? '#1a1a1a' : '#f0fdf4';

  useEffect(() => {
    cargarDatos(true);
    const handleCambio = () => cargarDatos(false);
    window.addEventListener('proyectoPrincipalCambiado', handleCambio);
    return () => window.removeEventListener('proyectoPrincipalCambiado', handleCambio);
  }, []);
  useAppFocus(() => { cargarDatos(false); });

  const cargarDatos = async (mostrarLoading = true) => {
    if (mostrarLoading) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('usuarios').select('*').eq('id', user.id).single();
      setUsuario(perfil);
      let proy: any[] = [];
      if (perfil?.rol === 'administrador') {
        const { data } = await supabase.from('proyectos').select('*').eq('estado', 'activo').order('nombre');
        proy = data ?? [];
      } else {
        const { data: asignados } = await supabase.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user.id);
        const ids = asignados?.map(a => a.proyecto_id) ?? [];
        if (ids.length > 0) {
          const { data } = await supabase.from('proyectos').select('*').eq('estado', 'activo').in('id', ids).order('nombre');
          proy = data ?? [];
        }
      }
      setProyectos(proy);
      let principal: any = null;
      if (perfil?.rol === 'administrador') {
        const { data: upAdmin } = await supabase.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user.id).eq('es_principal', true).single();
        if (upAdmin) principal = proy.find(p => p.id === upAdmin.proyecto_id) ?? proy[0] ?? null;
        else principal = proy[0] ?? null;
      } else {
        const { data: up } = await supabase.from('usuario_proyectos').select('proyecto_id, es_principal').eq('usuario_id', user.id).eq('es_principal', true).single();
        if (up) principal = proy.find(p => p.id === up.proyecto_id) ?? proy[0] ?? null;
        else principal = proy[0] ?? null;
      }
      setProyectoPrincipal(principal);
      if (principal) await cargarKpisPrincipal(principal.id);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const cargarKpisPrincipal = async (proyId: string) => {
    try {
      const { data: ultimaObs } = await supabase
        .from('registros')
        .select('creado_en, creado_por, departamento_id, departamentos(id, numero, id_obra), torres(id, nombre, frente)')
        .eq('proyecto_id', proyId).order('creado_en', { ascending: false }).limit(1).single();
      if (ultimaObs?.creado_por) {
        const { data: usuCreador } = await supabase.from('usuarios').select('nombre').eq('id', ultimaObs.creado_por).single();
        setUltimoDepto({ ...ultimaObs, usuarios: { nombre: usuCreador?.nombre ?? 'desconocido' } });
      } else { setUltimoDepto(ultimaObs ?? null); }

      const { data: regsActivos } = await supabase
        .from('registros')
        .select('departamento_id, departamentos(id, numero, id_obra), torres(id, nombre, frente)')
        .eq('proyecto_id', proyId)
        .neq('estado', 'aprobado');

      if (regsActivos && regsActivos.length > 0) {
        const conteo: Record<string, { count: number; info: any }> = {};
        regsActivos.forEach(r => {
          const key = r.departamento_id;
          const torre = Array.isArray(r.torres) ? r.torres[0] : r.torres;
          const depto = Array.isArray(r.departamentos) ? r.departamentos[0] : r.departamentos;
          const infoNormalizada = { ...r, torres: torre, departamentos: depto };
          if (!conteo[key]) { conteo[key] = { count: 0, info: infoNormalizada }; }
          else if (torre?.frente && !conteo[key].info.torres?.frente) { conteo[key].info = infoNormalizada; }
          conteo[key].count++;
        });
        const top = Object.values(conteo).sort((a, b) => b.count - a.count)[0];
        setDeptoMasObs(top ?? null);
      } else { setDeptoMasObs(null); }

      const { data: torres } = await supabase.from('torres').select('id').eq('proyecto_id', proyId);
      const torreIds = torres?.map(t => t.id) ?? [];
      if (torreIds.length > 0) {
        const { data: deptos } = await supabase.from('departamentos').select('id').in('torre_id', torreIds);
        const total = deptos?.length ?? 0;
        const deptoIds = deptos?.map(d => d.id) ?? [];
        const { data: regsDepto } = await supabase.from('registros').select('departamento_id').in('departamento_id', deptoIds);
        const conObs = new Set(regsDepto?.map(r => r.departamento_id) ?? []).size;
        setAvance({ conObs, total });
      }
    } catch (e) { console.error(e); }
  };

  const abrirAccionDepto = (depto: any, torre: any) => { setDeptoAccionData({ depto, torre }); setModalAccion(true); };
  const irAInspeccion = () => {
    setModalAccion(false);
    setTimeout(() => { history.push('/inspeccion/depto', { depto: deptoAccionData.depto, torre: deptoAccionData.torre, proyecto: proyectoPrincipal }); }, 300);
  };
  const irARevision = (deptoId: string, torreId: string) => {
    setModalAccion(false);
    setTimeout(() => { history.push('/revision', { deptoId, torreId, proyectoId: proyectoPrincipal?.id }); }, 300);
  };

  const logout  = async () => { await menuRef.current?.close(); await supabase.auth.signOut(); };
  const navegar = async (ruta: string) => { await menuRef.current?.close(); history.push(ruta); };
  const iniciales = (nombre: string) => nombre?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? 'U';
  const formatFecha = (fecha: string) => new Date(fecha).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

  if (loading) return (
    <IonPage>
      <IonContent style={{ '--background': bg }}>
        <div style={{ textAlign: 'center', marginTop: 100 }}><IonSpinner name="crescent" /></div>
      </IonContent>
    </IonPage>
  );

  const menuItems = [
    { icon: '🏠', label: 'Inicio',     ruta: '/dashboard',  seccion: 'principal' },
    { icon: '🏗️', label: 'Proyectos', ruta: '/proyectos',  seccion: 'principal' },
    { icon: '📋', label: 'Inspección', ruta: '/inspeccion', seccion: 'principal' },
    { icon: '📊', label: 'Reportes',   ruta: '/reportes',   seccion: 'principal' },
    ...(usuario?.rol === 'administrador' ? [{ icon: '👥', label: 'Administración', ruta: '/admin', seccion: 'admin' }] : []),
  ];

  const pctAvance = avance && avance.total > 0 ? Math.round((avance.conObs / avance.total) * 100) : 0;
  const circumference = 2 * Math.PI * 26;
  const lcUsuario = usuario?.linea ? lineaConfig[usuario.linea] : null;
  const lcPrincipal = proyectoPrincipal?.linea ? lineaConfig[proyectoPrincipal.linea] : null;

  return (
    <>
      {/* Menú lateral — siempre dark */}
      <IonMenu ref={menuRef} contentId="dashboard-content" style={{ '--width': '75%', '--background': '#0a0a0a' }}>
        <IonContent style={{ '--background': '#0a0a0a' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '44px 20px 20px', borderBottom: '0.5px solid #1a1a1a', background: 'linear-gradient(180deg, #111 0%, #0a0a0a 100%)' }}>
              <div style={{ marginBottom: 20, position: 'relative' }}>
                <img src="/logo-vain-blanco.png" style={{ height: 80, objectFit: 'contain' }} alt="VAIN" />
                <div style={{ position: 'absolute', top: 0, right: 0, fontSize: 9, color: '#333', letterSpacing: '1.5px', fontFamily: 'monospace' }}>&lt;FMS&gt;</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)', border: '0.5px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#888', flexShrink: 0 }}>{iniciales(usuario?.nombre ?? '')}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#f9fafb' }}>{usuario?.nombre}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: '#555', textTransform: 'capitalize' }}>{usuario?.rol?.replace('_', ' ')}</span>
                    {lcUsuario && <div style={{ width: 7, height: 7, borderRadius: '50%', background: lcUsuario.color, flexShrink: 0 }} />}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: '#333', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 20px 4px' }}>principal</div>
              {menuItems.filter(i => i.seccion === 'principal').map(item => {
                const activo = history.location.pathname === item.ruta;
                return (
                  <div key={item.ruta} onClick={() => navegar(item.ruta)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', fontSize: 14, cursor: 'pointer', borderLeft: activo ? '2px solid #555' : '2px solid transparent', background: activo ? 'rgba(255,255,255,0.03)' : 'transparent', color: activo ? '#f9fafb' : '#555' }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    {item.label}
                    {item.label === 'Inspección' && pendientes > 0 && (
                      <span style={{ marginLeft: 'auto', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 10, padding: '2px 7px', borderRadius: 20, border: '0.5px solid rgba(251,191,36,0.2)' }}>{pendientes} en cola</span>
                    )}
                  </div>
                );
              })}
              {usuario?.rol === 'administrador' && (
                <>
                  <div style={{ height: '0.5px', background: '#1a1a1a', margin: '8px 20px' }} />
                  <div style={{ fontSize: 10, color: '#333', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 20px 4px' }}>administración</div>
                  {menuItems.filter(i => i.seccion === 'admin').map(item => (
                    <div key={item.ruta} onClick={() => navegar(item.ruta)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', fontSize: 14, cursor: 'pointer', borderLeft: '2px solid transparent', color: '#555' }}>
                      <span style={{ fontSize: 18 }}>{item.icon}</span>{item.label}
                    </div>
                  ))}
                </>
              )}
              <div style={{ height: '0.5px', background: '#1a1a1a', margin: '8px 20px' }} />
              <div style={{ fontSize: 10, color: '#333', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 20px 4px' }}>conexión</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', color: '#555', fontSize: 14 }}>
                <span style={{ fontSize: 18 }}>{online ? '📶' : '📵'}</span>
                {online ? 'En línea' : 'Sin conexión'}
                {pendientes > 0 && <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '0.5px solid rgba(251,191,36,0.2)' }}>{pendientes} en cola</span>}
              </div>
            </div>

            <div style={{ padding: '16px 20px', borderTop: '0.5px solid #1a1a1a' }}>
              <div onClick={() => toggleTheme()} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', color: '#555', fontSize: 14, cursor: 'pointer' }}>
                <span style={{ fontSize: 18 }}>{dark ? '☀️' : '🌙'}</span>{dark ? 'Modo claro' : 'Modo oscuro'}
              </div>
              <div onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', color: '#f87171', fontSize: 14, cursor: 'pointer' }}>
                <span style={{ fontSize: 18 }}>🚪</span>Cerrar sesión
              </div>
              <div style={{ fontSize: 11, color: '#333', marginTop: 8 }}>Versión 1.0.0 FMS</div>
            </div>
          </div>
        </IonContent>
      </IonMenu>

      <IonPage id="dashboard-content">
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#111' : 'transparent' }}>
            <IonMenuButton slot="start" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.6)' }} />
            <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Inicio</IonTitle>
            <div slot="end" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : '#fbbf24' }} />
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '0.5px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{iniciales(usuario?.nombre ?? '')}</div>
            </div>
          </IonToolbar>
        </IonHeader>

        <IonContent style={{ '--background': bg }}>
          <IonRefresher slot="fixed" onIonRefresh={async (e: any) => { await cargarDatos(false); e.detail.complete(); }}>
            <IonRefresherContent />
          </IonRefresher>

          <div style={{ padding: '16px 16px 100px' }}>

            {/* Banner proyecto principal — toca para ir a DetalleProyecto */}
            {proyectoPrincipal && (
              <div onClick={() => history.push(`/proyectos/${proyectoPrincipal.id}`)} style={{
                background: dark
                  ? 'linear-gradient(135deg, #111 0%, #1a1a1a 50%, #111 100%)'
                  : 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                borderRadius: 16, padding: '16px 18px', marginBottom: 20,
                border: dark ? '0.5px solid #2a2a2a' : 'none',
                position: 'relative', overflow: 'hidden', cursor: 'pointer'
              }}>
                <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12 }}>⭐</span>
                  <span style={{ fontSize: 9, color: dark ? '#555' : 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>Proyecto Principal</span>
                  {lcPrincipal && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: lcPrincipal.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 9, color: lcPrincipal.color, fontWeight: 600 }}>{lcPrincipal.label}</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>{proyectoPrincipal.nombre}</div>
                {proyectoPrincipal.direccion && <div style={{ fontSize: 11, color: dark ? '#444' : 'rgba(255,255,255,0.4)', marginTop: 4 }}>📍 {proyectoPrincipal.direccion}</div>}
                <div style={{ position: 'absolute', bottom: 14, right: 18, fontSize: 18, color: dark ? '#2a2a2a' : 'rgba(255,255,255,0.3)' }}>›</div>
              </div>
            )}

            {/* Último depto */}
            {proyectoPrincipal && (
              <div onClick={() => ultimoDepto && abrirAccionDepto(ultimoDepto.departamentos, ultimoDepto.torres)}
                style={{ background: kpiCardBg, borderRadius: 16, padding: 18, border: `0.5px solid ${kpiCardBorder}`, marginBottom: 12, cursor: ultimoDepto ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6' }} />
                  <span style={{ fontSize: 9, color: '#3b82f6', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>Último depto revisado</span>
                </div>
                {ultimoDepto ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 2 }}>
                        Torre {ultimoDepto.torres?.nombre} · Depto {ultimoDepto.departamentos?.numero}
                      </div>
                      <div style={{ fontSize: 11, color: textMuted, marginBottom: 12 }}>
                        {ultimoDepto.torres?.frente} · {ultimoDepto.departamentos?.id_obra}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : '#eff6ff', border: dark ? '0.5px solid #2a2a2a' : '0.5px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: dark ? '#777' : '#2563eb', fontWeight: 700 }}>
                          {iniciales(ultimoDepto.usuarios?.nombre ?? '')}
                        </div>
                        <span style={{ fontSize: 12, color: textSecondary }}>{ultimoDepto.usuarios?.nombre ?? 'desconocido'}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: textMuted }}>{formatFecha(ultimoDepto.creado_en).split(',')[0]}</div>
                      <div style={{ fontSize: 11, color: textMuted }}>{formatFecha(ultimoDepto.creado_en).split(',')[1]}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: textMuted }}>Sin registros aún</div>
                )}
              </div>
            )}

            {/* Grid KPIs */}
            {proyectoPrincipal && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {/* Obs activas */}
                <div onClick={() => deptoMasObs && irARevision(deptoMasObs.info.departamentos?.id, deptoMasObs.info.torres?.id)}
                  style={{ background: kpiCardBg, borderRadius: 16, padding: 16, border: `0.5px solid ${kpiCardBorder}`, cursor: deptoMasObs ? 'pointer' : 'default', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', bottom: -10, right: -10, width: 60, height: 60, borderRadius: '50%', background: dark ? 'radial-gradient(circle, #1f1a0a 0%, transparent 70%)' : '#fffbeb' }} />
                  <div style={{ fontSize: 9, color: '#d97706', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>⚠ Más obs</div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: kpiNumColor, lineHeight: 1, marginBottom: 3 }}>{deptoMasObs?.count ?? '—'}</div>
                  <div style={{ fontSize: 11, color: kpiSubColor }}>obs activas</div>
                  {deptoMasObs && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `0.5px solid ${kpiSepBorder}` }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>Torre {deptoMasObs.info.torres?.nombre} · Depto {deptoMasObs.info.departamentos?.numero}</div>
                      <div style={{ fontSize: 10, color: kpiInfoColor, marginTop: 2 }}>{deptoMasObs.info.torres?.frente} · {deptoMasObs.info.departamentos?.id_obra}</div>
                    </div>
                  )}
                </div>

                {/* Avance */}
                <div onClick={() => proyectoPrincipal && history.push(`/proyectos/${proyectoPrincipal.id}`)}
                  style={{ background: kpiCardBg, borderRadius: 16, padding: 16, border: `0.5px solid ${kpiCardBorder}`, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', bottom: -10, right: -10, width: 60, height: 60, borderRadius: '50%', background: dark ? 'radial-gradient(circle, #0a1a0e 0%, transparent 70%)' : '#f0fdf4' }} />
                  <div style={{ fontSize: 9, color: dark ? '#4ade80' : '#16a34a', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>📊 Avance</div>
                  <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 10px' }}>
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="26" fill="none" stroke={donutTrack} strokeWidth="6" />
                      <circle cx="32" cy="32" r="26" fill="none" stroke={dark ? '#4ade80' : '#22c55e'} strokeWidth="6"
                        strokeDasharray={`${(pctAvance / 100) * circumference} ${circumference}`}
                        strokeLinecap="round" transform="rotate(-90 32 32)" />
                    </svg>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 12, fontWeight: 700, color: kpiNumColor }}>{pctAvance}%</div>
                  </div>
                  <div style={{ fontSize: 11, color: kpiSubColor, textAlign: 'center' }}>{avance ? `${avance.conObs} / ${avance.total} deptos` : '— deptos'}</div>
                </div>
              </div>
            )}

            {/* Separador */}
            {proyectos.length > 0 && (
              <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginBottom: 18 }} />
            )}

            {/* Proyectos activos */}
            {proyectos.length > 0 && (
              <>
                <div style={{ fontSize: 9, color: textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Proyectos activos</div>
                {proyectos.map(p => {
                  const esPrincipal = p.id === proyectoPrincipal?.id;
                  const lc = p.linea ? lineaConfig[p.linea] : null;
                  return (
                    <div key={p.id} onClick={() => history.push(`/proyectos/${p.id}`)} style={{
                      background: dark
                        ? (esPrincipal ? 'linear-gradient(135deg, #111 0%, #1a1a1a 50%, #111 100%)' : 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)')
                        : (esPrincipal ? 'linear-gradient(135deg, #eff6ff, #fff)' : '#fff'),
                      borderRadius: 14, padding: '14px 16px', marginBottom: 8,
                      border: dark
                        ? (esPrincipal ? '0.5px solid #2a2a2a' : '0.5px solid #1a1a1a')
                        : (esPrincipal ? '0.5px solid #bfdbfe' : '0.5px solid #e2e8f0'),
                      display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer'
                    }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : (esPrincipal ? 'linear-gradient(135deg, #1e3a5f, #2563eb)' : '#f8fafc'), border: dark ? '0.5px solid #2a2a2a' : (esPrincipal ? 'none' : '0.5px solid #e2e8f0'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: dark ? '#666' : (esPrincipal ? '#fff' : '#64748b'), flexShrink: 0 }}>
                        {p.codigo ? p.codigo.toUpperCase() : p.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {esPrincipal && <span style={{ fontSize: 10 }}>⭐</span>}
                          <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{p.nombre}</span>
                        </div>
                        {p.direccion && <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>📍 {p.direccion}</div>}
                        {lc && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: lc.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 10, color: lc.color, fontWeight: 600 }}>{lc.label}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 18, color: dark ? '#2a2a2a' : '#bfdbfe' }}>›</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Bottom bar */}
          <div style={{ position: 'sticky', bottom: 0, background: dark ? 'linear-gradient(180deg, transparent 0%, #000 40%)' : 'linear-gradient(180deg, transparent 0%, #f0f4f8 40%)', padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: online ? '#22c55e' : '#fbbf24' }} />
            <span style={{ fontSize: 12, color: textMuted }}>
              {online ? (pendientes > 0 ? `Sincronizando ${pendientes} registro(s)...` : 'Sincronizado') : `Sin conexión${pendientes > 0 ? ` · ${pendientes} en cola` : ''}`}
            </span>
          </div>

          <IonModal isOpen={modalAccion} onDidDismiss={() => setModalAccion(false)} initialBreakpoint={0.4} breakpoints={[0, 0.4, 0.9]}>
            <div style={{ padding: 24, background: card, height: '100%' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>Depto {deptoAccionData?.depto?.numero}</div>
              <div style={{ fontSize: 12, color: textSecondary, marginBottom: 24 }}>Torre {deptoAccionData?.torre?.nombre} · {deptoAccionData?.depto?.id_obra}</div>
              <button onClick={irAInspeccion} style={{ width: '100%', height: 48, borderRadius: 12, background: 'rgba(59,130,246,0.08)', border: '0.5px solid rgba(59,130,246,0.2)', color: '#3b82f6', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>📋 Registrar observación</button>
              <button onClick={() => irARevision(deptoAccionData?.depto?.id, deptoAccionData?.torre?.id)} style={{ width: '100%', height: 48, borderRadius: 12, background: dark ? 'rgba(74,222,128,0.08)' : 'rgba(34,197,94,0.08)', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid rgba(34,197,94,0.2)', color: dark ? '#4ade80' : '#16a34a', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>✅ Ver observaciones</button>
              <button onClick={() => setModalAccion(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </IonModal>

        </IonContent>
      </IonPage>
    </>
  );
};

export default Dashboard;
import {
  IonContent, IonPage, IonHeader, IonToolbar, IonTitle,
  IonButton, IonSpinner, IonModal, IonAlert
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useParams, useHistory, useRouteMatch } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { cache } from '../Context/CacheContext';
import useAppFocus from '../hooks/useAppFocus';

const calcularEstadoDepto = (registros: any[]): 'sin_obs' | 'pendiente' | 'en_ejecucion' | 'rechazado' | 'aprobado' => {
  if (!registros || registros.length === 0) return 'sin_obs';
  const estados = registros.map(r => r.estado);
  if (estados.every(e => e === 'aprobado')) return 'aprobado';
  if (estados.some(e => e === 'rechazado')) return 'rechazado';
  if (estados.some(e => e === 'solucionado')) return 'en_ejecucion';
  return 'pendiente';
};

const estadoDeptoColorDark: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  sin_obs:      { bg: 'rgba(37,99,235,0.12)',   border: 'rgba(37,99,235,0.35)',   text: '#60a5fa', dot: '#3b82f6' },
  pendiente:    { bg: 'rgba(249,115,22,0.12)',   border: 'rgba(249,115,22,0.35)', text: '#fb923c', dot: '#f97316' },
  en_ejecucion: { bg: 'rgba(234,179,8,0.12)',    border: 'rgba(234,179,8,0.35)',  text: '#facc15', dot: '#eab308' },
  rechazado:    { bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.35)',  text: '#f87171', dot: '#ef4444' },
  aprobado:     { bg: 'rgba(34,197,94,0.12)',    border: 'rgba(34,197,94,0.35)',  text: '#4ade80', dot: '#22c55e' },
};

const estadoDeptoColorLight: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  sin_obs:      { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6' },
  pendiente:    { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', dot: '#f97316' },
  en_ejecucion: { bg: '#fefce8', border: '#fde68a', text: '#a16207', dot: '#eab308' },
  rechazado:    { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', dot: '#ef4444' },
  aprobado:     { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#22c55e' },
};

const estadoDeptoLabel: Record<string, string> = {
  sin_obs:      'Sin Revisar',
  pendiente:    'Revisado',
  en_ejecucion: 'En Ejecución',
  rechazado:    'Rechazado',
  aprobado:     'Aprobado',
};

const DetalleProyecto: React.FC<any> = (props) => {
  // useParams a veces NO resuelve el :id dentro de IonRouterOutlet.
  // Se recupera de forma robusta: props.match (si la ruta lo pasa) →
  // useRouteMatch (recalcula el parámetro desde la URL actual) → useParams.
  const params = useParams<{ id: string }>();
  const routeMatch = useRouteMatch<{ id: string }>('/proyectos/:id');
  const id = props?.match?.params?.id ?? routeMatch?.params?.id ?? params?.id;
  const history = useHistory();
  const { online } = useOffline();
  const [proyecto, setProyecto]                   = useState<any>(null);
  const [torres, setTorres]                       = useState<any[]>([]);
  const [registrosPorDepto, setRegistrosPorDepto] = useState<Record<string, any[]>>({});
  const [loading, setLoading]                     = useState(true);
  const [esAdmin, setEsAdmin]                     = useState(false);
  const [usuario, setUsuario]                     = useState<any>(null);
  const [modalTorre, setModalTorre]               = useState(false);
  const [modalEditarTorre, setModalEditarTorre]   = useState(false);
  const [modalDepto, setModalDepto]               = useState(false);
  const [modalEditarDepto, setModalEditarDepto]   = useState(false);
  const [modalAccionDepto, setModalAccionDepto]   = useState(false);
  const [torreSeleccionada, setTorreSeleccionada] = useState<any>(null);
  const [deptoSeleccionado, setDeptoSeleccionado] = useState<any>(null);
  const [deptoAccion, setDeptoAccion]             = useState<any>(null);
  const [torreDeDeptoAccion, setTorreDeDeptoAccion] = useState<any>(null);
  const [nombreTorre, setNombreTorre]             = useState('');
  const [frenteTorre, setFrenteTorre]             = useState('');
  const [editNumero, setEditNumero]               = useState('');
  const [editIdObra, setEditIdObra]               = useState('');
  const [pisos, setPisos]                         = useState('4');
  const [frentes, setFrente]                      = useState('2');
  const [numInicial, setNumInicial]               = useState('101');
  const [preview, setPreview]                     = useState<any[]>([]);
  const [guardando, setGuardando]                 = useState(false);
  const [error, setError]                         = useState('');
  const [alertEliminarTorre, setAlertEliminarTorre]   = useState(false);
  const [alertEliminarDeptos, setAlertEliminarDeptos] = useState(false);
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg            = dark ? '#000000' : '#f0f4f8';
  const card          = dark ? '#0e0e0e'  : '#ffffff';
  const cardAlt       = dark ? '#111111'  : '#f8fafc';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary = dark ? '#6b7280'  : '#64748b';
  const textMuted     = dark ? '#444444'  : '#94a3b8';
  const toolbar       = dark ? '#000000'  : '#1e3a5f';
  const inputBg       = dark ? '#111111'  : '#ffffff';
  const inputBorder   = dark ? '#1e1e1e'  : '#cbd5e1';

  const estadoColors = dark ? estadoDeptoColorDark : estadoDeptoColorLight;

  useEffect(() => { cargar(); }, [id]);
  useAppFocus(() => { cargar(); });

  useEffect(() => {
    if (modalDepto) generarPreview();
  }, [pisos, frentes, numInicial, modalDepto]);

  const cargar = async () => {
    console.log('cargar DetalleProyecto, id:', id);
    if (!id || id === 'undefined') {
      console.warn('DetalleProyecto: id no disponible, se omite la carga.', { id });
      setLoading(false);
      return;
    }
    setLoading(true);

    // 1) TORRES + DEPTOS — NO dependen del usuario ni del perfil.
    //    Se cargan primero y en su propio try, para que un fallo de auth
    //    (token vencido, red, getSession) nunca deje la vista vacía.
    try {
      const { data: proy, error: errProy } = await supabase
        .from('proyectos')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (errProy) console.error('error proyecto:', errProy);
      setProyecto(proy);

      const { data: torresData, error: errTorres } = await supabase
        .from('torres')
        .select('*, departamentos(*)')
        .eq('proyecto_id', id)
        .order('nombre');
      if (errTorres) console.error('error torres:', errTorres);
      setTorres(torresData ?? []);

      const todosDeptoIds = (torresData ?? []).flatMap((t: any) => (t.departamentos ?? []).map((d: any) => d.id));
      if (todosDeptoIds.length > 0) {
        const { data: regs, error: errRegs } = await supabase
          .from('registros')
          .select('departamento_id, estado')
          .in('departamento_id', todosDeptoIds);
        if (errRegs) console.error('error registros:', errRegs);
        const porDepto: Record<string, any[]> = {};
        (regs ?? []).forEach(r => {
          if (!porDepto[r.departamento_id]) porDepto[r.departamento_id] = [];
          porDepto[r.departamento_id].push(r);
        });
        setRegistrosPorDepto(porDepto);
      }
    } catch (e) {
      console.error('error cargando torres/deptos:', e);
    }

    // 2) PERFIL — solo para el flag de admin. Aislado en su propio try y
    //    con getSession() (patrón offline-safe, nunca getUser). Si falla,
    //    NO afecta la carga de torres/deptos: como mucho no se ven los
    //    botones de admin.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (user) {
        const { data: perfil } = await supabase
          .from('usuarios')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        setEsAdmin(perfil?.rol === 'administrador');
        setUsuario(perfil);
      }
    } catch (e) {
      console.error('error cargando perfil (no crítico):', e);
    }

    setLoading(false);
  };

  const generarPreview = () => {
    const numPisos      = parseInt(pisos) || 4;
    const inicio        = parseInt(numInicial) || 101;
    const pisoInicial   = Math.floor(inicio / 100);
    const offsetInicial = inicio % 100;
    const nombreFrente  = torreSeleccionada?.frente ?? '';
    const matches       = nombreFrente.match(/\d+/g) ?? ['1'];
    const numsFrentes   = matches.map(Number);
    const deptosConFrente: any[] = [];
    for (let piso = pisoInicial; piso < pisoInicial + numPisos; piso++) {
      deptosPorFrente(piso, pisoInicial, offsetInicial, numsFrentes, deptosConFrente);
    }
    setPreview(deptosConFrente);
  };

  const deptosPorFrente = (piso: number, pisoInicial: number, offsetInicial: number, numsFrentes: number[], result: any[]) => {
    result.push({ numero: piso * 100 + offsetInicial + result.filter(d => Math.floor(d.numero / 100) === piso).length, id_obra: `${piso}F${numsFrentes[0]}.1` });
    result.push({ numero: piso * 100 + offsetInicial + result.filter(d => Math.floor(d.numero / 100) === piso).length, id_obra: `${piso}F${numsFrentes[0]}.2` });
    if (numsFrentes.length > 1) {
      result.push({ numero: piso * 100 + offsetInicial + result.filter(d => Math.floor(d.numero / 100) === piso).length, id_obra: `${piso}F${numsFrentes[1]}.2` });
      result.push({ numero: piso * 100 + offsetInicial + result.filter(d => Math.floor(d.numero / 100) === piso).length, id_obra: `${piso}F${numsFrentes[1]}.1` });
    }
  };

  const crearTorre = async () => {
    if (!nombreTorre.trim()) { setError('La letra es obligatoria'); return; }
    setGuardando(true); setError('');
    const { error } = await supabase.from('torres').insert({ nombre: nombreTorre.trim().toUpperCase(), frente: frenteTorre.trim() || null, proyecto_id: id });
    if (error) { setError('Error al crear la torre'); }
    else { setNombreTorre(''); setFrenteTorre(''); setModalTorre(false); await cargar(); }
    setGuardando(false);
  };

  const editarTorre = async () => {
    if (!nombreTorre.trim()) { setError('La letra es obligatoria'); return; }
    setGuardando(true); setError('');
    const { error } = await supabase.from('torres').update({ nombre: nombreTorre.trim().toUpperCase(), frente: frenteTorre.trim() || null }).eq('id', torreSeleccionada.id);
    if (error) { setError('Error al editar'); }
    else { setModalEditarTorre(false); await cargar(); }
    setGuardando(false);
  };

 const editarDepto = async () => {
  if (!editNumero.trim()) { setError('El número es obligatorio'); return; }
  setGuardando(true); setError('');

  const numeroInt = parseInt(editNumero);
  const idObraClean = editIdObra.trim() || null;

  let piso: number | null = null;
  if (idObraClean && /^\d+F/i.test(idObraClean)) {
    piso = parseInt(idObraClean.split('F')[0]);
  } else if (!isNaN(numeroInt)) {
    piso = parseInt(editNumero.trim()[0]);
  }

  const frente_depto = idObraClean ? idObraClean.replace(/\.\d+$/, '') : null;

  const { error } = await supabase
    .from('departamentos')
    .update({ numero: numeroInt, id_obra: idObraClean, piso, frente_depto })
    .eq('id', deptoSeleccionado.id);

  if (error) { setError('Error al editar: ' + error.message); }
  else { setModalEditarDepto(false); await cargar(); }
  setGuardando(false);
};

  const eliminarTorre       = async () => { setAlertEliminarTorre(false); setLoading(true); await supabase.from('torres').delete().eq('id', torreSeleccionada.id); await cargar(); };
  const eliminarDeptosTorre = async () => { setAlertEliminarDeptos(false); setLoading(true); await supabase.from('departamentos').delete().eq('torre_id', torreSeleccionada.id); await cargar(); };
  const eliminarDepto       = async (deptoId: string) => { await supabase.from('departamentos').delete().eq('id', deptoId); await cargar(); };

const crearDepartamentos = async () => {
  if (preview.length === 0) { setError('Configura los parámetros'); return; }
  setGuardando(true); setError('');

  const rows = preview.map(d => {
    let piso: number | null = null;
    if (d.id_obra && /^\d+F/i.test(d.id_obra)) {
      piso = parseInt(d.id_obra.split('F')[0]);
    } else if (d.numero) {
      piso = parseInt(d.numero.toString()[0]);
    }
    const frente_depto = d.id_obra ? d.id_obra.replace(/\.\d+$/, '') : null;
    return { numero: d.numero, id_obra: d.id_obra, torre_id: torreSeleccionada.id, piso, frente_depto };
  });

  const { error } = await supabase.from('departamentos').insert(rows);
  if (error) { setError('Error: ' + error.message); }
  else { setModalDepto(false); await cargar(); }
  setGuardando(false);
};
  const abrirEditarDepto = (depto: any) => { setDeptoSeleccionado(depto); setEditNumero(String(depto.numero)); setEditIdObra(depto.id_obra ?? ''); setError(''); setModalEditarDepto(true); };
  const abrirAccionDepto = (depto: any, torre: any) => { setDeptoAccion(depto); setTorreDeDeptoAccion(torre); setModalAccionDepto(true); };

  const irAInspeccion = () => {
    setModalAccionDepto(false);
    setTimeout(() => { history.push('/inspeccion/depto', { depto: deptoAccion, torre: torreDeDeptoAccion, proyecto }); }, 300);
  };

  const irARevision = () => {
    setModalAccionDepto(false);
    setTimeout(() => { history.push('/revision', { deptoId: deptoAccion?.id, torreId: torreDeDeptoAccion?.id, proyectoId: proyecto?.id }); }, 300);
  };

  const irAZonasComunes = (torre: any) => {
    history.push('/zonas-comunes', { torre, proyecto });
  };

  const inputStyle = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any };
  const labelStyle = { fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };

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
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' }}
            onClick={() => history.push('/proyectos')}>← Volver</IonButton>
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>{proyecto?.nombre}</IonTitle>
          {esAdmin && (
            <IonButton slot="end" fill="clear" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.8)' }}
              onClick={() => { setError(''); setNombreTorre(''); setFrenteTorre(''); setModalTorre(true); }}>
              + Torre
            </IonButton>
          )}
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          {/* Info proyecto */}
          <div style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 12, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: dark ? '0.5px solid #2a2a2a' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: dark ? '#666' : '#fff', flexShrink: 0 }}>
              {proyecto?.codigo?.toUpperCase() ?? proyecto?.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>{proyecto?.nombre}</div>
              {proyecto?.direccion && <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>📍 {proyecto?.direccion}</div>}
              <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>
                {torres.length} torres · {torres.reduce((acc, t) => acc + (t.departamentos?.length ?? 0), 0)} departamentos
              </div>
            </div>
          </div>

          {/* Leyenda estados */}
          <div style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 16, border: `0.5px solid ${border}` }}>
            <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 10 }}>Estado de departamentos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {Object.entries(estadoDeptoLabel).map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: estadoColors[key].dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: textSecondary }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Torres */}
          <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Torres</div>
          <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginBottom: 16 }} />

          {torres.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 60 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🏢</div>
              <div style={{ fontSize: 14, color: textSecondary, fontWeight: 600 }}>Sin torres aún</div>
              <div style={{ fontSize: 12, marginTop: 4, color: textMuted }}>{esAdmin ? 'Agrega la primera torre con "+ Torre"' : 'No hay torres disponibles'}</div>
            </div>
          ) : torres.map(torre => (
            <div key={torre.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 12, border: `0.5px solid ${border}` }}>

              {/* Header torre */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: dark ? '0.5px solid #2a2a2a' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: dark ? '#666' : '#fff' }}>{torre.nombre}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>Torre {torre.nombre}{torre.frente ? ` (${torre.frente})` : ''}</div>
                    <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{torre.departamentos?.length ?? 0} departamentos</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* Botón Zona Común — visible para todos */}
                  <button onClick={() => irAZonasComunes(torre)} style={{ height: 32, padding: '0 10px', borderRadius: 8, background: dark ? 'rgba(74,222,128,0.08)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', color: dark ? '#4ade80' : '#15803d', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    🏢 ZC
                  </button>
                  {esAdmin && (
                    <button onClick={() => { setTorreSeleccionada(torre); setPisos('4'); setFrente('2'); setNumInicial('101'); setError(''); setModalDepto(true); }} style={{ height: 32, padding: '0 10px', borderRadius: 8, background: dark ? 'rgba(37,99,235,0.1)' : '#eff6ff', border: dark ? '0.5px solid rgba(37,99,235,0.3)' : '0.5px solid #bfdbfe', color: dark ? '#60a5fa' : '#2563eb', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Deptos</button>
                  )}
                </div>
              </div>

              {/* Deptos */}
              {torre.departamentos?.length === 0 ? (
                <div style={{ fontSize: 11, color: textMuted, fontStyle: 'italic', marginBottom: esAdmin ? 12 : 0 }}>
                  Sin departamentos{esAdmin ? ' — agrega con "+ Deptos"' : ''}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: esAdmin ? 14 : 0 }}>
                  {torre.departamentos
                    ?.sort((a: any, b: any) => a.numero - b.numero)
                    .map((depto: any) => {
                      const regs   = registrosPorDepto[depto.id] ?? [];
                      const estado = calcularEstadoDepto(regs);
                      const c      = estadoColors[estado];
                      return (
                        <div key={depto.id} style={{ position: 'relative' }}>
                          <div onClick={() => !esAdmin && abrirAccionDepto(depto, torre)}
                            style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 10, padding: '6px 10px', textAlign: 'center', cursor: esAdmin ? 'default' : 'pointer', minWidth: 54 }}>
                            <div style={{ fontSize: 12, color: c.text, fontWeight: 700 }}>{depto.numero}</div>
                            <div style={{ fontSize: 10, color: c.text, opacity: 0.7, marginTop: 1 }}>{depto.id_obra}</div>
                          </div>
                          {esAdmin && (
                            <>
                              <button onClick={() => abrirEditarDepto(depto)} style={{ position: 'absolute', top: -6, left: -6, width: 16, height: 16, borderRadius: '50%', background: '#2563eb', border: 'none', color: '#fff', fontSize: 9, cursor: 'pointer', lineHeight: '16px', padding: 0 }}>✏</button>
                              <button onClick={() => eliminarDepto(depto.id)} style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: '#ef4444', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', lineHeight: '16px', padding: 0 }}>×</button>
                            </>
                          )}
                        </div>
                      );
                    })
                  }
                </div>
              )}

              {/* Acciones admin */}
              {esAdmin && (
                <div style={{ display: 'flex', gap: 8, borderTop: `0.5px solid ${border}`, paddingTop: 12 }}>
                  <button onClick={() => { setTorreSeleccionada(torre); setNombreTorre(torre.nombre); setFrenteTorre(torre.frente ?? ''); setError(''); setModalEditarTorre(true); }} style={{ flex: 1, height: 32, borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 11, cursor: 'pointer' }}>✏️ Editar</button>
                  {torre.departamentos?.length > 0 && (
                    <button onClick={() => { setTorreSeleccionada(torre); setAlertEliminarDeptos(true); }} style={{ flex: 1, height: 32, borderRadius: 8, background: dark ? 'rgba(251,191,36,0.08)' : '#fffbeb', border: dark ? '0.5px solid rgba(251,191,36,0.2)' : '0.5px solid #fde68a', color: dark ? '#fbbf24' : '#a16207', fontSize: 11, cursor: 'pointer' }}>🗑️ Deptos</button>
                  )}
                  <button onClick={() => { setTorreSeleccionada(torre); setAlertEliminarTorre(true); }} style={{ flex: 1, height: 32, borderRadius: 8, background: dark ? 'rgba(239,68,68,0.08)' : '#fef2f2', border: dark ? '0.5px solid rgba(239,68,68,0.2)' : '0.5px solid #fecaca', color: dark ? '#f87171' : '#b91c1c', fontSize: 11, cursor: 'pointer' }}>🗑️ Torre</button>
                </div>
              )}
            </div>
          ))}
          <div style={{ height: 40 }} />
        </div>

        {/* Modal acción depto */}
        <IonModal isOpen={modalAccionDepto} onDidDismiss={() => setModalAccionDepto(false)} initialBreakpoint={0.4} breakpoints={[0, 0.4, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Depto {deptoAccion?.numero}</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 24 }}>Torre {torreDeDeptoAccion?.nombre} · {deptoAccion?.id_obra}</div>
            <button onClick={irAInspeccion} style={{ width: '100%', height: 48, borderRadius: 12, background: dark ? 'rgba(59,130,246,0.08)' : '#eff6ff', border: dark ? '0.5px solid rgba(59,130,246,0.2)' : '0.5px solid #bfdbfe', color: dark ? '#60a5fa' : '#1d4ed8', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>📋 Registrar observación</button>
            <button onClick={irARevision} style={{ width: '100%', height: 48, borderRadius: 12, background: dark ? 'rgba(74,222,128,0.08)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', color: dark ? '#4ade80' : '#15803d', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>✅ Ver observaciones</button>
            <button onClick={() => setModalAccionDepto(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal nueva torre */}
        <IonModal isOpen={modalTorre} onDidDismiss={() => setModalTorre(false)} initialBreakpoint={0.55} breakpoints={[0, 0.55, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Nueva torre</div>
            <label style={{ ...labelStyle, marginBottom: 6 }}>letra *</label>
            <input value={nombreTorre} onChange={e => setNombreTorre(e.target.value)} placeholder="Ej: A" maxLength={3} style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={{ ...labelStyle, marginBottom: 6 }}>frente</label>
            <input value={frenteTorre} onChange={e => setFrenteTorre(e.target.value)} placeholder="Ej: F1-2" style={{ ...inputStyle, marginBottom: 20 }} />
            {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={crearTorre} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : 'Crear torre'}
            </button>
            <button onClick={() => setModalTorre(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal editar torre */}
        <IonModal isOpen={modalEditarTorre} onDidDismiss={() => setModalEditarTorre(false)} initialBreakpoint={0.55} breakpoints={[0, 0.55, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Editar torre</div>
            <label style={{ ...labelStyle, marginBottom: 6 }}>letra *</label>
            <input value={nombreTorre} onChange={e => setNombreTorre(e.target.value)} maxLength={3} style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={{ ...labelStyle, marginBottom: 6 }}>frente</label>
            <input value={frenteTorre} onChange={e => setFrenteTorre(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }} />
            {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={editarTorre} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button onClick={() => setModalEditarTorre(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal editar depto */}
        <IonModal isOpen={modalEditarDepto} onDidDismiss={() => setModalEditarDepto(false)} initialBreakpoint={0.5} breakpoints={[0, 0.5, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Editar departamento</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>Depto actual: {deptoSeleccionado?.numero} · {deptoSeleccionado?.id_obra}</div>
            <label style={{ ...labelStyle, marginBottom: 6 }}>número *</label>
            <input value={editNumero} onChange={e => setEditNumero(e.target.value)} type="number" placeholder="Ej: 101" style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={{ ...labelStyle, marginBottom: 6 }}>id obra</label>
            <input value={editIdObra} onChange={e => setEditIdObra(e.target.value)} placeholder="Ej: 1F3.1" style={{ ...inputStyle, marginBottom: 20 }} />
            {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={editarDepto} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button onClick={() => setModalEditarDepto(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal generar deptos */}
        <IonModal isOpen={modalDepto} onDidDismiss={() => setModalDepto(false)} initialBreakpoint={0.85} breakpoints={[0, 0.85, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Generar departamentos</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>Torre {torreSeleccionada?.nombre}{torreSeleccionada?.frente && ` · ${torreSeleccionada.frente}`}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ ...labelStyle, marginBottom: 4 }}>pisos</label>
                <input value={pisos} onChange={e => setPisos(e.target.value)} type="number" style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 10px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any }} />
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: 4 }}>frentes</label>
                <select value={frentes} onChange={e => setFrente(e.target.value)} style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 8px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any }}>
                  <option value="1">1 (medio)</option>
                  <option value="2">2 (completo)</option>
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: 4 }}>depto inicial</label>
                <input value={numInicial} onChange={e => setNumInicial(e.target.value)} type="number" style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 10px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any }} />
              </div>
            </div>
            <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 8 }}>
              previsualización — {preview.length} departamentos
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20, maxHeight: 200, overflowY: 'auto', background: cardAlt, borderRadius: 12, padding: 12 }}>
              {preview.map((d, i) => (
                <div key={i} style={{ background: card, borderRadius: 8, padding: '5px 8px', border: `0.5px solid ${border}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{d.numero}</div>
                  <div style={{ fontSize: 10, color: textMuted }}>{d.id_obra}</div>
                </div>
              ))}
            </div>
            {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={crearDepartamentos} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : `Crear ${preview.length} departamentos`}
            </button>
            <button onClick={() => setModalDepto(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        <IonAlert isOpen={alertEliminarTorre} onDidDismiss={() => setAlertEliminarTorre(false)}
          header="⚠️ Eliminar torre"
          message={`Esto eliminará la Torre ${torreSeleccionada?.nombre} con todos sus departamentos.`}
          buttons={[{ text: 'Cancelar', role: 'cancel' }, { text: 'Eliminar', role: 'confirm', handler: eliminarTorre }]} />

        <IonAlert isOpen={alertEliminarDeptos} onDidDismiss={() => setAlertEliminarDeptos(false)}
          header="¿Borrar departamentos?"
          message={`Esto eliminará todos los departamentos de la Torre ${torreSeleccionada?.nombre}.`}
          buttons={[{ text: 'Cancelar', role: 'cancel' }, { text: 'Borrar todos', role: 'confirm', handler: eliminarDeptosTorre }]} />

      </IonContent>
    </IonPage>
  );
};

export default DetalleProyecto;

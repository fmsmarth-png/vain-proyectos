import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonSpinner, IonModal, IonMenuButton, IonAlert
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { cache } from '../Context/CacheContext';
import { useLocation } from 'react-router-dom';
import useAppFocus from '../hooks/useAppFocus';
import { generarPDFObservacionesPreEntrega } from '../utils/generarPDFObservacionesPreEntrega';

const estadoLabel: Record<string, string> = {
  pendiente:   'Pendiente',
  solucionado: 'Solucionado',
  aprobado:    'Aprobado',
  rechazado:   'Rechazado',
};

const Revision: React.FC = () => {
  const { theme } = useTheme();
  const { online, cambiosPendientes, agregarCambioPendiente } = useOffline();
  const dark = theme === 'dark';
  const location = useLocation<any>();

  const bg            = dark ? '#0B1220' : '#f0f4f8';
  const card          = dark ? '#16233B'  : '#ffffff';
  const border        = dark ? '#243550'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#5D728F' : '#94a3b8';
  const toolbar       = dark ? '#0E1728' : '#1e3a5f';
  const inputBg       = dark ? '#1B2C48' : '#ffffff';
  const inputBorder   = dark ? '#243550' : '#cbd5e1';
  const sepLine       = dark ? 'linear-gradient(90deg, transparent, #243550, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';
  const regCardBg     = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';

  const estadoColors: Record<string, string> = dark ? {
    pendiente:   '#f87171',
    solucionado: '#60a5fa',
    aprobado:    '#4ade80',
    rechazado:   '#fbbf24',
  } : {
    pendiente:   '#dc2626',
    solucionado: '#2563eb',
    aprobado:    '#16a34a',
    rechazado:   '#d97706',
  };

  const [proyectos, setProyectos]       = useState<any[]>([]);
  const [torres, setTorres]             = useState<any[]>([]);
  const [deptos, setDeptos]             = useState<any[]>([]);
  const [registros, setRegistros]       = useState<any[]>([]);
  // 🆕 Estado para observaciones de PRE-E/PV desde ObservacionesInformePV
  const [observacionesInforme, setObservacionesInforme] = useState<any[]>([]);
  const [ambientes, setAmbientes]       = useState<any[]>([]);
  const [partidas, setPartidas]         = useState<any[]>([]);
  const [proyectoId, setProyectoId]     = useState('');
  const [torreId, setTorreId]           = useState('');
  const [deptoId, setDeptoId]           = useState('');
  const [deptoData, setDeptoData]       = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [cargandoRegs, setCargandoRegs] = useState(false);
  const [usuario, setUsuario]           = useState<any>(null);

  // ZC
  const [esZC, setEsZC]                           = useState(false);
  const [zonaComunId, setZonaComunId]             = useState<string | null>(null);
  const [registrosZC, setRegistrosZC]             = useState<any[]>([]);
  const [checkPendientes, setCheckPendientes]     = useState<any[]>([]);
  const [marcandoCheck, setMarcandoCheck]         = useState<string | null>(null);
  const [ambientesZC, setAmbientesZC]             = useState<any[]>([]);
  const [esEliminarZC, setEsEliminarZC]           = useState(false);
  const [modalEditarZC, setModalEditarZC]         = useState(false);
  const [regEditarZC, setRegEditarZC]             = useState<any>(null);
  const [editZCPiso, setEditZCPiso]               = useState('');
  const [editZCAmbiId, setEditZCAmbiId]           = useState('');
  const [editZCPartidaId, setEditZCPartidaId]     = useState('');
  const [editZCObservacion, setEditZCObservacion] = useState('');
  const [editZCCausa, setEditZCCausa]             = useState('');

  const [modalRechazo, setModalRechazo] = useState(false);
  const [regRechazo, setRegRechazo]     = useState<any>(null);
  const [comentario, setComentario]     = useState('');
  const [guardando, setGuardando]       = useState(false);
  const [error, setError]               = useState('');

  const [modalEditar, setModalEditar]         = useState(false);
  const [regEditar, setRegEditar]             = useState<any>(null);
  const [editAmbienteId, setEditAmbienteId]   = useState('');
  const [editPartidaId, setEditPartidaId]     = useState('');
  const [editObservacion, setEditObservacion] = useState('');
  const [editCausa, setEditCausa]             = useState('');

  const [alertEliminar, setAlertEliminar] = useState(false);
  const [regEliminar, setRegEliminar]     = useState<any>(null);
  const [fotoModal, setFotoModal]         = useState('');
  const [filtro, setFiltro]               = useState<'todos' | 'pendiente' | 'solucionado' | 'aprobado' | 'rechazado'>('todos');
  const [filtroEtapa, setFiltroEtapa]     = useState<'todas' | 'obra' | 'pre_entrega' | 'postventa'>('todas');

  // PDF de observaciones Pre Entrega
  const [generandoPDF, setGenerandoPDF]   = useState(false);
  const [progresoPDF, setProgresoPDF]     = useState('');

  const [modalEntregaInmob, setModalEntregaInmob]           = useState(false);
  const [comentarioEntregaInmob, setComentarioEntregaInmob] = useState('');
  const [guardandoEntrega, setGuardandoEntrega]             = useState(false);
  const [errorEntrega, setErrorEntrega]                     = useState('');
  const [modalEntregaProp, setModalEntregaProp]             = useState(false);
  const [comentarioEntregaProp, setComentarioEntregaProp]   = useState('');

  const [modalTorres, setModalTorres]     = useState(false);
  const [modalDeptos, setModalDeptos]     = useState(false);
  const [torreModal, setTorreModal]       = useState<any>(null);
  const [deptosModal, setDeptosModal]     = useState<any[]>([]);
  const [resumenTorres, setResumenTorres] = useState<any[]>([]);  
  const [cargandoModal, setCargandoModal] = useState(false);

  // 🔧 ACTUALIZADO: Cargar observaciones de forma directa en useEffect
  // (Sin hook complicado que causaba problemas de sincronización)

  useEffect(() => {
    if (!deptoId || !proyectoId) {
      setObservacionesInforme([]);
      return;
    }

    const cargarObservacionesInforme = async () => {
      try {
        const deptoNum = deptos.find(d => d.id === deptoId)?.numero;
        if (!deptoNum) return;

        // Determinar tipo a filtrar
        let tipoFiltro: string | null = null;
        if (filtroEtapa === 'pre_entrega') {
          tipoFiltro = 'PRE-E';
        } else if (filtroEtapa === 'postventa') {
          tipoFiltro = 'PV';
        }

        console.log('Cargando observaciones:', { deptoNum, proyectoId, filtroEtapa, tipoFiltro });

        // Query directa - traer TODOS los campos (sin numero_obs que se calcula en app)
        let query = supabase
          .from('observacionesinformepv')
          .select('id, proyecto_id, proyecto_codigo, torre_codigo, depto_numero, tipo, estado, observacion, ambiente, partida_afectada, causa, usuario_email, usuario_id, fecha_creacion, fecha_resolucion, semana_creacion, semana_resolucion, foto_url')
          .eq('depto_numero', deptoNum)
          .eq('proyecto_id', proyectoId);

        // Agregar filtro de tipo si corresponde
        if (tipoFiltro) {
          query = query.eq('tipo', tipoFiltro);
        }

        const { data, error } = await query.order('fecha_creacion', { ascending: true });

        if (error) {
          console.error('Error cargando observaciones informe:', error);
          setObservacionesInforme([]);
          return;
        }

        console.log('Observaciones cargadas:', data?.length || 0, data);

        // Calcular numero_obs
        const obsMap = new Map<number, number>();
        const withNumero = (data || []).map((obs: any) => {
          const count = (obsMap.get(obs.depto_numero) || 0) + 1;
          obsMap.set(obs.depto_numero, count);
          return {
            ...obs,
            numero_obs: count,
          };
        });

        setObservacionesInforme(withNumero);
      } catch (err) {
        console.error('Error inesperado cargando observaciones:', err);
        setObservacionesInforme([]);
      }
    };

    cargarObservacionesInforme();
  }, [deptoId, proyectoId, deptos, filtroEtapa]);

  useEffect(() => { cargar(); }, []);
  useAppFocus(() => { cargar(); });

  // Resguardo: maestro_postventa no tiene pestaña "obra" en la UI, pero si
  // el estado quedara en 'obra' por algún otro camino (ej. estado heredado),
  // se corrige a 'todas' apenas se conoce el rol.
  useEffect(() => {
    if (usuario?.rol === 'maestro_postventa' && filtroEtapa === 'obra') {
      setFiltroEtapa('todas');
    }
  }, [usuario?.rol, filtroEtapa]);

  useEffect(() => {
    if (proyectoId) { cargarTorres(proyectoId); setTorreId(''); setDeptoId(''); setRegistros([]); setObservacionesInforme([]); setEsZC(false); }
  }, [proyectoId]);

  useEffect(() => {
    if (torreId) { cargarDeptos(torreId); setDeptoId(''); setRegistros([]); setObservacionesInforme([]); setEsZC(false); }
  }, [torreId]);

  useEffect(() => {
    if (!deptoId) return;
    setRegistros([]); setObservacionesInforme([]); setRegistrosZC([]); setCheckPendientes([]); setFiltro('todos'); setFiltroEtapa('todas');
    if (deptoId === '__ZC__') {
      setEsZC(true); setDeptoData(null); cargarDatosZC();
    } else {
      setEsZC(false); setZonaComunId(null);
      cargarRegistros(deptoId);
      if (online) { supabase.from('departamentos').select('*').eq('id', deptoId).single().then(({ data }) => { if (data) setDeptoData(data); }); }
      else { setDeptoData(deptos.find(d => d.id === deptoId) ?? null); }
    }
  }, [deptoId]);

  useEffect(() => {
    const state = location.state as any;
    if (!state?.deptoId || !state?.torreId || !state?.proyectoId) return;
    const iniciar = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data: perfil } = await supabase.from('usuarios').select('*').eq('id', user.id).single();
        if (perfil) setUsuario(perfil);
        const [amb, part] = await Promise.all([supabase.from('ambientes').select('*').order('nombre'), supabase.from('partidas').select('*').order('nombre')]);
        if (amb.data)  { setAmbientes(amb.data);  cache.setAmbientes(amb.data); }
        if (part.data) { setPartidas(part.data);  cache.setPartidas(part.data); }
        const { data: proy } = await supabase.from('proyectos').select('*').eq('id', state.proyectoId).single();
        if (proy) { setProyectos([proy]); setProyectoId(proy.id); cache.setProyectos([proy]); }
        const { data: torresData } = await supabase.from('torres').select('*').eq('proyecto_id', state.proyectoId).order('nombre');
        if (torresData) { setTorres(torresData); const t = torresData.find((t: any) => t.id === state.torreId); if (t) setTorreId(t.id); }
        const { data: deptosData } = await supabase.from('departamentos').select('*').eq('torre_id', state.torreId).order('numero');
        if (deptosData) { setDeptos(deptosData); const d = deptosData.find((d: any) => d.id === state.deptoId); if (d) { setDeptoId(d.id); setDeptoData(d); } }
      } catch {}
      setLoading(false);
    };
    iniciar();
  }, [location.state]);

  useEffect(() => {
    if (!deptoId || !online || esZC) return;
    // 🆕 Cambiar: escuchar AMBAS tablas (registros + ObservacionesInformePV)
    const depto = deptos.find(d => d.id === deptoId);
    const deptoNumero = depto?.numero;

    const channel1 = supabase.channel(`registros_${deptoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros', filter: `departamento_id=eq.${deptoId}` }, () => { cargarRegistros(deptoId); })
      .subscribe();

    const channel2 = deptoNumero ? supabase.channel(`observaciones_informe_${deptoNumero}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ObservacionesInformePV', filter: `depto_numero=eq.${deptoNumero}` }, () => {
        // Recargar desde el hook (ya lo hace automáticamente al cambiar filtroObservacionesInforme)
      })
      .subscribe() : null;

    return () => {
      supabase.removeChannel(channel1);
      if (channel2) supabase.removeChannel(channel2);
    };
  }, [deptoId, online, esZC, deptos]);

  const cargar = async () => {
    setLoading(true);
    const proyCache = cache.getProyectos(); if (proyCache.length > 0) setProyectos(proyCache);
    const usuCache = cache.getUsuario(); if (usuCache) setUsuario(usuCache);
    const ambCache = cache.getAmbientes(), partCache = cache.getPartidas();
    if (ambCache.length > 0) setAmbientes(ambCache);
    if (partCache.length > 0) setPartidas(partCache);
    if (online) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data: perfil } = await supabase.from('usuarios').select('*').eq('id', user.id).single();
        if (perfil) setUsuario(perfil);
        let proy;
        if (perfil?.rol === 'administrador') { const { data } = await supabase.from('proyectos').select('*').order('nombre'); proy = data; }
        else { const { data: asignados } = await supabase.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user.id); const ids = asignados?.map((a: any) => a.proyecto_id) ?? []; const { data } = await supabase.from('proyectos').select('*').in('id', ids).order('nombre'); proy = data; }
        if (proy) { setProyectos(proy); cache.setProyectos(proy); }
        const [amb, part] = await Promise.all([supabase.from('ambientes').select('*').order('nombre'), supabase.from('partidas').select('*').order('nombre')]);
        if (amb.data)  { setAmbientes(amb.data);  cache.setAmbientes(amb.data); }
        if (part.data) { setPartidas(part.data);  cache.setPartidas(part.data); }
      } catch {}
    }
    setLoading(false);
  };

  const cargarTorres = async (pId: string) => {
    const cached = cache.getTorres(pId); if (cached.length > 0) setTorres(cached);
    if (online) { try { const { data } = await supabase.from('torres').select('*').eq('proyecto_id', pId).order('nombre'); if (data) { setTorres(data); cache.setTorres(pId, data); } } catch {} }
  };

  const cargarDeptos = async (tId: string) => {
    const cached = cache.getDeptos(tId); if (cached.length > 0) setDeptos(cached);
    if (online) { try { const { data } = await supabase.from('departamentos').select('*').eq('torre_id', tId).order('numero'); if (data) { setDeptos(data); cache.setDeptos(tId, data); } } catch {} }
  };

  // 🆕 CAMBIO: Cargar registros SOLO de la tabla `registros` (para etapa 'obra')
  const cargarRegistros = async (dId: string) => {
    setCargandoRegs(true);
    if (online) {
      try {
        const { data } = await supabase.from('registros').select('*, ambientes(nombre), partidas(nombre), usuarios!registros_creado_por_fkey(id, nombre)').eq('departamento_id', dId).order('creado_en', { ascending: true });
        if (data) { setRegistros(data); cache.setRegistros(dId, data); }
      } catch { const cached = cache.getRegistros(dId); if (cached.length > 0) setRegistros(cached); }
    } else { setRegistros(cache.getRegistros(dId)); }
    setCargandoRegs(false);
  };

  // ── ZC ─────────────────────────────────────────────────────────────────────
  const cargarDatosZC = async () => {
    if (!torreId || !online) return;
    setCargandoRegs(true);
    try {
      const { data: zona } = await supabase.from('zonas_comunes').select('id').eq('torre_id', torreId).eq('tipo', 'general').maybeSingle();
      if (!zona) { setCargandoRegs(false); return; }
      setZonaComunId(zona.id);
      const [regsRes, checkRes, ambsRes] = await Promise.all([
        supabase.from('registros_zonas_comunes').select('*, partidas(nombre)').eq('zona_comun_id', zona.id).order('creado_en', { ascending: true }),
        supabase.from('checklist_sala_basura').select('*').eq('zona_comun_id', zona.id).eq('ok', false),
        supabase.from('ambientes_zc').select('id, nombre, activo'),
      ]);
      const ambMap: Record<string, string> = {};
      (ambsRes.data ?? []).forEach((a: any) => { ambMap[a.id] = a.nombre; });
      setAmbientesZC(ambsRes.data ?? []);
      setRegistrosZC((regsRes.data ?? []).map((r: any) => ({ ...r, ambientes_zc: { nombre: ambMap[r.ambiente_zc_id] ?? '' } })));
      setCheckPendientes(checkRes.data ?? []);
    } catch {}
    setCargandoRegs(false);
  };

  const cambiarEstadoZC = async (reg: any, nuevoEstado: string, comentarioRechazo?: string) => {
  setGuardando(true);
  const actualizados = registrosZC.map(r =>
    r.id === reg.id
      ? { ...r, estado: nuevoEstado, comentario_rechazo: comentarioRechazo ?? null }
      : r
  );
  setRegistrosZC(actualizados);
  if (online) {
    const { error } = await supabase
      .from('registros_zonas_comunes')
      .update({
        estado: nuevoEstado,
        comentario_rechazo: comentarioRechazo ?? null,
        ...(nuevoEstado === 'solucionado' ? { fecha_reparacion: new Date().toISOString() } : {}),
      })
      .eq('id', reg.id);
    if (error) console.error('Error ZC update:', JSON.stringify(error));
  }
  setGuardando(false);
};

  const abrirEditarZC = (reg: any) => {
    setRegEditarZC(reg);
    setEditZCPiso(String(reg.piso ?? ''));
    setEditZCAmbiId(reg.ambiente_zc_id ?? '');
    setEditZCPartidaId(reg.partida_id ?? '');
    setEditZCObservacion(reg.observacion ?? '');
    setEditZCCausa(reg.causa ?? '');
    setError('');
    setModalEditarZC(true);
  };

  const guardarEdicionZC = async () => {
    if (!editZCObservacion.trim()) { setError('La observación es obligatoria'); return; }
    setGuardando(true);
    const datos = { piso: parseInt(editZCPiso), ambiente_zc_id: editZCAmbiId, partida_id: editZCPartidaId, observacion: editZCObservacion.trim(), causa: editZCCausa.trim() || null };
    const ambNombre  = ambientesZC.find(a => a.id === editZCAmbiId)?.nombre  ?? regEditarZC.ambientes_zc?.nombre ?? '';
    const partNombre = partidas.find(p => p.id === editZCPartidaId)?.nombre   ?? regEditarZC.partidas?.nombre     ?? '';
    setRegistrosZC(prev => prev.map(r => r.id === regEditarZC.id ? { ...r, ...datos, ambientes_zc: { nombre: ambNombre }, partidas: { nombre: partNombre } } : r));
    setModalEditarZC(false);
    if (online) await supabase.from('registros_zonas_comunes').update(datos).eq('id', regEditarZC.id);
    setGuardando(false);
  };

  const confirmarEliminarZC = async () => {
    if (!regEliminar) return;
    setRegistrosZC(prev => prev.filter(r => r.id !== regEliminar.id));
    setAlertEliminar(false); setEsEliminarZC(false);
    if (online) await supabase.from('registros_zonas_comunes').delete().eq('id', regEliminar.id);
    setRegEliminar(null);
  };

  const marcarItemOK = async (item: any) => {
    if (!zonaComunId) return;
    setMarcandoCheck(item.item_numero);
    try {
      await supabase.from('checklist_sala_basura').upsert({ zona_comun_id: zonaComunId, item_numero: item.item_numero, item_descripcion: item.item_descripcion, ok: true, actualizado_en: new Date().toISOString() }, { onConflict: 'zona_comun_id,item_numero' });
      setCheckPendientes(prev => prev.filter(i => i.item_numero !== item.item_numero));
    } catch {}
    setMarcandoCheck(null);
  };

  // ── Depto helpers ──────────────────────────────────────────────────────────
  const recargarDepto = async () => {
    if (!deptoId) return;
    const { data } = await supabase.from('departamentos').select('*').eq('id', deptoId).single();
    if (data) { setDeptoData(data); setDeptos(prev => prev.map(d => d.id === deptoId ? data : d)); }
  };

  const cargarResumenTorres = async (pId: string) => {
    if (!online) return;
    try {
      const { data: torresData } = await supabase.from('torres').select('*, departamentos(id)').eq('proyecto_id', pId).order('nombre');
      if (!torresData) return;
      const resumen = await Promise.all(torresData.map(async (t: any) => {
        const deptoIds = t.departamentos?.map((d: any) => d.id) ?? [];
        if (deptoIds.length === 0) return { ...t, conObs: 0, total: 0 };
        const { data: regs } = await supabase.from('registros').select('departamento_id').in('departamento_id', deptoIds);
        const conObs = new Set(regs?.map((r: any) => r.departamento_id) ?? []).size;
        return { ...t, conObs, total: deptoIds.length };
      }));
      setResumenTorres(resumen);
    } catch {}
  };

  const abrirModalTorre = async (torre: any) => {
    setTorreModal(torre); setDeptosModal([]); setCargandoModal(true); setModalDeptos(true);
    try {
      const { data: deptosData } = await supabase.from('departamentos').select('*').eq('torre_id', torre.id).order('numero');
      if (!deptosData) { setCargandoModal(false); return; }
      const deptoIds = deptosData.map((d: any) => d.id);
      const { data: regs } = await supabase.from('registros').select('departamento_id').in('departamento_id', deptoIds);
      const conRegistros = new Set(regs?.map((r: any) => r.departamento_id) ?? []);
      setDeptosModal(deptosData.map((d: any) => ({ ...d, tieneRegistros: conRegistros.has(d.id) })));
    } catch {}
    setCargandoModal(false);
  };

  const seleccionarDepto = (depto: any) => {
    setModalDeptos(false); setModalTorres(false);
    const torre = resumenTorres.find(t => t.id === torreModal?.id);
    if (torre) { setTorreId(torre.id); cache.setDeptos(torre.id, deptosModal); setDeptos(deptosModal); }
    setTimeout(() => { setDeptoId(depto.id); }, 100);
  };

  const cambiarEstado = async (reg: any, nuevoEstado: string, comentarioRechazo?: string) => {
    setGuardando(true);
    
    // 🆕 Detectar si es observación de informe: Debe tener partida_afectada (clave)
    // O si tiene usuario_email (las nuevas observaciones las tendrán)
    const esObservacionInforme = reg.partida_afectada !== null && reg.partida_afectada !== undefined;
    console.log('🔍 DEBUG cambiarEstado:', { id: reg.id, esObservacionInforme, usuario_email: reg.usuario_email, partida_afectada: reg.partida_afectada });
    
    if (esObservacionInforme) {
      // 🆕 Es de observacionesinformepv → actualizar esa tabla
      // Normalizar estado a mayúsculas para cumplir con CHECK constraint
      const estadoNormalizado = nuevoEstado.toUpperCase();
      const obsActualizadas = observacionesInforme.map(o => 
        o.id === reg.id ? { ...o, estado: estadoNormalizado } : o
      );
      setObservacionesInforme(obsActualizadas);
      
      if (online) {
        try {
          let updateData: any = { estado: estadoNormalizado };
          
          // Agregar fecha_resolucion y semana_resolucion si cambia a SOLUCIONADO
          if (estadoNormalizado === 'SOLUCIONADO') {
            const ahora = new Date();
            updateData.fecha_resolucion = ahora.toISOString();
            
            // Calcular semana de resolución
            const inicio = new Date(ahora.getFullYear(), 0, 1);
            const diff = ahora.getTime() - inicio.getTime();
            const semana = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
            updateData.semana_resolucion = `${semana}-${ahora.getFullYear()}`;
          }
          
          // ✅ FIX: Validar que existe ANTES de actualizar
          const { data: existe, error: errorExiste } = await supabase
            .from('observacionesinformepv')
            .select('id')
            .eq('id', reg.id)
            .maybeSingle();
          
          if (errorExiste) {
            console.error('[Revision] ❌ Error consultando observación:', errorExiste);
            setObservacionesInforme(observacionesInforme); // Revertir cambio visual
            setError(`Error al guardar: ${errorExiste.message}`);
          } else if (!existe) {
            console.error('[Revision] ❌ FALLO SILENCIOSO: ID no existe en observacionesinformepv:', reg.id);
            setObservacionesInforme(observacionesInforme); // Revertir cambio visual
            setError(`No se encontró la observación con ID ${reg.id}`);
          } else {
            // ✅ Existe, ahora actualizar
            const { error: errorUpdate } = await supabase
              .from('observacionesinformepv')
              .update(updateData)
              .eq('id', reg.id);
            
            if (errorUpdate) {
              console.error('[Revision] ❌ Error actualizando observación:', errorUpdate);
              setObservacionesInforme(observacionesInforme); // Revertir cambio visual
              setError(`Error al guardar: ${errorUpdate.message}`);
            } else {
              // ✅ Verificar que realmente se guardó
              const { data: actualizado, error: errorVerify } = await supabase
                .from('observacionesinformepv')
                .select('estado, fecha_resolucion')
                .eq('id', reg.id)
                .maybeSingle();
              
              if (errorVerify || !actualizado) {
                console.error('[Revision] ❌ Error verificando actualización:', errorVerify);
                setObservacionesInforme(observacionesInforme); // Revertir cambio visual
                setError('Error: No se pudo confirmar la actualización');
              } else if (actualizado.estado !== estadoNormalizado) {
                console.error('[Revision] ❌ Estado no cambió en BD. Esperado:', estadoNormalizado, 'Obtenido:', actualizado.estado);
                setObservacionesInforme(observacionesInforme); // Revertir cambio visual
                setError(`Error: El estado no se guardó correctamente (${actualizado.estado})`);
              } else {
                console.log('[Revision] ✅ Observación actualizada correctamente en BD:', reg.id, actualizado);
              }
            }
          }
        } catch (e: any) {
          console.error('[Revision] ❌ Excepción:', e.message);
          setObservacionesInforme(observacionesInforme);
          setError(`Error inesperado: ${e.message}`);
        }
      } else {
        // ✅ FIX: Manejar offline con agregarCambioPendiente
        console.log('[Revision] Cambio marcado como pendiente (offline):', reg.id);
        agregarCambioPendiente('estado', reg.id, { estado: estadoNormalizado, fecha_resolucion: estadoNormalizado === 'SOLUCIONADO' ? new Date().toISOString() : null });
      }
    } else {
      // Es de registros → actualizar esa tabla (lógica original)
      const registrosActualizados = registros.map(r => r.id === reg.id ? { ...r, estado: nuevoEstado, comentario_rechazo: comentarioRechazo ?? null } : r);
      setRegistros(registrosActualizados); cache.setRegistros(deptoId, registrosActualizados);
      if (online) { const { error } = await supabase.from('registros').update({ estado: nuevoEstado, comentario_rechazo: comentarioRechazo ?? null, ...(nuevoEstado === 'solucionado' ? { fecha_reparacion: new Date().toISOString() } : {}) }).eq('id', reg.id); if (error) { setRegistros(registros); cache.setRegistros(deptoId, registros); } }
      else { agregarCambioPendiente('estado', reg.id, { estado: nuevoEstado, comentario_rechazo: comentarioRechazo ?? null, fecha_reparacion: nuevoEstado === 'solucionado' ? new Date().toISOString() : null }); }
    }
    
    setGuardando(false);
  };

  const confirmarEntregaInmobiliaria = async () => {
    setGuardandoEntrega(true); setErrorEntrega('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('departamentos').update({ estado_entrega: 'entregado_inmobiliaria', fecha_entrega_inmobiliaria: new Date().toISOString(), confirmado_por: user?.id, comentario: comentarioEntregaInmob.trim() || null }).eq('id', deptoId);
      if (error) { setErrorEntrega('Error: ' + error.message); setGuardandoEntrega(false); return; }
      setModalEntregaInmob(false); setComentarioEntregaInmob(''); await recargarDepto();
    } catch (e: any) { setErrorEntrega('Error inesperado: ' + e.message); }
    setGuardandoEntrega(false);
  };

  const confirmarEntregaPropietario = async () => {
    setGuardandoEntrega(true); setErrorEntrega('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('departamentos').update({ estado_entrega: 'postventa', fecha_entrega_propietario: new Date().toISOString(), entregado_por: user?.id, comentario: comentarioEntregaProp.trim() || null }).eq('id', deptoId);
      if (error) { setErrorEntrega('Error: ' + error.message); setGuardandoEntrega(false); return; }
      setModalEntregaProp(false); setComentarioEntregaProp(''); await recargarDepto();
    } catch (e: any) { setErrorEntrega('Error inesperado: ' + e.message); }
    setGuardandoEntrega(false);
  };

  const abrirRechazo = (reg: any, esZCReg = false) => { setRegRechazo({ ...reg, _esZC: esZCReg }); setComentario(''); setError(''); setModalRechazo(true); };
  const confirmarRechazo = async () => {
    if (!comentario.trim()) { setError('El comentario es obligatorio'); return; }
    setGuardando(true);
    if (regRechazo?._esZC) { await cambiarEstadoZC(regRechazo, 'pendiente', comentario.trim()); }
    else { await cambiarEstado(regRechazo, 'pendiente', comentario.trim()); }
    setModalRechazo(false); setGuardando(false);
  };

  const abrirEditar = (reg: any) => { setRegEditar(reg); setEditAmbienteId(reg.ambiente_id ?? ''); setEditPartidaId(reg.partida_id ?? ''); setEditObservacion(reg.observacion ?? ''); setEditCausa(reg.causa ?? ''); setError(''); setModalEditar(true); };

  const guardarEdicion = async () => {
    if (!editAmbienteId || !editPartidaId || !editObservacion.trim()) { setError('Ambiente, partida y observación son obligatorios'); return; }
    setGuardando(true);
    const datosEdicion = { ambiente_id: editAmbienteId, partida_id: editPartidaId, observacion: editObservacion.trim(), causa: editCausa.trim() || null };
    const registrosActualizados = registros.map(r => r.id === regEditar.id ? { ...r, ...datosEdicion, ambientes: ambientes.find(a => a.id === editAmbienteId), partidas: partidas.find(p => p.id === editPartidaId) } : r);
    setRegistros(registrosActualizados); cache.setRegistros(deptoId, registrosActualizados); setModalEditar(false);
    if (online) { const { error } = await supabase.from('registros').update(datosEdicion).eq('id', regEditar.id); if (error) { setRegistros(registros); cache.setRegistros(deptoId, registros); setError('Error al guardar: ' + error.message); } }
    else { agregarCambioPendiente('edicion', regEditar.id, datosEdicion); }
    setGuardando(false);
  };

  const confirmarEliminar = async () => {
    if (!regEliminar) return;
    if (esEliminarZC) { await confirmarEliminarZC(); return; }

    // Detectar si la obs viene de observacionesinformepv (pre-entrega/PV)
    const esDelInforme = regEliminar.usuario_email !== undefined && regEliminar.partida_afectada !== undefined;

    if (esDelInforme) {
      // Pre-entrega / PV → borrar de observacionesinformepv
      const obsActualizadas = observacionesInforme.filter(o => o.id !== regEliminar.id);
      setObservacionesInforme(obsActualizadas);
      setAlertEliminar(false);
      if (online) {
        const { error } = await supabase.from('observacionesinformepv').delete().eq('id', regEliminar.id);
        if (error) {
          console.error('[Revision] Error eliminando obs pre-entrega:', error.message);
          setObservacionesInforme(observacionesInforme); // Revertir
        }
      }
    } else {
      // Obra → borrar de registros
      const registrosActualizados = registros.filter(r => r.id !== regEliminar.id);
      setRegistros(registrosActualizados); cache.setRegistros(deptoId, registrosActualizados);
      setAlertEliminar(false);
      if (online) {
        const { error } = await supabase.from('registros').delete().eq('id', regEliminar.id);
        if (error) { setRegistros(registros); cache.setRegistros(deptoId, registros); }
      } else {
        agregarCambioPendiente('eliminacion', regEliminar.id, {});
      }
    }
    setRegEliminar(null);
  };

  const puedeAprobar      = ['prof_terminaciones', 'director_obra', 'administrador'].includes(usuario?.rol);
  const puedeSolucionar   = ['jefe_terreno', 'prof_terminaciones', 'director_obra', 'administrador'].includes(usuario?.rol);
  const puedeRecibirInmob = ['vendedor_inmobiliaria', 'administrador'].includes(usuario?.rol);
  const puedeEntregarProp = ['vendedor_inmobiliaria', 'administrador'].includes(usuario?.rol);
  // maestro_postventa: solo puede alternar PENDIENTE <-> SOLUCIONADO en
  // observaciones de PRE-ENTREGA (tipo 'PRE-E'), para dejar registro de
  // avance. No aprueba, no rechaza, no edita/elimina, no ve el PDF, y en
  // Post Venta (tipo 'PV') no cambia estados desde acá — eso se hace desde
  // el propio flujo de PostVenta.tsx (fotos + receptor + firma).
  const esMaestro = usuario?.rol === 'maestro_postventa';

  // Generar PDF de observaciones Pre Entrega
  const generarPDFObservaciones = async () => {
    if (!deptoId || !proyectoId) return;
    const proyectoObj = proyectos.find((p: any) => p.id === proyectoId);
    const torreObj = torres.find((t: any) => t.id === torreId);
    const deptoObj = deptos.find((d: any) => d.id === deptoId);
    if (!proyectoObj || !torreObj || !deptoObj) return;

    setGenerandoPDF(true);
    setProgresoPDF('Cargando observaciones...');

    try {
      const obsParaPDF = observacionesInforme
        .filter((o: any) => o.tipo === 'PRE-E')
        .map((obs: any, idx: number) => ({
          id: obs.id,
          numero: idx + 1,
          ambiente: obs.ambiente || '—',
          observacion: obs.observacion || obs.descripcion || '—',
          partida_afectada: obs.partida_afectada || '',
          foto_url: obs.foto_url || null,
          fecha_creacion: obs.fecha_creacion || obs.creado_en || '',
        }));

      if (obsParaPDF.length === 0) {
        alert('No hay observaciones Pre Entrega para generar PDF');
        return;
      }

      await generarPDFObservacionesPreEntrega({
        proyectoNombre: proyectoObj.nombre || '',
        torreName: torreObj.nombre || '',
        deptoNumero: deptoObj.numero || '',
        torreFrente: torreObj.frente,
        deptoId_obra: deptoObj.id_obra,
        observaciones: obsParaPDF,
        dark,
        onProgreso: (msg: string, pct: number) => {
          setProgresoPDF(msg);
        },
      });
    } catch (error: any) {
      console.error('[Revision] Error generando PDF:', error);
      alert('Error al generar PDF: ' + error.message);
    } finally {
      setGenerandoPDF(false);
      setProgresoPDF('');
    }
  };

  // 🆕 LÓGICA DE MEZCLA: Combinar registros (obra) + observacionesInforme (PRE-E/PV)
  let registrosFiltradosPorEtapa: any[] = [];
  let conteos: any = { pendiente: 0, solucionado: 0, aprobado: 0, rechazado: 0 };

  // Normalizar observacionesInforme con campo etapa
  const observacionesConEtapa = observacionesInforme.map(o => ({ 
    ...o, 
    etapa: o.tipo === 'PRE-E' ? 'pre_entrega' : 'postventa' 
  }));

  // Filtrar registros SOLO para etapa 'obra' (excluir pre_entrega y postventa que están en ObservacionesInformePV)
  const registrosObraOnly = registros.filter(r => r.etapa === 'obra' || !r.etapa);

  if (filtroEtapa === 'todas') {
    // Mezclar: registros de obra + todas las observaciones de informe.
    // maestro_postventa no tiene ningún rol en el módulo de obra, así que su
    // "Todas" solo mezcla Pre Entrega + Post Venta, sin registros de obra.
    registrosFiltradosPorEtapa = [
      ...(esMaestro ? [] : registrosObraOnly),
      ...observacionesConEtapa
    ];
  } else if (filtroEtapa === 'obra') {
    // SOLO registros de obra (excluir pre_entrega y postventa)
    registrosFiltradosPorEtapa = registrosObraOnly;
  } else if (filtroEtapa === 'pre_entrega') {
    // SOLO observaciones PRE-E de ObservacionesInformePV
    registrosFiltradosPorEtapa = observacionesConEtapa.filter(o => o.tipo === 'PRE-E');
  } else if (filtroEtapa === 'postventa') {
    // SOLO observaciones PV de ObservacionesInformePV
    registrosFiltradosPorEtapa = observacionesConEtapa.filter(o => o.tipo === 'PV');
  }

  // Calcular conteos
  conteos = {
    pendiente:   registrosFiltradosPorEtapa.filter(r => r.estado === 'PENDIENTE' || (r.estado === 'pendiente' && !r.comentario_rechazo)).length,
    solucionado: registrosFiltradosPorEtapa.filter(r => r.estado === 'SOLUCIONADO' || r.estado === 'solucionado').length,
    aprobado:    registrosFiltradosPorEtapa.filter(r => r.estado === 'aprobado').length,
    rechazado:   registrosFiltradosPorEtapa.filter(r => r.comentario_rechazo).length,
  };

  // Aplicar filtro por estado
  const registrosFiltrados = registrosFiltradosPorEtapa.filter(r => {
    if (filtro === 'todos') return true;
    if (filtro === 'rechazado') return !!r.comentario_rechazo;
    if (filtro === 'pendiente') return (r.estado === 'PENDIENTE' || r.estado === 'pendiente') && !r.comentario_rechazo;
    if (filtro === 'solucionado') return r.estado === 'SOLUCIONADO' || r.estado === 'solucionado';
    return r.estado === filtro;
  });

  const conteosZC = {
    pendiente:   registrosZC.filter(r => r.estado === 'pendiente' && !r.comentario_rechazo).length,
    solucionado: registrosZC.filter(r => r.estado === 'solucionado').length,
    aprobado:    registrosZC.filter(r => r.estado === 'aprobado').length,
    rechazado:   registrosZC.filter(r => r.comentario_rechazo).length,
  };
  const registrosZCFiltrados = registrosZC.filter(r => {
    if (filtro === 'todos') return true;
    if (filtro === 'rechazado') return !!r.comentario_rechazo;
    if (filtro === 'pendiente') return r.estado === 'pendiente' && !r.comentario_rechazo;
    return r.estado === filtro;
  });

  const formatFecha = (fecha: string) => new Date(fecha).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

  const labelStyle  = { fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };
  const selectStyle = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };
  const taStyle     = { width: '100%', height: 80, borderRadius: 10, padding: '10px 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, resize: 'none' as any, marginBottom: 12 };

  if (loading && proyectos.length === 0) return (
    <IonPage id="main-content">
      <IonContent style={{ '--background': bg }}>
        <div style={{ textAlign: 'center', marginTop: 100 }}><IonSpinner name="crescent" /></div>
      </IonContent>
    </IonPage>
  );

  const entregaColor  = deptoData?.estado_entrega === 'postventa' ? (dark ? '#fbbf24' : '#a16207') : deptoData?.estado_entrega === 'entregado_inmobiliaria' ? (dark ? '#60a5fa' : '#1d4ed8') : deptoData?.estado_entrega === 'pre_entrega' ? (dark ? '#4ade80' : '#15803d') : textMuted;
  const entregaBg     = deptoData?.estado_entrega === 'postventa' ? (dark ? 'rgba(251,191,36,0.06)' : '#fffbeb') : deptoData?.estado_entrega === 'entregado_inmobiliaria' ? (dark ? 'rgba(96,165,250,0.06)' : '#eff6ff') : deptoData?.estado_entrega === 'pre_entrega' ? (dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4') : (dark ? 'rgba(107,114,128,0.06)' : '#f8fafc');
  const entregaBorder = deptoData?.estado_entrega === 'postventa' ? (dark ? 'rgba(251,191,36,0.2)' : '#fde68a') : deptoData?.estado_entrega === 'entregado_inmobiliaria' ? (dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe') : deptoData?.estado_entrega === 'pre_entrega' ? (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : border;
  const entregaTexto  = deptoData?.estado_entrega === 'postventa' ? '🔧 Postventa' : deptoData?.estado_entrega === 'entregado_inmobiliaria' ? '🏢 Entregado a Inmobiliaria' : deptoData?.estado_entrega === 'pre_entrega' ? '🏠 Pre-entrega' : '🏗️ Obra';

  const etapaPill = (etapa: string) => {
    if (etapa === 'postventa')   return { bg: dark ? 'rgba(251,191,36,0.08)' : '#fffbeb',  color: dark ? '#fbbf24' : '#a16207', border: dark ? 'rgba(251,191,36,0.2)' : '#fde68a' };
    if (etapa === 'pre_entrega') return { bg: dark ? 'rgba(74,222,128,0.08)' : '#f0fdf4',  color: dark ? '#4ade80' : '#15803d', border: dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0' };
    return { bg: dark ? 'rgba(96,165,250,0.08)' : '#eff6ff', color: dark ? '#60a5fa' : '#1d4ed8', border: dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe' };
  };

  const CardObsZC = ({ r }: { r: any }) => {
    const eColor = estadoColors[r.estado];
    return (
      <div style={{ background: regCardBg, borderRadius: 16, padding: 14, marginBottom: 10, border: `0.5px solid ${border}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: dark ? 'rgba(96,165,250,0.1)' : '#eff6ff', color: dark ? '#60a5fa' : '#2563eb', border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe' }}>
                Piso {r.piso}
              </span>
              <span style={{ fontSize: 11, color: textSecondary }}>{r.ambientes_zc?.nombre} · {r.partidas?.nombre}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>{r.observacion}</div>
            {r.causa && <div style={{ fontSize: 11, color: textSecondary, marginBottom: 4 }}><strong style={{ color: textMuted }}>Causa:</strong> {r.causa}</div>}
            {r.comentario_rechazo && (
              <div style={{ fontSize: 11, color: dark ? '#fbbf24' : '#a16207', background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb', padding: '6px 10px', borderRadius: 8, border: dark ? '0.5px solid rgba(251,191,36,0.15)' : '0.5px solid #fde68a', marginBottom: 4 }}>
                ⚠️ Rechazo: {r.comentario_rechazo}
              </div>
            )}
          </div>
          {r.foto_url && (
            <div onClick={() => setFotoModal(r.foto_url)} style={{ flexShrink: 0, cursor: 'pointer' }}>
              <img src={r.foto_url} style={{ width: 100, height: 75, objectFit: 'cover', borderRadius: 10, border: `0.5px solid ${border}`, display: 'block' }} />
              <div style={{ fontSize: 9, color: textMuted, marginTop: 3, textAlign: 'center' }}>ampliar</div>
            </div>
          )}
          <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, flexShrink: 0, background: eColor + (dark ? '15' : '12'), color: eColor, border: `0.5px solid ${eColor}40`, fontWeight: 600, alignSelf: 'flex-start' }}>
            {estadoLabel[r.estado]}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {r.creado_por === usuario?.id && r.estado === 'pendiente' && (
            <>
              <button onClick={() => abrirEditarZC(r)} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(96,165,250,0.06)' : '#eff6ff', border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe', color: dark ? '#60a5fa' : '#1d4ed8', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>✏️ Editar</button>
              <button onClick={() => { setRegEliminar(r); setEsEliminarZC(true); setAlertEliminar(true); }} style={{ height: 34, padding: '0 12px', borderRadius: 8, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca', color: dark ? '#f87171' : '#b91c1c', fontSize: 12, cursor: 'pointer' }}>🗑️</button>
            </>
          )}
          {puedeSolucionar && (r.estado === 'pendiente' || r.estado === 'rechazado') && (
            <button onClick={() => cambiarEstadoZC(r, 'solucionado')} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(96,165,250,0.06)' : '#eff6ff', border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe', color: dark ? '#60a5fa' : '#1d4ed8', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>🔧 Solucionado</button>
          )}
          {puedeAprobar && r.estado === 'solucionado' && (
            <button onClick={() => cambiarEstadoZC(r, 'aprobado')} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', color: dark ? '#4ade80' : '#15803d', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>✓ Aprobar</button>
          )}
          {puedeAprobar && r.estado === 'solucionado' && (
            <button onClick={() => abrirRechazo(r, true)} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb', border: dark ? '0.5px solid rgba(251,191,36,0.2)' : '0.5px solid #fde68a', color: dark ? '#fbbf24' : '#a16207', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>✗ Rechazar</button>
          )}
          {usuario?.rol === 'administrador' && r.estado === 'aprobado' && (
            <button onClick={() => cambiarEstadoZC(r, 'pendiente')} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 12, cursor: 'pointer' }}>↩ Reabrir</button>
          )}
        </div>
      </div>
    );
  };

  // 🆕 HELPER: Normalizar campos de ObservacionesInformePV para renderizado
  const renderRegistro = (r: any, index: number): React.ReactNode => {
    // Si viene de ObservacionesInformePV, adaptar campos
    const esDelInforme: boolean = r.usuario_email !== undefined && r.partida_afectada !== undefined;
    const esCreador: boolean = esDelInforme ? r.usuario_id === usuario?.id : r.usuarios?.id === usuario?.id;
    // maestro_postventa nunca edita/elimina observaciones, aunque por algún
    // motivo figurara como "creador" de la fila (no debería pasar, ya que no
    // tiene acceso a crear observaciones de pre entrega ni de post venta
    // desde acá).
    // Obs de obra (tabla registros): creador puede editar/eliminar si pendiente.
    // Obs de pre-entrega (observacionesinformepv): solo admin puede eliminar.
    const esAdmin: boolean = usuario?.rol === 'administrador';
    const puedeEditarEliminar: boolean = !esMaestro && !esDelInforme && esCreador && (r.estado === 'PENDIENTE' || r.estado === 'pendiente');
    const puedeEliminarPreEntrega: boolean = esAdmin && esDelInforme && (r.tipo === 'PRE-E' || r.etapa === 'pre_entrega');
    // Observación de Pre Entrega proveniente de observacionesinformepv — el
    // único tipo de fila donde maestro_postventa puede tocar el estado.
    const esObsPreEntrega: boolean = esDelInforme && (r.tipo === 'PRE-E' || r.etapa === 'pre_entrega');
    const puedeSolucionarComoMaestro: boolean =
      esMaestro && esObsPreEntrega && (r.estado === 'PENDIENTE' || r.estado === 'pendiente');
    const puedeReabrirComoMaestro: boolean =
      esMaestro && esObsPreEntrega && (r.estado === 'SOLUCIONADO' || r.estado === 'solucionado');
    const estado: string = r.estado?.toLowerCase() || 'pendiente';
    const eColor: string = estadoColors[estado] || '#94a3b8';
    const pill: any = etapaPill(r.etapa || (r.tipo === 'PRE-E' ? 'pre_entrega' : 'postventa'));

    return (
      <div key={r.id + index} style={{ background: regCardBg, borderRadius: 16, padding: 14, marginBottom: 10, border: `0.5px solid ${border}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: pill.bg, color: pill.color, border: `0.5px solid ${pill.border}` }}>
                {r.etapa === 'postventa' || r.tipo === 'PV' ? '🔧 PV' : r.etapa === 'pre_entrega' || r.tipo === 'PRE-E' ? '🏠 Pre-E' : '🏗️ Obra'}
              </span>
              <span style={{ fontSize: 11, color: textSecondary }}>
                {esDelInforme ? `${r.ambiente} · ${r.partida_afectada}` : `${r.ambientes?.nombre} · ${r.partidas?.nombre}`}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>{r.observacion}</div>
            {r.causa && <div style={{ fontSize: 11, color: textSecondary, marginBottom: 4 }}><strong style={{ color: textMuted }}>Causa:</strong> {r.causa}</div>}
            {r.comentario_rechazo && (
              <div style={{ fontSize: 11, color: dark ? '#fbbf24' : '#a16207', background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb', padding: '6px 10px', borderRadius: 8, border: dark ? '0.5px solid rgba(251,191,36,0.15)' : '0.5px solid #fde68a', marginBottom: 4 }}>
                ⚠️ Rechazo: {r.comentario_rechazo}
              </div>
            )}
            <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>
              {esDelInforme ? r.usuario_email : r.usuarios?.nombre ?? 'desconocido'}
            </div>
          </div>
          {r.foto_url && (
            <div onClick={() => setFotoModal(r.foto_url)} style={{ flexShrink: 0, cursor: 'pointer' }}>
              <img src={r.foto_url} style={{ width: 100, height: 75, objectFit: 'cover', borderRadius: 10, border: `0.5px solid ${border}`, display: 'block' }}
                onError={e => { const img = e.target as HTMLImageElement; if (!img.dataset.retried) { img.dataset.retried = '1'; setTimeout(() => { img.src = r.foto_url + '?r=' + Date.now(); }, 1500); } }} />
              <div style={{ fontSize: 9, color: textMuted, marginTop: 3, textAlign: 'center' }}>ampliar</div>
            </div>
          )}
          <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, flexShrink: 0, background: eColor + (dark ? '15' : '12'), color: eColor, border: `0.5px solid ${eColor}40`, fontWeight: 600, alignSelf: 'flex-start' }}>
            {r.estado === 'PENDIENTE' || r.estado === 'SOLUCIONADO' ? estadoLabel[r.estado.toLowerCase()] : estadoLabel[r.estado]}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {puedeEditarEliminar && (
            <>
              <button onClick={() => abrirEditar(r)} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(96,165,250,0.06)' : '#eff6ff', border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe', color: dark ? '#60a5fa' : '#1d4ed8', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>✏️ Editar</button>
              <button onClick={() => { setRegEliminar(r); setEsEliminarZC(false); setAlertEliminar(true); }} style={{ height: 34, padding: '0 12px', borderRadius: 8, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca', color: dark ? '#f87171' : '#b91c1c', fontSize: 12, cursor: 'pointer' }}>🗑️</button>
            </>
          )}
          {puedeEliminarPreEntrega && (
            <button onClick={() => { setRegEliminar(r); setEsEliminarZC(false); setAlertEliminar(true); }} style={{ height: 34, padding: '0 12px', borderRadius: 8, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca', color: dark ? '#f87171' : '#b91c1c', fontSize: 12, cursor: 'pointer' }}>🗑️ Eliminar</button>
          )}
          {puedeSolucionar && ((r.estado === 'PENDIENTE' || r.estado === 'pendiente') || r.estado === 'rechazado') && (
            <button onClick={() => cambiarEstado(r, 'solucionado')} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(96,165,250,0.06)' : '#eff6ff', border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe', color: dark ? '#60a5fa' : '#1d4ed8', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>🔧 Solucionado</button>
          )}
          {puedeSolucionarComoMaestro && (
            <button onClick={() => cambiarEstado(r, 'solucionado')} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(96,165,250,0.06)' : '#eff6ff', border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe', color: dark ? '#60a5fa' : '#1d4ed8', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>🔧 Marcar solucionado</button>
          )}
          {puedeReabrirComoMaestro && (
            <button onClick={() => cambiarEstado(r, 'pendiente')} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>↩ Volver a pendiente</button>
          )}
          {puedeAprobar && (r.estado === 'SOLUCIONADO' || r.estado === 'solucionado') && (
            <button onClick={() => cambiarEstado(r, 'aprobado')} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', color: dark ? '#4ade80' : '#15803d', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>✓ Aprobar</button>
          )}
          {puedeAprobar && (r.estado === 'SOLUCIONADO' || r.estado === 'solucionado') && (
            <button onClick={() => abrirRechazo(r)} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb', border: dark ? '0.5px solid rgba(251,191,36,0.2)' : '0.5px solid #fde68a', color: dark ? '#fbbf24' : '#a16207', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>✗ Rechazar</button>
          )}
          {usuario?.rol === 'administrador' && r.estado === 'aprobado' && (
            <button onClick={() => cambiarEstado(r, 'pendiente')} disabled={guardando} style={{ flex: 1, height: 34, borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 12, cursor: 'pointer' }}>↩ Reabrir</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonMenuButton slot="start" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }} />
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>Revisión de Observaciones</IonTitle>
          <div slot="end" style={{ paddingRight: 14 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : '#fbbf24' }} />
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Seleccionar departamento</div>
          <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

          <div style={{ background: dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 8, border: `0.5px solid ${border}` }}>
            <label style={labelStyle}>proyecto</label>
            <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} style={selectStyle}>
              <option value="">Seleccionar proyecto...</option>
              {proyectos.map((p: any) => <option key={p.id as string} value={p.id as string}>{p.nombre}</option>)}
            </select>
            <label style={labelStyle}>torre</label>
            <select value={torreId} onChange={e => setTorreId(e.target.value)} style={{ ...selectStyle, opacity: !proyectoId ? 0.3 : 1 }} disabled={!proyectoId}>
              <option value="">Seleccionar torre...</option>
              {torres.map((t: any) => <option key={t.id as string} value={t.id as string}>Torre {t.nombre}{t.frente ? ` (${t.frente})` : ''}</option>)}
            </select>
            <label style={labelStyle}>departamento</label>
            <select value={deptoId} onChange={e => setDeptoId(e.target.value)} style={{ ...selectStyle, opacity: !torreId ? 0.3 : 1, marginBottom: 0 }} disabled={!torreId}>
              <option value="">Seleccionar departamento...</option>
              {torreId && <option value="__ZC__">🏢 Zona Común</option>}
              {deptos.map((d: any) => <option key={d.id as string} value={d.id as string}>{d.numero}{d.id_obra ? ` · ${d.id_obra}` : ''}</option>)}
            </select>
          </div>

          {proyectoId && online && (
            <button onClick={() => { cargarResumenTorres(proyectoId); setModalTorres(true); }} style={{ width: '100%', height: 38, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 12, cursor: 'pointer', marginBottom: 16 }}>
              🗺️ Ver mapa de torres y departamentos
            </button>
          )}
          {!proyectoId && <div style={{ marginBottom: 16 }} />}

          {deptoId && !esZC && deptoData && (
            <div style={{ background: entregaBg, borderRadius: 12, padding: '10px 14px', marginBottom: 12, border: `0.5px solid ${entregaBorder}` }}>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 6 }}>Estado de entrega</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: entregaColor }} />
                  <span style={{ fontSize: 12, color: entregaColor, fontWeight: 500 }}>{entregaTexto}</span>
                </div>
                {deptoData.fecha_entrega_inmobiliaria && <span style={{ fontSize: 10, color: textMuted }}>Inm: {formatFecha(deptoData.fecha_entrega_inmobiliaria)}</span>}
                {deptoData.fecha_entrega_propietario  && <span style={{ fontSize: 10, color: textMuted }}>Prop: {formatFecha(deptoData.fecha_entrega_propietario)}</span>}
              </div>
            </div>
          )}

          {!online && (
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#fbbf24' }}>Sin conexión — los cambios se sincronizarán al reconectarse</span>
            </div>
          )}
          {cambiosPendientes > 0 && (
            <div style={{ background: dark ? 'rgba(96,165,250,0.06)' : '#eff6ff', border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#60a5fa' : '#2563eb', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: dark ? '#60a5fa' : '#1d4ed8' }}>{cambiosPendientes} cambio(s) pendiente(s) de sincronizar</span>
            </div>
          )}

          {/* ── ZONA COMÚN ── */}
          {esZC && (
            <>
              {cargandoRegs ? (
                <div style={{ textAlign: 'center', marginTop: 40 }}><IonSpinner name="crescent" /></div>
              ) : (
                <>
                  {registrosZC.length > 0 && (
                    <>
                      <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Observaciones Zona Común</div>
                      <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                        {Object.entries(conteosZC).map(([estado, count]: [string, any]) => {
                          const ec = estadoColors[estado];
                          return (
                            <div key={estado} style={{ background: dark ? 'linear-gradient(135deg, #16233B 0%, #1E2E4A 100%)' : '#fff', borderRadius: 14, padding: '12px 14px', border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: ec }} />
                              <div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: ec, lineHeight: 1 }}>{count}</div>
                                <div style={{ fontSize: 9, color: textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '1px' }}>{estadoLabel[estado]}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                        {(['todos', 'pendiente', 'solucionado', 'aprobado', 'rechazado'] as const).map((f: any) => {
                          const ec = f !== 'todos' ? estadoColors[f] : undefined;
                          const activo = filtro === f;
                          return (
                            <button key={f} onClick={() => setFiltro(f)} style={{ height: 28, padding: '0 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0, background: activo ? (f === 'todos' ? (dark ? '#1E2E4A' : '#1e3a5f') : ec + (dark ? '15' : '12')) : 'transparent', color: activo ? (f === 'todos' ? '#fff' : ec) : textMuted, border: `0.5px solid ${activo ? (f === 'todos' ? (dark ? '#2E4468' : '#1e3a5f') : ec + '40') : border}` }}>
                              {f === 'todos' ? `Todos (${registrosZC.length})` : `${estadoLabel[f]} (${conteosZC[f as keyof typeof conteosZC]})`}
                            </button>
                          );
                        })}
                      </div>
                      {registrosZCFiltrados.map((r: any) => <CardObsZC key={r.id as string} r={r} />)}
                    </>
                  )}
                  {registrosZC.length === 0 && (
                    <div style={{ textAlign: 'center', marginTop: 20, marginBottom: 24, color: textMuted, fontSize: 13 }}>Sin observaciones registradas en Zona Común</div>
                  )}
                  {checkPendientes.length > 0 && (
                    <>
                      <div style={{ fontSize: 9, color: dark ? '#fbbf24' : '#a16207', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12, marginTop: 8 }}>
                        ☑️ Checklist pendiente ({checkPendientes.length} ítems sin OK)
                      </div>
                      <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
                      {checkPendientes.map((item: any) => (
                        <div key={item.item_numero} style={{ background: regCardBg, borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: `0.5px solid ${dark ? 'rgba(251,191,36,0.2)' : '#fde68a'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 10, color: dark ? '#fbbf24' : '#a16207', fontWeight: 700 }}>({item.item_numero})</span>
                            </div>
                            <div style={{ fontSize: 13, color: textPrimary }}>{item.item_descripcion}</div>
                            {item.observacion && <div style={{ fontSize: 11, color: textSecondary, marginTop: 3 }}>Obs: {item.observacion}</div>}
                          </div>
                          <button onClick={() => marcarItemOK(item)} disabled={marcandoCheck === item.item_numero} style={{ height: 34, padding: '0 14px', borderRadius: 8, background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', color: dark ? '#4ade80' : '#15803d', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                            {marcandoCheck === item.item_numero ? '...' : '✓ OK'}
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  {checkPendientes.length === 0 && registrosZC.length > 0 && (
                    <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 12, padding: '10px 14px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e' }} />
                      <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d' }}>✓ Checklist completo — todos los ítems OK</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── DEPTO NORMAL ── */}
          {!esZC && (
            <>
              {deptoId && (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {(esMaestro ? ['todas', 'pre_entrega', 'postventa'] : ['todas', 'obra', 'pre_entrega', 'postventa'] as const).map((e: any) => (
                      <button key={e} onClick={() => setFiltroEtapa(e)} style={{ flex: 1, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 10, fontWeight: 600, background: filtroEtapa === e ? (dark ? '#1E2E4A' : '#1e3a5f') : 'transparent', color: filtroEtapa === e ? '#fff' : textMuted, border: `0.5px solid ${filtroEtapa === e ? (dark ? '#2E4468' : '#1e3a5f') : border}` }}>
                        {e === 'todas' ? '📋 Todas' : e === 'obra' ? '🏗️ Obra' : e === 'pre_entrega' ? '🏠 Pre-E' : '🔧 PV'}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {deptoId && registrosFiltradosPorEtapa.length > 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {Object.entries(conteos).map(([estado, count]: [string, any]) => {
                      const ec = estadoColors[estado];
                      return (
                        <div key={estado} style={{ background: dark ? 'linear-gradient(135deg, #16233B 0%, #1E2E4A 100%)' : '#fff', borderRadius: 14, padding: '12px 14px', border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: ec }} />
                          <div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: ec, lineHeight: 1 }}>{count}</div>
                            <div style={{ fontSize: 9, color: textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '1px' }}>{estadoLabel[estado]}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                    {(['todos', 'pendiente', 'solucionado', 'aprobado', 'rechazado'] as const).map((f: any) => {
                      const ec = f !== 'todos' ? estadoColors[f] : undefined;
                      const activo = filtro === f;
                      return (
                        <button key={f} onClick={() => setFiltro(f)} style={{ height: 28, padding: '0 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0, background: activo ? (f === 'todos' ? (dark ? '#1E2E4A' : '#1e3a5f') : ec + (dark ? '15' : '12')) : 'transparent', color: activo ? (f === 'todos' ? '#fff' : ec) : textMuted, border: `0.5px solid ${activo ? (f === 'todos' ? (dark ? '#2E4468' : '#1e3a5f') : ec + '40') : border}` }}>
                          {f === 'todos' ? `Todos (${registrosFiltradosPorEtapa.length})` : `${estadoLabel[f]} (${conteos[f as keyof typeof conteos]})`}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {!esMaestro && filtroEtapa === 'pre_entrega' && registrosFiltradosPorEtapa.length > 0 && (
                <button onClick={generarPDFObservaciones} disabled={generandoPDF} style={{
                  width: '100%', height: 42, borderRadius: 10, marginBottom: 14,
                  background: dark ? 'rgba(59,130,246,0.08)' : '#eff6ff',
                  border: dark ? '0.5px solid rgba(59,130,246,0.2)' : '0.5px solid #bfdbfe',
                  color: dark ? '#60a5fa' : '#1d4ed8',
                  fontSize: 12, fontWeight: 600, cursor: generandoPDF ? 'not-allowed' : 'pointer',
                  opacity: generandoPDF ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}>
                  {generandoPDF ? `⏳ ${progresoPDF || 'Generando...'}` : `📄 Descargar PDF (${registrosFiltradosPorEtapa.length} obs)`}
                </button>
              )}
              {cargandoRegs ? (
                <div style={{ textAlign: 'center', marginTop: 40 }}><IonSpinner name="crescent" /></div>
              ) : deptoId && registrosFiltradosPorEtapa.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: 60 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 14, color: textSecondary }}>Sin observaciones registradas</div>
                </div>
              ) : registrosFiltrados.map((r: any, idx: number) => renderRegistro(r, idx) as React.ReactNode)}
              {deptoId && online && (
                <>
                  {puedeEntregarProp && deptoData?.estado_entrega === 'entregado_inmobiliaria' && (
                    <div style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#fff', borderRadius: 16, padding: 16, marginTop: 8, border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0' }}>
                      <div style={{ fontSize: 11, color: dark ? '#4ade80' : '#15803d', marginBottom: 6, fontWeight: 600 }}>🔑 Registrar entrega al propietario</div>
                      <div style={{ fontSize: 11, color: textSecondary, marginBottom: 12 }}>Al confirmar, el departamento pasará a estado Postventa.</div>
                      <button onClick={() => { setErrorEntrega(''); setComentarioEntregaProp(''); setModalEntregaProp(true); }} style={{ width: '100%', height: 42, borderRadius: 10, background: dark ? 'rgba(74,222,128,0.08)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', color: dark ? '#4ade80' : '#15803d', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>🔑 Confirmar entrega al propietario</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div style={{ height: 40 }} />
        </div>

        {/* ────────────────────── MODALES (sin cambios) ────────────────────── */}
        
        {/* Modal mapa torres */}
        <IonModal isOpen={modalTorres} onDidDismiss={() => setModalTorres(false)} initialBreakpoint={0.85} breakpoints={[0, 0.85, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Torres del proyecto</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>Toca una torre para ver sus departamentos</div>
            {resumenTorres.length === 0 ? <div style={{ textAlign: 'center', marginTop: 40 }}><IonSpinner name="crescent" /></div> : resumenTorres.map((t: any) => {
              const pct = t.total > 0 ? Math.round((t.conObs / t.total) * 100) : 0;
              return (
                <div key={t.id} style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#f8fafc', borderRadius: 14, padding: 14, marginBottom: 10, border: `0.5px solid ${border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? 'linear-gradient(135deg, #1E2E4A, #26395C)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: dark ? '#6E86A6' : '#fff' }}>{t.nombre}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>Torre {t.nombre}{t.frente ? ` (${t.frente})` : ''}</div>
                        <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{t.conObs}/{t.total} deptos con obs</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? (dark ? '#4ade80' : '#15803d') : textMuted }}>{pct}%</span>
                  </div>
                  <div style={{ height: 3, background: dark ? '#16233B' : '#f1f5f9', borderRadius: 2, marginBottom: 10 }}>
                    <div style={{ height: 3, borderRadius: 2, background: pct === 100 ? (dark ? '#4ade80' : '#22c55e') : (dark ? 'linear-gradient(90deg, #333, #6E86A6)' : 'linear-gradient(90deg, #bfdbfe, #2563eb)'), width: `${pct}%`, transition: 'width 0.3s' }} />
                  </div>
                  <button onClick={() => abrirModalTorre(t)} style={{ background: 'none', border: 'none', color: dark ? '#6E86A6' : '#2563eb', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 500 }}>ver deptos →</button>
                </div>
              );
            })}
            <button onClick={() => setModalTorres(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cerrar</button>
          </div>
        </IonModal>

        {/* Modal deptos */}
        <IonModal isOpen={modalDeptos} onDidDismiss={() => setModalDeptos(false)} initialBreakpoint={0.85} breakpoints={[0, 0.85, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Torre {torreModal?.nombre}{torreModal?.frente ? ` (${torreModal.frente})` : ''}</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 8 }}>Toca un departamento para revisar sus observaciones</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e' }} /><span style={{ fontSize: 11, color: textSecondary }}>Con observaciones</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: border }} /><span style={{ fontSize: 11, color: textSecondary }}>Sin observaciones</span></div>
            </div>
            {cargandoModal ? <div style={{ textAlign: 'center', marginTop: 40 }}><IonSpinner name="crescent" /></div> : deptosModal.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: 40, color: textMuted, fontSize: 13 }}>Sin departamentos registrados</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {deptosModal.map((d: any) => (
                  <button key={d.id} onClick={() => seleccionarDepto(d)} style={{ background: d.tieneRegistros ? (dark ? 'linear-gradient(135deg, rgba(34,197,94,0.12), #16233B)' : '#f0fdf4') : (dark ? 'linear-gradient(135deg, #16233B, #1E2E4A)' : '#f8fafc'), border: `0.5px solid ${d.tieneRegistros ? (dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0') : border}`, borderRadius: 12, padding: '10px 14px', cursor: 'pointer', textAlign: 'center', minWidth: 72 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: d.tieneRegistros ? (dark ? '#4ade80' : '#15803d') : textPrimary }}>{d.numero}</div>
                    <div style={{ fontSize: 10, color: d.tieneRegistros ? (dark ? '#4ade80' : '#15803d') : textMuted, marginTop: 2 }}>{d.id_obra}</div>
                    {d.tieneRegistros && <div style={{ fontSize: 10, color: dark ? '#4ade80' : '#15803d', marginTop: 3 }}>✓</div>}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setModalDeptos(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 24, cursor: 'pointer' }}>Cerrar</button>
          </div>
        </IonModal>

        {/* Modal entrega inmobiliaria */}
        <IonModal isOpen={modalEntregaInmob} onDidDismiss={() => setModalEntregaInmob(false)} initialBreakpoint={0.55} breakpoints={[0, 0.55, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Entrega a inmobiliaria</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>Se registrará la fecha actual y tu usuario como receptor.</div>
            <label style={labelStyle}>comentario (opcional)</label>
            <textarea value={comentarioEntregaInmob} onChange={e => setComentarioEntregaInmob(e.target.value)} placeholder="Ej: Entrega conforme..." style={taStyle} />
            {errorEntrega && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{errorEntrega}</div>}
            <button onClick={confirmarEntregaInmobiliaria} disabled={guardandoEntrega} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {guardandoEntrega ? 'Guardando...' : '🏢 Confirmar recepción'}
            </button>
            <button onClick={() => setModalEntregaInmob(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal entrega propietario */}
        <IonModal isOpen={modalEntregaProp} onDidDismiss={() => setModalEntregaProp(false)} initialBreakpoint={0.55} breakpoints={[0, 0.55, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Entrega al propietario</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>El departamento pasará a estado Postventa.</div>
            <label style={labelStyle}>comentario (opcional)</label>
            <textarea value={comentarioEntregaProp} onChange={e => setComentarioEntregaProp(e.target.value)} placeholder="Ej: Entrega conforme con propietario..." style={taStyle} />
            {errorEntrega && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{errorEntrega}</div>}
            <button onClick={confirmarEntregaPropietario} disabled={guardandoEntrega} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {guardandoEntrega ? 'Guardando...' : '🔑 Confirmar entrega al propietario'}
            </button>
            <button onClick={() => setModalEntregaProp(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal editar depto normal */}
        <IonModal isOpen={modalEditar} onDidDismiss={() => setModalEditar(false)} initialBreakpoint={0.85} breakpoints={[0, 0.85, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Editar observación</div>
            <label style={labelStyle}>ambiente *</label>
            <select value={editAmbienteId} onChange={e => setEditAmbienteId(e.target.value)} style={selectStyle}><option value="">Seleccionar ambiente...</option>{ambientes.map((a: any) => <option key={a.id as string} value={a.id as string}>{a.nombre}</option>)}</select>
            <label style={labelStyle}>partida *</label>
            <select value={editPartidaId} onChange={e => setEditPartidaId(e.target.value)} style={selectStyle}><option value="">Seleccionar partida...</option>{partidas.map((p: any) => <option key={p.id as string} value={p.id as string}>{p.nombre}</option>)}</select>
            <label style={labelStyle}>observación *</label>
            <textarea value={editObservacion} onChange={e => setEditObservacion(e.target.value)} style={taStyle} />
            <label style={labelStyle}>causa</label>
            <textarea value={editCausa} onChange={e => setEditCausa(e.target.value)} style={{ ...taStyle, marginBottom: 20 }} />
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={guardarEdicion} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button onClick={() => setModalEditar(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal editar ZC */}
        <IonModal isOpen={modalEditarZC} onDidDismiss={() => setModalEditarZC(false)} initialBreakpoint={0.85} breakpoints={[0, 0.85, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Editar observación ZC</div>
            <label style={labelStyle}>piso *</label>
            <select value={editZCPiso} onChange={e => { setEditZCPiso(e.target.value); setEditZCAmbiId(''); }} style={selectStyle}>
              <option value="">Seleccionar piso...</option>
              {[1,2,3,4,5].map(n => <option key={n} value={String(n)}>Piso {n}</option>)}
            </select>
            <label style={labelStyle}>ambiente *</label>
            <select value={editZCAmbiId} onChange={e => setEditZCAmbiId(e.target.value)} style={selectStyle}>
              <option value="">Seleccionar ambiente...</option>
              {ambientesZC.filter((a: any) => a.activo).map((a: any) => <option key={a.id as string} value={a.id as string}>{a.nombre}</option>)}
            </select>
            <label style={labelStyle}>partida *</label>
            <select value={editZCPartidaId} onChange={e => setEditZCPartidaId(e.target.value)} style={selectStyle}>
              <option value="">Seleccionar partida...</option>
              {partidas.map((p: any) => <option key={p.id as string} value={p.id as string}>{p.nombre}</option>)}
            </select>
            <label style={labelStyle}>observación *</label>
            <textarea value={editZCObservacion} onChange={e => setEditZCObservacion(e.target.value)} style={taStyle} />
            <label style={labelStyle}>causa</label>
            <textarea value={editZCCausa} onChange={e => setEditZCCausa(e.target.value)} style={{ ...taStyle, marginBottom: 20 }} />
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={guardarEdicionZC} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button onClick={() => setModalEditarZC(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal rechazo */}
        <IonModal isOpen={modalRechazo} onDidDismiss={() => setModalRechazo(false)} initialBreakpoint={0.5} breakpoints={[0, 0.5, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Rechazar observación</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>{regRechazo?.observacion}</div>
            <label style={labelStyle}>motivo del rechazo *</label>
            <textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Describe por qué se rechaza el trabajo..." style={{ ...taStyle, height: 100 }} />
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={confirmarRechazo} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: dark ? 'rgba(251,191,36,0.08)' : '#fffbeb', border: dark ? '0.5px solid rgba(251,191,36,0.2)' : '0.5px solid #fde68a', color: dark ? '#fbbf24' : '#a16207', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : '✗ Confirmar rechazo'}
            </button>
            <button onClick={() => setModalRechazo(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal foto */}
        <IonModal isOpen={!!fotoModal} onDidDismiss={() => setFotoModal('')}>
          <div style={{ background: '#0B1220', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <button onClick={() => setFotoModal('')} style={{ position: 'absolute', top: 48, right: 16, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 20, cursor: 'pointer' }}>×</button>
            <img src={fotoModal} style={{ width: '100%', maxHeight: '90vh', objectFit: 'contain' }} />
          </div>
        </IonModal>

        <IonAlert isOpen={alertEliminar} onDidDismiss={() => setAlertEliminar(false)}
          header="¿Eliminar observación?" message="Esta acción no se puede deshacer."
          buttons={[{ text: 'Cancelar', role: 'cancel', handler: () => setEsEliminarZC(false) }, { text: 'Eliminar', role: 'confirm', handler: confirmarEliminar }]} />

      </IonContent>
    </IonPage>
  );
};

export default Revision;
import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonButton, IonSpinner, IonModal
} from '@ionic/react';
import { useEffect, useState, useRef } from 'react';
import { useLocation, useHistory } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { cache } from '../Context/CacheContext';
import { comprimirImagen } from '../utils/comprimirImagen';

// ─── Clave de sessionStorage ──────────────────────────────────────────────────
const SESSION_KEY = 'zonas_comunes_state';

const ZonasComunes: React.FC = () => {
  const location = useLocation<any>();
  const history  = useHistory();
  const { theme } = useTheme();
  const { online, pendientesZC, agregarPendienteZC, obtenerPendientesZC } = useOffline();

  // ─── Recuperar state: location.state tiene prioridad; sessionStorage es fallback ───
  const resolveNavState = () => {
    if (location.state?.torre) return location.state;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const navState = resolveNavState();
  const torre    = navState?.torre   ?? null;
  const proyecto = navState?.proyecto ?? null;

  const getPendientesZC = () => {
    if (typeof obtenerPendientesZC === 'function') return obtenerPendientesZC();
    try {
      const raw = localStorage.getItem('registros_zc_pendientes');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };

  const dark = theme === 'dark';

  const bg            = dark ? '#0B1220' : '#f0f4f8';
  const card          = dark ? '#16233B'  : '#ffffff';
  const border        = dark ? '#243550'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#5D728F' : '#94a3b8';
  const toolbar       = dark ? '#0E1728' : '#1e3a5f';
  const inputBg       = dark ? '#1B2C48' : '#ffffff';
  const inputBorder   = dark ? '#243550' : '#cbd5e1';
  const sepLine       = dark
    ? 'linear-gradient(90deg, transparent, #243550, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';

  const [ambientesZC, setAmbientesZC]         = useState<any[]>([]);
  const [partidas, setPartidas]               = useState<any[]>([]);
  const [causasEstandar, setCausasEstandar]   = useState<string[]>([]);
  const [causasTerceros, setCausasTerceros]   = useState<string[]>([]);
  const [nombresTerceros, setNombresTerceros] = useState<string[]>([]);

  const [pisoSel, setPisoSel]           = useState('');
  const [ambienteZCId, setAmbienteZCId] = useState('');
  const [partidaId, setPartidaId]       = useState('');
  const [observacion, setObservacion]   = useState('');
  const [causaSel, setCausaSel]         = useState('');
  const [terceroSel, setTerceroSel]     = useState('');
  const [foto, setFoto]                 = useState<File | null>(null);
  const [fotoPreview, setFotoPreview]   = useState<string | null>(null);

  const [guardando, setGuardando]     = useState(false);
  const [guardadoOk, setGuardadoOk]   = useState(false);
  const [error, setError]             = useState('');
  const [registros, setRegistros]     = useState<any[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(false);

  const userIdRef  = useRef<string>('');
  const montadoRef = useRef(false);

  const [checkItems, setCheckItems]         = useState<any[]>([]);
  const [checkEstados, setCheckEstados]     = useState<Record<string, boolean>>({});
  const [checkObs, setCheckObs]             = useState<Record<string, string>>({});
  const [zonaId, setZonaId]                 = useState<string>('');
  const [guardandoCheck, setGuardandoCheck] = useState(false);
  const [checkOk, setCheckOk]               = useState(false);

  const [planos, setPlanos]       = useState<any[]>([]);
  const [fotoModal, setFotoModal] = useState('');
  const [tab, setTab]             = useState<'obs' | 'checklist' | 'planos'>('checklist');

  const esCausaTercero = causasTerceros.includes(causaSel);
  const causaFinal     = esCausaTercero && terceroSel ? `${causaSel} — ${terceroSel}` : causaSel;
  const totalPisos     = torre?.pisos ?? 4;
  const pisosOpciones  = Array.from({ length: totalPisos }, (_, i) => i + 1);
  const ambientesFiltrados = ambientesZC.filter(a => {
    if (!a.activo) return false;
    if (a.solo_piso_1 && pisoSel !== '1') return false;
    return true;
  });

  // ─── Persistir state válido en sessionStorage ─────────────────────────────
  useEffect(() => {
    if (location.state?.torre) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(location.state));
      } catch {}
    }
  }, [location.state]);

  // ─── useIonViewDidEnter reemplaza el useEffect de montaje ────────────────
  useIonViewDidEnter(() => {
    const currentState = (() => {
      if (location.state?.torre) return location.state;
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    })();

    if (!currentState?.torre) {
      history.replace('/proyectos');
      return;
    }

    // Reset del guard para permitir re-carga al volver desde el menú
    montadoRef.current = false;

    if (!montadoRef.current) {
      montadoRef.current = true;
      cargar(currentState.torre, currentState.proyecto);
    }
  });

  // Cuando se reconecta, recargar para mostrar los ya sincronizados
  useEffect(() => {
    if (online && zonaId) cargarRegistros(zonaId);
  }, [online]);

  const cargar = async (torreData?: any, proyectoData?: any) => {
    const torreActual   = torreData   ?? torre;
    const proyectoActual = proyectoData ?? proyecto;
    if (!torreActual) return;

    try {
      const partCache = cache.getPartidas();
      if (partCache.length > 0) setPartidas(partCache);
      userIdRef.current = localStorage.getItem('detalles_user_id') ?? '';

      if (online) {
        const [ambZC, part, causas] = await Promise.all([
          supabase.from('ambientes_zc').select('*').eq('activo', true).order('orden'),
          supabase.from('partidas').select('*').order('nombre'),
          supabase.from('causas').select('*').order('nombre'),
        ]);
        if (ambZC.data)  setAmbientesZC(ambZC.data);
        if (part.data)  { setPartidas(part.data); cache.setPartidas(part.data); }
        if (causas.data) {
          setCausasEstandar(causas.data.filter((c: any) => c.tipo === 'estandar').map((c: any) => c.nombre));
          setCausasTerceros(causas.data.filter((c: any) => c.tipo === 'tercero').map((c: any) => c.nombre));
          setNombresTerceros(causas.data.filter((c: any) => c.tipo === 'nombre_tercero').map((c: any) => c.nombre));
        }

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) { userIdRef.current = user.id; localStorage.setItem('detalles_user_id', user.id); }
        } catch (e) { console.warn('No se pudo obtener usuario:', e); }

        let { data: zona } = await supabase
          .from('zonas_comunes').select('*')
          .eq('torre_id', torreActual.id).eq('tipo', 'general').maybeSingle();
        if (!zona) {
          const { data: nueva } = await supabase
            .from('zonas_comunes')
            .insert({ nombre: `Zona Común Torre ${torreActual.nombre}`, torre_id: torreActual.id, tipo: 'general' })
            .select().single();
          zona = nueva;
        }

        if (zona) {
          setZonaId(zona.id);
          try { await cargarRegistros(zona.id, torreActual); } catch (e) { console.error('Error cargando registros ZC:', e); }
          try { await cargarChecklist(zona.id); } catch (e) { console.error('Error cargando checklist:', e); }
        }

        try {
          const { data: planosData } = await supabase
            .from('planos').select('*')
            .or(`torre_id.eq.${torreActual.id},proyecto_id.eq.${proyectoActual?.id}`)
            .order('creado_en', { ascending: false });
          setPlanos(planosData ?? []);
        } catch (e) { console.warn('Error cargando planos:', e); }

      } else {
        mostrarPendientesLocales(torreActual);
      }
    } catch (e) {
      // Antes solo se logueaba en consola: el usuario veía la pantalla vacía
      // (sin ambientes, partidas ni registros) sin ninguna pista de que algo
      // había fallado, y podía confundirlo con "no hay datos".
      console.error('Error general en cargar():', e);
      setError('No se pudieron cargar los datos de la zona común. Revisa tu conexión y vuelve a intentar.');
    }
  };

  const mostrarPendientesLocales = (torreData?: any) => {
    const torreActual = torreData ?? torre;
    const cola = getPendientesZC();
    const locales = cola
      .filter((r: any) => r.datos?.torre_id === torreActual?.id)
      .map((r: any) => ({
        id: r.id,
        observacion: r.datos.observacion,
        causa: r.datos.causa,
        piso: r.datos.piso,
        ambiente_zc_id: r.datos.ambiente_zc_id,
        partida_id: r.datos.partida_id,
        estado: 'pendiente',
        foto_url: r.foto_base64 ?? null,
        creado_en: new Date(r.timestamp).toISOString(),
        _local: true,
        ambientes_zc: { nombre: '' },
        partidas: { nombre: '' },
      }));
    setRegistros(locales);
  };

  const cargarRegistros = async (zId?: string, torreData?: any) => {
    const id = zId ?? zonaId;
    const torreActual = torreData ?? torre;
    if (!id) return;
    setLoadingRegs(true);
    const [regsRes, ambsRes] = await Promise.all([
      supabase.from('registros_zonas_comunes').select('*, partidas (nombre)').eq('zona_comun_id', id).eq('torre_id', torreActual.id).order('creado_en', { ascending: false }),
      supabase.from('ambientes_zc').select('id, nombre'),
    ]);
    const ambMap: Record<string, string> = {};
    (ambsRes.data ?? []).forEach((a: any) => { ambMap[a.id] = a.nombre; });

    const regsOnline = (regsRes.data ?? []).map((r: any) => ({
      ...r,
      ambientes_zc: { nombre: ambMap[r.ambiente_zc_id] ?? '' },
    }));

    const cola = getPendientesZC();
    const locales = cola
      .filter((r: any) => r.datos?.torre_id === torreActual?.id)
      .map((r: any) => ({
        id: r.id,
        observacion: r.datos.observacion,
        causa: r.datos.causa,
        piso: r.datos.piso,
        ambiente_zc_id: r.datos.ambiente_zc_id,
        partida_id: r.datos.partida_id,
        estado: 'pendiente',
        foto_url: r.foto_base64 ?? null,
        creado_en: new Date(r.timestamp).toISOString(),
        _local: true,
        ambientes_zc: { nombre: ambMap[r.datos.ambiente_zc_id] ?? '' },
        partidas: { nombre: (regsRes.data ?? []).find((p: any) => p.id === r.datos.partida_id)?.partidas?.nombre ?? '' },
      }));

    setRegistros([...locales, ...regsOnline]);
    setLoadingRegs(false);
  };

  const cargarChecklist = async (zId?: string) => {
    const id = zId ?? zonaId;
    if (!id) return;
    const [itemsRes, estadosRes] = await Promise.all([
      supabase.from('checklist_sala_basura_items').select('*').order('seccion').order('numero'),
      supabase.from('checklist_sala_basura').select('*').eq('zona_comun_id', id),
    ]);

    console.log('checklist_items data:', itemsRes.data);
    console.log('checklist_items error:', itemsRes.error);
    console.log('checklist_estados data:', estadosRes.data);
    console.log('checklist_estados error:', estadosRes.error);

    const items = itemsRes.data;
    const estados = estadosRes.data;
    const estadosMap: Record<string, boolean> = {};
    const obsMap: Record<string, string> = {};
    (estados ?? []).forEach((e: any) => { estadosMap[e.item_numero] = e.ok === true; obsMap[e.item_numero] = e.observacion ?? ''; });
    (items ?? []).forEach((i: any) => { if (!(i.numero in estadosMap)) estadosMap[i.numero] = false; });
    setCheckItems(items ?? []);
    setCheckEstados(estadosMap);
    setCheckObs(obsMap);
  };

  const toggleCheck = (numero: string) => { setCheckEstados(prev => ({ ...prev, [numero]: !prev[numero] })); };

  const marcarTodos = (valor: boolean) => {
    const nuevo: Record<string, boolean> = {};
    checkItems.forEach(i => { nuevo[i.numero] = valor; });
    setCheckEstados(nuevo);
  };

  const guardarChecklist = async () => {
    if (!zonaId) return;
    setGuardandoCheck(true);
    try {
      const rows = checkItems.map(i => ({ zona_comun_id: zonaId, item_numero: i.numero, item_descripcion: i.descripcion, ok: checkEstados[i.numero] ?? false, observacion: checkObs[i.numero] ?? '', actualizado_en: new Date().toISOString() }));
      await supabase.from('checklist_sala_basura').upsert(rows, { onConflict: 'zona_comun_id,item_numero' });
      setCheckOk(true);
      setTimeout(() => setCheckOk(false), 2500);
    } catch (e: any) { setError('Error al guardar checklist: ' + e.message); }
    setGuardandoCheck(false);
  };

  const subirFoto = async (file: File | Blob, userId: string): Promise<string | null> => {
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    const { error } = await supabase.storage
      .from('fotos-registros')
      .upload(fileName, file, { contentType: 'image/jpeg' });
    // Si falla la subida, lanzamos el error (en vez de devolver null) para que
    // el catch de guardarObs() encole el registro con la foto en la cola
    // offline, en vez de guardarlo sin foto mostrando éxito.
    if (error) throw new Error('No se pudo subir la foto: ' + error.message);
    const { data } = supabase.storage.from('fotos-registros').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const guardarObs = async () => {
    if (!pisoSel)            { setError('Selecciona el piso'); return; }
    if (!ambienteZCId)       { setError('Selecciona el ambiente'); return; }
    if (!partidaId)          { setError('Selecciona la partida'); return; }
    if (!observacion.trim()) { setError('La observación es obligatoria'); return; }
    if (esCausaTercero && !terceroSel) { setError('Selecciona la cuadrilla responsable'); return; }

    setGuardando(true); setError('');

    try {
      let userId = userIdRef.current || localStorage.getItem('detalles_user_id') || '';
      if (!userId && online) {
        try { const { data: { user } } = await Promise.race([supabase.auth.getUser(), new Promise<any>((_, reject) => setTimeout(() => reject('timeout'), 3000))]); if (user?.id) { userId = user.id; userIdRef.current = user.id; localStorage.setItem('detalles_user_id', user.id); } } catch {}
      }
      if (!userId) { setError('No se pudo identificar el usuario'); setGuardando(false); return; }

      const datos = {
        zona_comun_id:  zonaId,
        proyecto_id:    proyecto?.id,
        torre_id:       torre?.id,
        ambiente_zc_id: ambienteZCId,
        piso:           parseInt(pisoSel),
        partida_id:     partidaId,
        observacion:    observacion.trim(),
        causa:          causaFinal || null,
        creado_por:     userId,
        estado:         'pendiente',
      };

      if (online) {
        try {
          let foto_url = null;
          if (foto && userId) foto_url = await subirFoto(foto, userId);
          const { error } = await supabase.from('registros_zonas_comunes').insert({ ...datos, foto_url });
          if (error) throw new Error(error.message);
        } catch {
          await agregarPendienteZC(datos, foto ?? undefined);
        }
      } else {
        await agregarPendienteZC(datos, foto ?? undefined);
      }

      setObservacion(''); setCausaSel(''); setTerceroSel('');
      setFoto(null); setFotoPreview(null);
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);

      if (online && zonaId) await cargarRegistros(zonaId);
      else mostrarPendientesLocales();

    } catch (e: any) { setError('Error: ' + e.message); }
    setGuardando(false);
  };

  // ─── Salir limpiando sessionStorage ──────────────────────────────────────
  const salirAProyecto = () => {
    sessionStorage.removeItem(SESSION_KEY);
    history.push(`/proyectos/${proyecto?.id}`, { proyecto });
  };

  const abrirPlano = async (plano: any) => {
    try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url: plano.url }); } catch { window.open(plano.url, '_blank'); }
  };

  const totalOk    = Object.values(checkEstados).filter(Boolean).length;
  const totalItems = checkItems.length;

  const labelStyle  = { fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };
  const selectStyle = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };
  const taStyle     = { width: '100%', height: 80, borderRadius: 10, padding: '10px 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, resize: 'none' as any, marginBottom: 12 };

  const estadoColor: Record<string, string> = {
    pendiente:   dark ? '#f87171' : '#dc2626',
    solucionado: dark ? '#60a5fa' : '#2563eb',
    aprobado:    dark ? '#4ade80' : '#16a34a',
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }}
            onClick={salirAProyecto}>
            ← Volver
          </IonButton>
          <IonTitle style={{ fontSize: 14, fontWeight: 600 }}>Zona Común · Torre {torre?.nombre}</IonTitle>
          <div slot="end" style={{ paddingRight: 14 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#4ade80' : '#fbbf24' }} />
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          {/* Banner torre */}
          <div style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1E2E4A)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 16, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: dark ? 'linear-gradient(135deg, #1E2E4A, #26395C)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: dark ? '#6E86A6' : '#fff', flexShrink: 0 }}>
              {torre?.nombre}
            </div>
            <div>
              <div style={{ fontSize: 9, color: dark ? '#60a5fa' : '#2563eb', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 3 }}>{proyecto?.nombre}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>Zona Común Torre {torre?.nombre}</div>
              {torre?.frente && <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{torre.frente}</div>}
              <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{totalPisos} pisos</div>
            </div>
          </div>

          {/* Banners offline */}
          {!online && (
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#fbbf24' }}>Sin conexión — guardando localmente{pendientesZC > 0 ? ` · ${pendientesZC} en cola` : ''}</span>
            </div>
          )}
          {online && pendientesZC > 0 && (
            <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 12, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d' }}>Sincronizando {pendientesZC} observación{pendientesZC !== 1 ? 'es' : ''}...</span>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {([
              { key: 'checklist', label: '☑️ Sala Basura' },
              { key: 'obs',       label: '📋 Observaciones' },
              { key: 'planos',    label: '📄 Planos' },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: tab === t.key ? (dark ? '#1E2E4A' : '#1e3a5f') : 'transparent', color: tab === t.key ? '#fff' : textMuted, border: `0.5px solid ${tab === t.key ? (dark ? '#2E4468' : '#1e3a5f') : border}` }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── TAB CHECKLIST ── */}
          {tab === 'checklist' && (
            <>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Checklist Sala de Basura</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
              <div style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 16, border: `0.5px solid ${border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{totalOk} / {totalItems} ítems OK</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: totalOk === totalItems ? (dark ? '#4ade80' : '#15803d') : textMuted }}>{totalItems > 0 ? Math.round((totalOk / totalItems) * 100) : 0}%</span>
                </div>
                <div style={{ height: 4, background: dark ? '#16233B' : '#f1f5f9', borderRadius: 2, marginBottom: 14 }}>
                  <div style={{ height: 4, borderRadius: 2, background: totalOk === totalItems ? (dark ? '#4ade80' : '#22c55e') : (dark ? 'linear-gradient(90deg, #333, #6E86A6)' : 'linear-gradient(90deg, #bfdbfe, #2563eb)'), width: `${totalItems > 0 ? (totalOk / totalItems) * 100 : 0}%`, transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => marcarTodos(true)} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', color: dark ? '#4ade80' : '#15803d', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓ Marcar todos OK</button>
                  <button onClick={() => marcarTodos(false)} style={{ flex: 1, height: 34, borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textMuted, fontSize: 12, cursor: 'pointer' }}>✗ Desmarcar todos</button>
                </div>
              </div>

              <div style={{ fontSize: 9, color: dark ? '#60a5fa' : '#2563eb', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 10 }}>Sección A — Equipamiento instalador sistema basura</div>
              {checkItems.filter(i => i.seccion === 'A').map(item => (
                <div key={item.numero} style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: `0.5px solid ${checkEstados[item.numero] ? (dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0') : border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => toggleCheck(item.numero)} style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: checkEstados[item.numero] ? (dark ? 'rgba(74,222,128,0.15)' : '#f0fdf4') : (dark ? '#16233B' : '#f8fafc'), border: `1.5px solid ${checkEstados[item.numero] ? (dark ? '#4ade80' : '#22c55e') : inputBorder}`, color: checkEstados[item.numero] ? (dark ? '#4ade80' : '#15803d') : textMuted, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {checkEstados[item.numero] ? '✓' : ''}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: dark ? '#60a5fa' : '#2563eb', fontWeight: 700 }}>({item.numero})</span>
                        <span style={{ fontSize: 13, color: textPrimary, fontWeight: checkEstados[item.numero] ? 400 : 500 }}>{item.descripcion}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ fontSize: 9, color: dark ? '#a78bfa' : '#7c3aed', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, margin: '16px 0 10px' }}>Sección B — Equipamiento emp. const. o inmobiliaria</div>
              {checkItems.filter(i => i.seccion === 'B').map(item => (
                <div key={item.numero} style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 8, border: `0.5px solid ${checkEstados[item.numero] ? (dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0') : border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => toggleCheck(item.numero)} style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: checkEstados[item.numero] ? (dark ? 'rgba(74,222,128,0.15)' : '#f0fdf4') : (dark ? '#16233B' : '#f8fafc'), border: `1.5px solid ${checkEstados[item.numero] ? (dark ? '#4ade80' : '#22c55e') : inputBorder}`, color: checkEstados[item.numero] ? (dark ? '#4ade80' : '#15803d') : textMuted, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {checkEstados[item.numero] ? '✓' : ''}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: dark ? '#a78bfa' : '#7c3aed', fontWeight: 700 }}>({item.numero})</span>
                        <span style={{ fontSize: 13, color: textPrimary }}>{item.descripcion}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {checkOk && (
                <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e' }} />
                  <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d' }}>✓ Checklist guardado correctamente</span>
                </div>
              )}

              <button onClick={guardarChecklist} disabled={guardandoCheck || !online} style={{ width: '100%', height: 48, borderRadius: 12, background: (guardandoCheck || !online) ? (dark ? '#16233B' : '#f1f5f9') : 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: (guardandoCheck || !online) ? textMuted : '#fff', fontSize: 14, fontWeight: 700, cursor: (guardandoCheck || !online) ? 'not-allowed' : 'pointer', marginTop: 8 }}>
                {!online ? 'Sin conexión — checklist no disponible offline' : guardandoCheck ? 'Guardando...' : '💾 Guardar checklist'}
              </button>
            </>
          )}

          {/* ── TAB OBSERVACIONES ── */}
          {tab === 'obs' && (
            <>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Nueva observación</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

              {guardadoOk && (
                <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 12, padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e' }} />
                  <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d' }}>{online ? '✓ Observación registrada correctamente' : '✓ Guardado localmente'}</span>
                </div>
              )}

              <div style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#fff', borderRadius: 16, padding: 16, border: `0.5px solid ${border}`, marginBottom: 20 }}>
                <label style={labelStyle}>piso *</label>
                <select value={pisoSel} onChange={e => { setPisoSel(e.target.value); setAmbienteZCId(''); }} style={selectStyle}>
                  <option value="">Seleccionar piso...</option>
                  {pisosOpciones.map(n => <option key={n} value={String(n)}>Piso {n}</option>)}
                </select>

                <label style={{ ...labelStyle, opacity: !pisoSel ? 0.4 : 1 }}>ambiente *</label>
                <select value={ambienteZCId} onChange={e => setAmbienteZCId(e.target.value)} style={{ ...selectStyle, opacity: !pisoSel ? 0.3 : 1 }} disabled={!pisoSel}>
                  <option value="">Seleccionar ambiente...</option>
                  {ambientesFiltrados.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>

                <label style={labelStyle}>partida afectada *</label>
                <select value={partidaId} onChange={e => setPartidaId(e.target.value)} style={selectStyle}>
                  <option value="">Seleccionar partida...</option>
                  {partidas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>

                <label style={labelStyle}>observación *</label>
                <textarea value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Describe la falla..." style={taStyle} />

                <label style={labelStyle}>causa</label>
                <select value={causaSel} onChange={e => { setCausaSel(e.target.value); setTerceroSel(''); }} style={selectStyle}>
                  <option value="">Seleccionar causa...</option>
                  <optgroup label="Causas Estándar">{causasEstandar.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
                  <optgroup label="Otras Cuadrillas">{causasTerceros.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
                </select>

                {esCausaTercero && (
                  <>
                    <label style={{ ...labelStyle, color: '#f97316' }}>cuadrilla responsable *</label>
                    <select value={terceroSel} onChange={e => setTerceroSel(e.target.value)} style={{ ...selectStyle, border: '0.5px solid rgba(249,115,22,0.4)' }}>
                      <option value="">Seleccionar cuadrilla...</option>
                      {nombresTerceros.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </>
                )}

                <label style={labelStyle}>foto</label>
                {fotoPreview ? (
                  <div style={{ position: 'relative', marginBottom: 16 }}>
                    <img src={fotoPreview} style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'cover' }} />
                    <button onClick={() => { setFoto(null); setFotoPreview(null); }} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 80, borderRadius: 12, border: `0.5px dashed ${border}`, marginBottom: 16, cursor: 'pointer', color: textMuted, gap: 6, background: dark ? 'transparent' : '#f8fafc' }}>
                    <span style={{ fontSize: 22 }}>📷</span>
                    <span style={{ fontSize: 12 }}>Tomar o adjuntar foto</span>
                    <input type="file" accept="image/*" capture="environment" onChange={async e => {
                      const f = e.target.files?.[0]; if (!f) return;
                      setFoto(f);
                      setFotoPreview(URL.createObjectURL(f));
                      try {
                        const blob = await comprimirImagen(f);
                        setFoto(blob as any);
                      } catch {}
                    }} style={{ display: 'none' }} />
                  </label>
                )}

                {error && (
                  <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px', borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca' }}>{error}</div>
                )}

                <button onClick={guardarObs} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: guardando ? (dark ? '#16233B' : '#f1f5f9') : 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: guardando ? textMuted : '#fff', fontSize: 14, fontWeight: 700, cursor: guardando ? 'not-allowed' : 'pointer' }}>
                  {guardando ? 'Guardando...' : '✓ Registrar observación'}
                </button>
              </div>

              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>
                Observaciones registradas ({registros.length})
              </div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />

              {loadingRegs ? (
                <div style={{ textAlign: 'center', marginTop: 20 }}><IonSpinner name="crescent" /></div>
              ) : registros.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: 40, color: textMuted, fontSize: 13 }}>Sin observaciones registradas</div>
              ) : registros.map(r => (
                <div key={r.id} style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#fff', borderRadius: 16, padding: 14, marginBottom: 10, border: `0.5px solid ${r._local ? (dark ? 'rgba(251,191,36,0.3)' : '#fde68a') : border}` }}>
                  {r._local && (
                    <div style={{ fontSize: 10, color: dark ? '#fbbf24' : '#a16207', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#fbbf24' }} />
                      Pendiente de sincronizar
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: dark ? 'rgba(96,165,250,0.1)' : '#eff6ff', color: dark ? '#60a5fa' : '#2563eb', fontWeight: 600, border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe' }}>
                          Piso {r.piso}
                        </span>
                        <span style={{ fontSize: 11, color: textSecondary }}>{r.ambientes_zc?.nombre} · {r.partidas?.nombre}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>{r.observacion}</div>
                      {r.causa && <div style={{ fontSize: 11, color: textSecondary }}>Causa: {r.causa}</div>}
                    </div>
                    {r.foto_url && (
                      <div onClick={() => !r._local && setFotoModal(r.foto_url)} style={{ cursor: r._local ? 'default' : 'pointer', flexShrink: 0 }}>
                        <img src={r.foto_url} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, border: `0.5px solid ${border}` }} />
                      </div>
                    )}
                    <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, flexShrink: 0, background: (estadoColor[r.estado] ?? '#888') + (dark ? '15' : '12'), color: estadoColor[r.estado] ?? textMuted, border: `0.5px solid ${(estadoColor[r.estado] ?? '#888')}40` }}>
                      {r.estado}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── TAB PLANOS ── */}
          {tab === 'planos' && (
            <>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Planos disponibles</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
              {!online ? (
                <div style={{ textAlign: 'center', marginTop: 60, color: textMuted, fontSize: 13 }}>Planos no disponibles sin conexión</div>
              ) : planos.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: 60 }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                  <div style={{ fontSize: 14, color: textSecondary, fontWeight: 600 }}>Sin planos disponibles</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>El administrador puede subir planos desde el panel de administración</div>
                </div>
              ) : planos.map(p => (
                <div key={p.id} onClick={() => abrirPlano(p)} style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 10, border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: dark ? 'rgba(96,165,250,0.08)' : '#eff6ff', border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📄</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>Toca para abrir</div>
                  </div>
                  <div style={{ fontSize: 18, color: dark ? '#2E4468' : '#bfdbfe' }}>›</div>
                </div>
              ))}
            </>
          )}

          <div style={{ height: 40 }} />
        </div>

        <IonModal isOpen={!!fotoModal} onDidDismiss={() => setFotoModal('')}>
          <div style={{ background: '#0B1220', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <button onClick={() => setFotoModal('')} style={{ position: 'absolute', top: 48, right: 16, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 20, cursor: 'pointer' }}>×</button>
            <img src={fotoModal} style={{ width: '100%', maxHeight: '90vh', objectFit: 'contain' }} />
          </div>
        </IonModal>

      </IonContent>
    </IonPage>
  );
};

export default ZonasComunes;
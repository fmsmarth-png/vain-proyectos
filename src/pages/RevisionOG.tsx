// src/pages/RevisionOG.tsx
// Módulo Revisión Tolerancias OG — Selector con pantallas internas tipo VisitaObra
// FMS · Junio 2026
// Offline: descarga cache OG al entrar, muestra pendientes, mezcla obs locales
// Offline (jul 2026): el SELECTOR (proyecto → torre → depto) también funciona sin
//   red leyendo el snapshot de datos guardado por "Preparar modo offline" (ogDataDB)
//
// FIX (jul 2026 · navegación OG): la selección (proyecto/torre/depto) ya NO viaja
//   por location.state en history.push. En Ionic React el state NO sobrevive a un
//   remount de la vista ni a que el outlet se recree → al volver atrás la sub-página
//   quedaba sin datos y crasheaba (pantalla blanca) o redirigía (dashboard).
//   Ahora se persiste en sessionStorage bajo 'og_seleccion' y las sub-páginas la
//   re-hidratan desde ahí. Mismo patrón que ya usábamos con 'og_depto_activo'.

import React, { useRef, useState, useMemo } from 'react';
import {
  IonContent, IonHeader, IonMenuButton, IonPage,
  IonTitle, IonToolbar, IonSpinner, IonSelect, IonSelectOption,
} from '@ionic/react';
import { useIonViewDidEnter, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';
import { descargarCacheOG, hayCacheOG, fechaCacheOG, getDeptosTorreCache, cacheDeptosTorre } from '../utils/Ogcache';
import { getPendientesOG, contarPendientesOG, flushColaOG } from '../utils/Ogofflinequeue';
import { getProyectosDB, getTorresDB, getDeptosDB } from '../utils/ogDataDB';
import { useOffline } from '../Context/OfflineContext';
import PrepararOfflineOG from '../components/PrepararOfflineOG';

type Pantalla = 'inicio' | 'torres' | 'depto';

const RevisionOG: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const history = useHistory();
  const mounted = useRef(false);
  const { online } = useOffline();

  // ── tokens ────────────────────────────────────────────────────────────────
  const bg            = dark ? '#0B1220' : '#f0f4f8';
  const card          = dark ? '#16233B'  : '#ffffff';
  const cardGrad      = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const border        = dark ? '#243550'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary = dark ? '#6b7280'  : '#64748b';
  const textMuted     = dark ? '#5D728F'  : '#94a3b8';
  const toolbar       = dark ? '#0E1728'  : '#1e3a5f';
  const inputBg       = dark ? '#1B2C48'  : '#ffffff';
  const inputBorder   = dark ? '#243550'  : '#cbd5e1';
  const sepLine       = dark
    ? 'linear-gradient(90deg, transparent, #243550, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';
  const rojo      = dark ? '#f87171' : '#b91c1c';
  const rojoBg    = dark ? 'rgba(239,68,68,0.06)' : '#fef2f2';
  const rojoBord  = dark ? 'rgba(239,68,68,0.15)' : '#fecaca';
  const azul      = dark ? '#60a5fa' : '#1d4ed8';
  const azulBg    = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const azulBord  = dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe';
  const amarillo  = dark ? '#fbbf24' : '#a16207';
  const amarilloBg   = dark ? 'rgba(251,191,36,0.06)' : '#fffbeb';
  const amarilloBord = dark ? 'rgba(251,191,36,0.2)'  : '#fde68a';

  const labelStyle: React.CSSProperties = {
    fontSize: 9, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: 600,
  };

  // ── state ─────────────────────────────────────────────────────────────────
  const [pantalla, setPantalla]   = useState<Pantalla>('inicio');
  const [usuario, setUsuario]     = useState<any>(null);
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [torres, setTorres]       = useState<any[]>([]);
  const [deptos, setDeptos]       = useState<any[]>([]);
  const [proyectoSel, setProyectoSel] = useState<any>(null);
  const [torreSel, setTorreSel]       = useState<any>(null);
  const [deptoSel, setDeptoSel]       = useState<any>(null);
  const [obsDepto, setObsDepto]   = useState<any[]>([]);
  const [cerrado, setCerrado]     = useState(false);
  const [resumenDisponible, setResumenDisponible] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [cargando, setCargando]   = useState(false);
  const [cerrando, setCerrando]   = useState(false);
  const [cargandoDepto, setCargandoDepto] = useState(false);

  // ── state offline OG ──────────────────────────────────────────────────────
  const [cacheOk, setCacheOk]                     = useState(hayCacheOG());
  const [pendientesOGCount, setPendientesOGCount] = useState(contarPendientesOG());
  const [sincronizandoOG, setSincronizandoOG]     = useState(false);
  const [msgSyncOG, setMsgSyncOG]                 = useState('');

  // ── init ──────────────────────────────────────────────────────────────────
  useIonViewDidEnter(() => {
    if (!mounted.current) {
      mounted.current = true;
      cargar();
    }
  });

  useIonViewWillEnter(() => {
    // ── Restaurar selección al volver de detalle/resumen/ambiente ──
    // Si hay og_seleccion con proyecto+torre+depto y estamos en 'inicio',
    // rehidratar el state para caer directo en pantalla 'depto'.
    if (pantalla === 'inicio') {
      try {
        const sel = JSON.parse(sessionStorage.getItem('og_seleccion') || 'null');
        if (sel?.proyecto && sel?.torre) {
          setProyectoSel(sel.proyecto);
          setTorreSel(sel.torre);
          // Cargar torres y deptos para que la vista torres funcione
          if (online) {
            supabase.from('torres').select('id, nombre, frente, pisos').eq('proyecto_id', sel.proyecto.id).order('nombre').then(({ data }) => setTorres(data || []));
            supabase.from('departamentos').select('id, numero, id_obra, piso, frente_depto, plano_version_id').eq('torre_id', sel.torre.id).order('id_obra').then(({ data }) => setDeptos(data || []));
          } else {
            getTorresDB(sel.proyecto.id).then(t => setTorres(t));
            getDeptosDB(sel.torre.id).then(d => setDeptos(d));
          }
          setPantalla('torres');
          setPendientesOGCount(contarPendientesOG());
          return;
        }
      } catch {}
    }

    const id = deptoSel?.id || sessionStorage.getItem('og_depto_activo');
    if (id) {
      cargarObsDepto(id);
      cargarEstadoDepto(id);
    }
    // Refrescar conteo al volver de RevisionOGDetalle
    setPendientesOGCount(contarPendientesOG());
  });

  const cargar = async () => {
    setCargando(true);
    try {
      // ── OFFLINE: leer proyectos desde el snapshot guardado (ogDataDB) ──
      // Sin esto, el selector quedaba vacío sin conexión (antes ni siquiera
      // llegaba a cargar por usar getUser(), que requiere red).
      if (!online) {
        const cachedProyectos = await getProyectosDB();
        setProyectos(cachedProyectos);
        setCacheOk(hayCacheOG());
        setPendientesOGCount(contarPendientesOG());
        return;
      }

      // ── ONLINE ──
      // getSession (no getUser): no requiere red y no rompe en modo offline
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (!email) return;

      const { data: u } = await supabase
        .from('usuarios')
        .select('id, nombre, rol')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      setUsuario(u);

      // Solo proyectos ASIGNADOS al usuario (usuario_proyectos), para todos los roles
      const { data: up } = await supabase
        .from('usuario_proyectos')
        .select('proyecto_id')
        .eq('usuario_id', u?.id);
      const ids = (up || []).map((x: any) => x.proyecto_id);

      if (ids.length === 0) {
        setProyectos([]);
      } else {
        const { data: p } = await supabase
          .from('proyectos')
          .select('id, nombre, codigo')
          .eq('estado', 'activo')
          .in('id', ids)
          .order('nombre');
        setProyectos(p || []);
      }

      // Cache de datos de referencia OG (catálogo/hotspots) — no-op si tiene < 24h
      const ok = await descargarCacheOG();
      setCacheOk(ok || hayCacheOG());
      if (contarPendientesOG() > 0) {
        await sincronizarPendientesOG(false);
      }
      setPendientesOGCount(contarPendientesOG());
    } finally {
      setCargando(false);
    }
  };

  // ── Sincronización cola OG ────────────────────────────────────────────────
  const sincronizarPendientesOG = async (manual = true) => {
    if (sincronizandoOG) return;
    setSincronizandoOG(true);
    setMsgSyncOG('');
    try {
      const { ok, fallidos } = await flushColaOG();
      setPendientesOGCount(contarPendientesOG());
      const id = deptoSel?.id || sessionStorage.getItem('og_depto_activo');
      if (id) await cargarObsDepto(id);
      if (manual) {
        setMsgSyncOG(fallidos > 0
          ? `⚠️ ${ok} enviados, ${fallidos} con error`
          : `✅ ${ok} observacion${ok !== 1 ? 'es' : ''} sincronizada${ok !== 1 ? 's' : ''}`);
        setTimeout(() => setMsgSyncOG(''), 4000);
      }
    } finally {
      setSincronizandoOG(false);
    }
  };

  const seleccionarProyecto = async (p: any) => {
    setProyectoSel(p);
    setTorreSel(null);
    setDeptos([]);
    setDeptoSel(null);
    setObsDepto([]);
    setCerrado(false);

    if (online) {
      const { data } = await supabase
        .from('torres')
        .select('id, nombre, frente, pisos')
        .eq('proyecto_id', p.id)
        .order('nombre');
      setTorres(data || []);
    } else {
      // Offline: torres desde el snapshot (ogDataDB)
      setTorres(await getTorresDB(p.id));
    }
    setPantalla('torres');
  };

  const seleccionarTorre = async (torre: any) => {
    setTorreSel(torre);
    setDeptoSel(null);
    setObsDepto([]);
    setCerrado(false);

    if (online) {
      // Online: buscar en Supabase y actualizar cache lazy
      const { data } = await supabase
        .from('departamentos')
        .select('id, numero, id_obra, piso, frente_depto, plano_version_id')
        .eq('torre_id', torre.id)
        .order('id_obra');
      const deptosList = data || [];
      setDeptos(deptosList);
      cacheDeptosTorre(torre.id, deptosList); // guardar para uso offline (Ogcache)
    } else {
      // Offline: preferir el snapshot completo (ogDataDB); fallback a cache lazy
      let cached: any[] = await getDeptosDB(torre.id);
      if (!cached || cached.length === 0) cached = getDeptosTorreCache(torre.id);
      setDeptos(cached);
    }
  };

  const seleccionarDepto = async (depto: any) => {
    if (!proyectoSel || !torreSel) return;
    sessionStorage.setItem('og_depto_activo', depto.id);
    sessionStorage.setItem('og_seleccion', JSON.stringify({
      proyecto: proyectoSel,
      torre:    torreSel,
      depto:    depto,
      cerrado:  false,
    }));
    history.push('/revision-og/detalle');
  };

  const cargarObsDepto = async (deptoId: string) => {
    // Obs remotas (solo si hay red)
    let remotas: any[] = [];
    if (online) {
      const { data } = await supabase
        .from('og_registros')
        .select('id, ambiente, tipo_elemento, tipo_revision, elemento, tolerancia, creado_en, foto_url, usuarios(nombre)')
        .eq('departamento_id', deptoId)
        .order('creado_en', { ascending: false });
      remotas = data || [];
    }

    // Mezclar pendientes locales del mismo depto
    const pendientesLocales = getPendientesOG()
      .filter(p => p.departamento_id === deptoId)
      .map(p => ({
        id:            p._id_local,
        ambiente:      p.ambiente,
        tipo_elemento: p.tipo_elemento,
        tipo_revision: p.tipo_revision,
        elemento:      p.elemento,
        tolerancia:    p.tolerancia,
        creado_en:     p._creado_local,
        foto_url:      null,
        usuarios:      null,
        _offline:      true,
      }));

    const todas = [...pendientesLocales, ...remotas];
    setObsDepto(todas);
    setResumenDisponible(todas.length > 0);
  };

  const cargarEstadoDepto = async (deptoId: string) => {
    if (!online) return;
    const { data } = await supabase
      .from('og_inspecciones_depto')
      .select('estado')
      .eq('departamento_id', deptoId)
      .maybeSingle();
    setCerrado(data?.estado === 'cerrado');
  };

  const cerrarDepto = async () => {
    if (!deptoSel || !proyectoSel || !torreSel || !usuario) return;
    const ok = window.confirm(`¿Cerrar el depto ${deptoSel.numero}? No se podrán agregar más observaciones.`);
    if (!ok) return;
    setCerrando(true);
    try {
      await supabase.from('og_inspecciones_depto').upsert({
        proyecto_id:     proyectoSel.id,
        torre_id:        torreSel.id,
        departamento_id: deptoSel.id,
        estado:          'cerrado',
        cerrado_por:     usuario.id,
        fecha_cierre:    new Date().toISOString(),
      }, { onConflict: 'proyecto_id,torre_id,departamento_id' });
      setCerrado(true);
    } finally {
      setCerrando(false);
    }
  };

  const reabrirDepto = async () => {
    if (!deptoSel || !proyectoSel || !torreSel) return;
    setCerrando(true);
    try {
      await supabase.from('og_inspecciones_depto').upsert({
        proyecto_id:     proyectoSel.id,
        torre_id:        torreSel.id,
        departamento_id: deptoSel.id,
        estado:          'abierto',
        cerrado_por:     null,
        fecha_cierre:    null,
      }, { onConflict: 'proyecto_id,torre_id,departamento_id' });
      setCerrado(false);
    } finally {
      setCerrando(false);
    }
  };

  // ── computed ───────────────────────────────────────────────────────────────
  const obsAgrupadas = useMemo(() => {
    const mapa: Record<string, any[]> = {};
    for (const o of obsDepto) {
      const a = o.ambiente || 'Sin ambiente';
      if (!mapa[a]) mapa[a] = [];
      mapa[a].push(o);
    }
    return Object.entries(mapa).map(([ambiente, obs]) => ({ ambiente, obs }));
  }, [obsDepto]);

  const toggleExpandir = (a: string) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(a) ? next.delete(a) : next.add(a);
      return next;
    });
  };

  const torresPorFrente = useMemo(() => {
    const grupos: Record<string, any[]> = {};
    for (const t of torres) {
      const f = t.frente ?? 'Sin frente';
      if (!grupos[f]) grupos[f] = [];
      grupos[f].push(t);
    }
    return Object.entries(grupos)
      .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
      .map(([frente, lista]) => ({ frente, torres: lista }));
  }, [torres]);

  const deptosPorPiso = useMemo(() => {
    const porPiso: Record<number, any[]> = {};
    [...deptos]
      .sort((a, b) => (a.id_obra ?? '').localeCompare(b.id_obra ?? '', 'es', { numeric: true }))
      .forEach(d => {
        const piso = d.piso ?? 0;
        if (!porPiso[piso]) porPiso[piso] = [];
        porPiso[piso].push(d);
      });
    return porPiso;
  }, [deptos]);

  // ── navegación a sub-páginas ───────────────────────────────────────────────
  // FIX: la selección se persiste en sessionStorage ('og_seleccion') en vez de
  //   viajar por location.state. Así sobrevive a remounts / back del router y las
  //   sub-páginas la re-hidratan sin quedar en blanco ni ser botadas al dashboard.
  const irADetalle = () => {
    if (!proyectoSel || !torreSel || !deptoSel) return;
    sessionStorage.setItem('og_seleccion', JSON.stringify({
      proyecto: proyectoSel,
      torre:    torreSel,
      depto:    deptoSel,
      cerrado,
    }));
    history.push('/revision-og/detalle');
  };

  const irAResumen = () => {
    if (!proyectoSel || !torreSel || !deptoSel) return;
    sessionStorage.setItem('og_seleccion', JSON.stringify({
      proyecto: proyectoSel,
      torre:    torreSel,
      depto:    deptoSel,
    }));
    history.push('/revision-og/resumen');
  };

  const esAdmin = usuario?.rol === 'administrador';

  // ── Banner offline/cache reutilizable ─────────────────────────────────────
  const BannerOfflineOG = () => (
    <>
      {!online && (
        <div style={{
          background: amarilloBg, border: `0.5px solid ${amarilloBord}`,
          borderRadius: 12, padding: '10px 14px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: amarillo }}>📶 Sin conexión</div>
          {cacheOk
            ? <div style={{ fontSize: 12, color: textSecondary, marginTop: 3 }}>
                Cache disponible — podés registrar observaciones.
                {fechaCacheOG() && (
                  <span style={{ display: 'block', fontSize: 11, marginTop: 2, color: textMuted }}>
                    Actualizado: {fechaCacheOG()!.toLocaleString('es-CL')}
                  </span>
                )}
              </div>
            : <div style={{ fontSize: 12, color: rojo, marginTop: 3 }}>
                Sin cache local — conectate para descargar los datos de referencia.
              </div>
          }
        </div>
      )}

      {pendientesOGCount > 0 && (
        <div style={{
          background: azulBg, border: `0.5px solid ${azulBord}`,
          borderRadius: 12, padding: '8px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: azul }}>
              🕐 {pendientesOGCount} obs pendiente{pendientesOGCount !== 1 ? 's' : ''} de sincronizar
            </span>
            {msgSyncOG && (
              <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>{msgSyncOG}</div>
            )}
          </div>
          {online && (
            <button
              onClick={() => sincronizarPendientesOG(true)}
              disabled={sincronizandoOG}
              style={{
                padding: '5px 12px', borderRadius: 8, border: `0.5px solid ${azulBord}`,
                background: azulBg, color: azul, fontSize: 12, fontWeight: 600,
                cursor: sincronizandoOG ? 'not-allowed' : 'pointer', opacity: sincronizandoOG ? 0.6 : 1,
              }}
            >
              {sincronizandoOG ? '...' : 'Sincronizar'}
            </button>
          )}
        </div>
      )}
    </>
  );

  // ── PANTALLA: INICIO ──────────────────────────────────────────────────────
  if (pantalla === 'inicio') return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral"
            style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>📐 Revisión OG</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: '16px 16px 100px' }}>

          <BannerOfflineOG />

          {cargando ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
              <IonSpinner name="crescent" style={{ color: '#1e3a5f' }} />
            </div>
          ) : (
            <>
              <div style={{ ...labelStyle, marginBottom: 10 }}>Proyectos asignados</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 12 }} />

              {proyectos.map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => seleccionarProyecto(p)}
                  style={{
                    background: cardGrad,
                    borderRadius: 14,
                    border: `0.5px solid ${border}`,
                    padding: '14px 16px',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: dark ? 'linear-gradient(135deg, #1E2E4A, #26395C)' : 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                    border: dark ? '0.5px solid #2E4468' : '0.5px solid #bfdbfe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    color: dark ? '#6E86A6' : '#1e3a5f', flexShrink: 0,
                  }}>
                    {p.codigo ? p.codigo.toUpperCase() : p.nombre.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>{p.nombre}</div>
                    {p.codigo && (
                      <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{p.codigo}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 20, color: dark ? '#2E4468' : '#bfdbfe' }}>›</div>
                </div>
              ))}

              {/* Descarga de imágenes + datos (proyectos/torres/deptos) a IndexedDB */}
              <PrepararOfflineOG proyectos={proyectos} />

              {proyectos.length === 0 && !cargando && (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: textMuted, fontSize: 13 }}>
                  {online ? 'Sin proyectos asignados' : 'Sin datos offline — conéctate y presiona "Preparar modo offline"'}
                </div>
              )}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );

  // ── PANTALLA: TORRES ──────────────────────────────────────────────────────
  if (pantalla === 'torres') return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <button slot="start" onClick={() => { setPantalla('inicio'); setTorres([]); }}
            style={{ background: 'transparent', border: 'none', color: dark ? '#6E86A6' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>
            ‹
          </button>
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Torres · {proyectoSel?.nombre}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: '16px 16px 100px' }}>

          <BannerOfflineOG />

          <div style={{ ...labelStyle, marginBottom: 10 }}>Torres por frente</div>

          {torresPorFrente.map(({ frente, torres: torresGrupo }) => (
            <div key={frente} style={{ marginBottom: 14 }}>
              {/* Header del grupo frente */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  background: dark ? 'rgba(30,58,95,0.4)' : 'rgba(30,58,95,0.08)',
                  border: `0.5px solid ${dark ? 'rgba(30,58,95,0.6)' : 'rgba(30,58,95,0.2)'}`,
                  borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700,
                  color: dark ? '#4a7ab5' : '#1e3a5f',
                }}>
                  {frente}
                </span>
                <div style={{ flex: 1, height: '0.5px', background: dark ? '#243550' : '#e2e8f0' }} />
                <span style={{ fontSize: 11, color: textMuted }}>{torresGrupo.length} torre{torresGrupo.length !== 1 ? 's' : ''}</span>
              </div>

              {torresGrupo.map(torre => {
                const activa = torreSel?.id === torre.id;
                return (
                  <div key={torre.id}>
                    <div
                      onClick={() => seleccionarTorre(torre)}
                      style={{
                        background: activa
                          ? (dark ? 'linear-gradient(135deg, #0a1628, #0e1f3d)' : 'linear-gradient(135deg, #eff6ff, #dbeafe)')
                          : cardGrad,
                        borderRadius: 14,
                        border: `0.5px solid ${activa ? (dark ? 'rgba(30,58,95,0.6)' : '#bfdbfe') : border}`,
                        padding: '14px 16px', marginBottom: activa ? 0 : 8,
                        display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                        borderBottomLeftRadius: activa && deptos.length > 0 ? 0 : 14,
                        borderBottomRightRadius: activa && deptos.length > 0 ? 0 : 14,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>Torre {torre.nombre}</div>
                      </div>
                      <div style={{ fontSize: 20, color: dark ? '#2E4468' : '#bfdbfe' }}>
                        {activa ? '▾' : '›'}
                      </div>
                    </div>

                {activa && deptos.length > 0 && (
                  <div style={{
                    background: dark ? '#080808' : '#f8fafc',
                    border: `0.5px solid ${border}`, borderTop: 'none',
                    borderRadius: '0 0 14px 14px', padding: 12, marginBottom: 8,
                  }}>
                    {Object.keys(deptosPorPiso)
                      .sort((a, b) => parseInt(a) - parseInt(b))
                      .map(pisoKey => {
                        const piso = parseInt(pisoKey);
                        const deptosDelPiso = deptosPorPiso[piso];
                        const porFrente: Record<string, any[]> = {};
                        deptosDelPiso.forEach((d: any) => {
                          const f = d.frente_depto ?? 'sin_frente';
                          if (!porFrente[f]) porFrente[f] = [];
                          porFrente[f].push(d);
                        });
                        return (
                          <div key={piso} style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: dark ? '#4a7ab5' : '#1e3a5f' }}>
                                Piso {piso === 0 ? '—' : piso}
                              </div>
                              <div style={{ flex: 1, height: '0.5px', background: dark ? '#243550' : '#e2e8f0' }} />
                            </div>
                            {(() => {
                              const frentesOrdenados = Object.keys(porFrente)
                                .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
                              const cols = frentesOrdenados.length;
                              const maxPorFrente = Math.max(...frentesOrdenados.map(f => porFrente[f].length));
                              // Construir filas: cada frente invertido para que el nº mayor quede arriba
                              const filas: (any | null)[][] = [];
                              for (let row = 0; row < maxPorFrente; row++) {
                                filas.push(frentesOrdenados.map(f => {
                                  const lista = [...porFrente[f]].reverse();
                                  return lista[row] ?? null;
                                }));
                              }
                              return (
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: `repeat(${cols}, auto)`,
                                  gap: 6,
                                  justifyContent: 'start',
                                }}>
                                  {filas.flatMap((fila, ri) =>
                                    fila.map((depto, ci) => {
                                      if (!depto) return <div key={`e-${ri}-${ci}`} />;
                                      const tienePendientes = getPendientesOG().some(p => p.departamento_id === depto.id);
                                      return (
                                        <div
                                          key={depto.id}
                                          onClick={e => { e.stopPropagation(); seleccionarDepto(depto); }}
                                          style={{
                                            background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#ffffff',
                                            border: `0.5px solid ${tienePendientes ? amarilloBord : border}`,
                                            borderRadius: 12, padding: '10px 12px',
                                            cursor: 'pointer', minWidth: 60, position: 'relative',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                          }}
                                        >
                                          <span style={{ fontSize: 13, fontWeight: 700, color: dark ? '#4a7ab5' : '#1e3a5f', lineHeight: 1 }}>
                                            {depto.id_obra ?? '—'}
                                          </span>
                                          <div style={{ width: '100%', height: '0.5px', background: dark ? '#26395C' : '#e2e8f0' }} />
                                          <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary, lineHeight: 1 }}>
                                            {depto.numero ?? '—'}
                                          </span>
                                          {tienePendientes && (
                                            <div style={{
                                              position: 'absolute', top: 4, right: 4,
                                              width: 7, height: 7, borderRadius: '50%',
                                              background: amarillo,
                                            }} />
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
                );
              })}
            </div>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );

  // ── PANTALLA: DEPTO ───────────────────────────────────────────────────────
  if (pantalla === 'depto') return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <button slot="start" onClick={() => setPantalla('torres')}
            style={{ background: 'transparent', border: 'none', color: dark ? '#6E86A6' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>
            ‹
          </button>
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>
            {deptoSel?.numero ?? deptoSel?.id_obra}
            {deptoSel?.numero && deptoSel?.id_obra && (
              <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.55, marginLeft: 6 }}>
                ({deptoSel.id_obra})
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.5, marginLeft: 6 }}>
              · {torreSel?.nombre}
            </span>
          </IonTitle>
          <div slot="end" style={{ marginRight: 14, background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#f9fafb' }}>
            Piso {deptoSel?.piso}
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: '12px 12px 100px' }}>

          {/* Chips info depto */}
          <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'N° Final', value: deptoSel?.numero },
                { label: 'Id obra',  value: deptoSel?.id_obra },
                { label: 'Piso',     value: deptoSel?.piso },
              ].map(item => (
                <div key={item.label} style={{
                  flex: 1, background: dark ? '#16233B' : '#f8fafc',
                  borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                  border: `0.5px solid ${border}`,
                }}>
                  <div style={{ fontSize: 9, color: textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>
                    {item.value ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {cargandoDepto ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <IonSpinner name="crescent" style={{ color: '#1e3a5f' }} />
            </div>
          ) : cerrado ? (
            <div style={{
              background: rojoBg, border: `0.5px solid ${rojoBord}`,
              borderRadius: 12, padding: '10px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🔒</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: rojo }}>Depto cerrado</div>
                  <div style={{ fontSize: 11, color: textSecondary }}>No se pueden agregar observaciones.</div>
                </div>
              </div>
              {esAdmin && (
                <button onClick={reabrirDepto} disabled={cerrando} style={{
                  padding: '4px 12px', borderRadius: 8, border: `0.5px solid ${rojoBord}`,
                  background: 'transparent', color: rojo, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                  Reabrir
                </button>
              )}
            </div>
          ) : (
            <div style={{
              background: amarilloBg, border: `0.5px solid ${amarilloBord}`,
              borderRadius: 12, padding: '8px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>🔓</span>
              <span style={{ fontSize: 12, color: amarillo, fontWeight: 600 }}>
                Depto abierto · {obsDepto.length} obs registradas
                {getPendientesOG().filter(p => p.departamento_id === deptoSel?.id).length > 0 && (
                  <span style={{ marginLeft: 6, color: textMuted, fontWeight: 400 }}>
                    ({getPendientesOG().filter(p => p.departamento_id === deptoSel?.id).length} pendientes)
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Botones de acción */}
          {!cargandoDepto && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <button
                onClick={irADetalle}
                disabled={cerrado || !cacheOk}
                style={{
                  height: 50, borderRadius: 12, border: 'none',
                  background: (cerrado || !cacheOk)
                    ? (dark ? '#1E2E4A' : '#e2e8f0')
                    : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                  color: (cerrado || !cacheOk) ? textMuted : '#fff',
                  fontSize: 14, fontWeight: 700,
                  cursor: (cerrado || !cacheOk) ? 'not-allowed' : 'pointer',
                }}
              >
                📐 Inspeccionar
              </button>

              <button
                onClick={irAResumen}
                disabled={!resumenDisponible}
                style={{
                  height: 50, borderRadius: 12,
                  border: `0.5px solid ${resumenDisponible ? (dark ? 'rgba(30,58,95,0.5)' : '#bfdbfe') : border}`,
                  background: resumenDisponible ? azulBg : 'transparent',
                  color: resumenDisponible ? azul : textMuted,
                  fontSize: 14, fontWeight: resumenDisponible ? 600 : 400,
                  cursor: resumenDisponible ? 'pointer' : 'not-allowed',
                }}
              >
                📊 Resumen
              </button>

              {esAdmin && !cerrado && (
                <button
                  onClick={cerrarDepto}
                  disabled={cerrando}
                  style={{
                    gridColumn: '1 / -1', height: 42, borderRadius: 12,
                    border: `0.5px solid ${rojoBord}`, background: rojoBg,
                    color: rojo, fontSize: 13, fontWeight: 600,
                    cursor: cerrando ? 'not-allowed' : 'pointer', opacity: cerrando ? 0.6 : 1,
                  }}
                >
                  {cerrando ? 'Procesando...' : '🔒 Cerrar departamento'}
                </button>
              )}
            </div>
          )}

          {!cacheOk && !cerrado && !cargandoDepto && (
            <div style={{
              background: amarilloBg, border: `0.5px solid ${amarilloBord}`,
              borderRadius: 10, padding: '8px 12px', marginBottom: 10,
              fontSize: 12, color: amarillo,
            }}>
              ⚠️ Sin cache local — conectate a internet para habilitar la inspección
            </div>
          )}

          <div style={{ height: '0.5px', background: sepLine, margin: '16px 0' }} />

          {!cargandoDepto && (
            <>
              <div style={{ ...labelStyle, marginBottom: 10 }}>
                OBSERVACIONES REGISTRADAS ({obsDepto.length})
              </div>

              {obsAgrupadas.length === 0 ? (
                <div style={{
                  background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`,
                  textAlign: 'center', padding: '28px 14px',
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 14, color: textSecondary }}>Sin observaciones registradas</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>
                    Toca "Inspeccionar" para comenzar
                  </div>
                </div>
              ) : (
                obsAgrupadas.map(({ ambiente, obs }) => (
                  <div key={ambiente} style={{
                    background: cardGrad, borderRadius: 16,
                    border: `0.5px solid ${border}`, overflow: 'hidden', marginBottom: 8,
                  }}>
                    <button
                      onClick={() => toggleExpandir(ambiente)}
                      style={{
                        width: '100%', padding: '12px 14px', background: 'transparent',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>🏠</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{ambiente}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          background: azulBg, color: azul, border: `0.5px solid ${azulBord}`,
                          borderRadius: 20, padding: '2px 8px', fontSize: 12, fontWeight: 700,
                        }}>
                          {obs.length}
                        </span>
                        <span style={{ color: textMuted, fontSize: 11 }}>
                          {expandidos.has(ambiente) ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {expandidos.has(ambiente) && (
                      <div style={{ borderTop: `0.5px solid ${border}` }}>
                        {obs.map((o: any, i: number) => (
                          <div key={o.id} style={{
                            padding: '10px 14px',
                            borderBottom: i < obs.length - 1 ? `0.5px solid ${border}` : 'none',
                          }}>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center', marginBottom: 4,
                            }}>
                              <span style={{ fontSize: 12, color: textMuted }}>
                                {o.tipo_elemento} · {o.tipo_revision}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {o.foto_url && <span style={{ fontSize: 11, color: azul }}>📷</span>}
                                {o._offline && (
                                  <span style={{
                                    fontSize: 10, background: amarilloBg, color: amarillo,
                                    border: `0.5px solid ${amarilloBord}`, borderRadius: 6, padding: '1px 6px',
                                  }}>
                                    ⏳ pendiente
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary, marginBottom: 3 }}>
                              {o.elemento || '—'}
                            </div>
                            <div style={{ fontSize: 13, color: azul, fontWeight: 600, marginBottom: 4 }}>
                              {o.tolerancia || '—'}
                            </div>
                            <div style={{ fontSize: 11, color: textMuted }}>
                              {o._offline
                                ? 'Pendiente de sincronizar'
                                : `${o.usuarios?.nombre || '—'} · ${new Date(o.creado_en).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );

  return null;
};

export default RevisionOG;
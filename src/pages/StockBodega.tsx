import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle, IonToast, IonModal, IonSpinner, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useRef, useState, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

// ============================================================
// Tipos
// ============================================================
interface Proyecto { id: string; nombre: string; codigo: string; }

// Fila de la vista bodega_stock_actual
interface StockRow {
  material_id: string;
  nombre: string;
  unidad: string | null;           // unidad de uso (litros, kg...) — la que se pide/descuenta
  unidad_compra: string | null;    // unidad de empaque tal cual la reporta AYNI (tambores, sacos...)
  familia: string | null;
  especialidad: string | null;
  umbral_minimo: number | null;
  recibido_ayni: number;           // recibido convertido a unidad de uso
  recibido_compra: number;         // recibido tal cual AYNI (unidad de compra)
  factor_conversion: number;
  entregado: number;
  ajuste: number;
  prestado_neto: number;
  stock_actual: number;
  bajo_stock: boolean;
  fuente: string | null;
}

interface PrestamoRow {
  numero_guia: string;
  obra_destino: string;
  fecha_prestamo: string;
  cantidad_prestada: number;
  cantidad_devuelta: number;
  unidad_registro: string | null;
  estado: string;
}

interface AjusteRow {
  cantidad: number;
  motivo: string | null;
  creado_en: string;
  usuarios: { nombre: string | null } | null;
}

interface OcRow {
  n_oc: string | null; estado_oc: string | null; estado_req: string | null;
  comprado_j: number | null; por_recepcionar_k: number | null; recibido: number | null;
  fecha_requerida: string | null;
}
interface EntregaRow {
  vale_codigo: string; retira_nombre: string; torre_nombre: string | null; es_exterior: boolean;
  cantidad_entregada: number | null; estado: string; observacion: string | null; fecha_resolucion: string | null;
}

// ============================================================
const StockBodega: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);
  const location = useLocation<{ proyecto?: Proyecto; soloBajoStock?: boolean }>();

  // ── tokens (paleta azul-marino VAIN) ──────────────────────────
  const bg            = dark ? '#0B1220' : '#f0f4f8';
  const cardGrad       = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const border         = dark ? '#243550'  : '#e2e8f0';
  const textPrimary    = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary  = dark ? '#6b7280'  : '#64748b';
  const textMuted      = dark ? '#5D728F'  : '#94a3b8';
  const toolbar        = dark ? '#0E1728'  : '#1e3a5f';
  const inputBg        = dark ? '#1B2C48'  : '#ffffff';
  const inputBorder    = dark ? '#243550'  : '#cbd5e1';

  const verde      = dark ? '#4ade80' : '#15803d';
  const verdeBg    = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord  = dark ? 'rgba(74,222,128,0.2)'  : '#bbf7d0';
  const azul       = dark ? '#60a5fa' : '#1d4ed8';
  const azulBg     = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const azulBord   = dark ? 'rgba(96,165,250,0.2)'  : '#bfdbfe';
  const amarillo     = dark ? '#fbbf24' : '#a16207';
  const amarilloBg   = dark ? 'rgba(251,191,36,0.08)' : '#fffbeb';
  const amarilloBord = dark ? 'rgba(251,191,36,0.25)'  : '#fde68a';
  const rojo       = dark ? '#f87171' : '#b91c1c';
  const rojoBg     = dark ? 'rgba(239,68,68,0.08)' : '#fef2f2';
  const rojoBord   = dark ? 'rgba(239,68,68,0.25)' : '#fecaca';

  // Helpers para mostrar valores según la unidad elegida para CADA material
  const mostrarUnidad = (m: StockRow) => {
    const pref = getUnidadDisplay(m.material_id);
    return pref === 'compra' && m.unidad_compra && m.factor_conversion !== 1
      ? m.unidad_compra : m.unidad;
  };

  const convertirADisplay = (valor: number, m: StockRow) => {
    const pref = getUnidadDisplay(m.material_id);
    return pref === 'compra' && m.factor_conversion !== 1
      ? Math.round((valor / m.factor_conversion) * 100) / 100
      : valor;
  };

  // Inversa de convertirADisplay: lo que la persona tecleó en SU unidad
  // preferida (display) hay que devolverlo a la unidad granular, que es
  // la que usa la BD para comparar contra stock_actual.
  const convertirDesdeDisplay = (valorDisplay: number, m: StockRow) => {
    const pref = getUnidadDisplay(m.material_id);
    return pref === 'compra' && m.factor_conversion !== 1
      ? Math.round(valorDisplay * m.factor_conversion * 100) / 100
      : valorDisplay;
  };

  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`,
    padding: '12px 14px', marginBottom: 8,
  };
  const sInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`,
    borderRadius: 10, padding: '8px 12px', fontSize: 14,
    background: inputBg, color: textPrimary, outline: 'none', height: 40,
  };

  // ── estado ─────────────────────────────────────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(location.state?.proyecto ?? null);
  const [rol, setRol] = useState<string>('');
  const [materiales, setMateriales] = useState<StockRow[]>([]);
  const [busqueda, setBusqueda] = useState('');
  // Filtro de stock: unificado en un solo selector (antes era un checkbox
  // aislado solo para "bajo stock"). Si llega navegando desde el dashboard
  // con soloBajoStock=true, arranca directo en "bajo_minimo".
  type FiltroStock = 'todos' | 'con_stock' | 'sin_stock' | 'bajo_minimo';
  const [filtroStock, setFiltroStock] = useState<FiltroStock>(
    location.state?.soloBajoStock ? 'bajo_minimo' : 'todos'
  );
  const [cargando, setCargando] = useState(true);

  // Filtro por cuadrilla
  const [cuadrillas, setCuadrillas] = useState<{ id: string; nombre: string }[]>([]);
  const [cuadrillaSeleccionada, setCuadrillaSeleccionada] = useState('');
  const [materialesCuadrilla, setMaterialesCuadrilla] = useState<Set<string> | null>(null);

  // umbral edit (solo jefe de bodega)
  const [umbralEdit, setUmbralEdit] = useState<Record<string, string>>({});

  // ficha material
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [fichaMaterial, setFichaMaterial] = useState<StockRow | null>(null);
  const [fichaOcs, setFichaOcs] = useState<OcRow[]>([]);
  const [fichaEntregas, setFichaEntregas] = useState<EntregaRow[]>([]);
  const [fichaActividades, setFichaActividades] = useState<string[]>([]);
  const [fichaPrestamos, setFichaPrestamos] = useState<PrestamoRow[]>([]);
  const [fichaAjustes, setFichaAjustes] = useState<AjusteRow[]>([]);

  // Preferencia de unidad POR MATERIAL: cada material puede verse en su propia
  // unidad preferida, porque en obra algunos se manejan por envase y otros por kg.
  // Se guarda en localStorage como un objeto { material_id: 'compra' | 'granular' }.
  const [unidadPorMaterial, setUnidadPorMaterial] = useState<Record<string, 'granular' | 'compra'>>(() => {
    try {
      const saved = localStorage.getItem('bodega_unidades_display');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const getUnidadDisplay = (materialId: string) => unidadPorMaterial[materialId] ?? 'granular';

  const toggleUnidadMaterial = (materialId: string) => {
    setUnidadPorMaterial(prev => {
      const actual = prev[materialId] ?? 'granular';
      const nueva: 'granular' | 'compra' = actual === 'granular' ? 'compra' : 'granular';
      const next: Record<string, 'granular' | 'compra'> = { ...prev, [materialId]: nueva };
      try { localStorage.setItem('bodega_unidades_display', JSON.stringify(next)); } catch {}
      return next;
    });
    // Si había un umbral a medio escribir sin guardar, se limpia para que
    // el campo vuelva a mostrar el valor guardado convertido a la unidad
    // nueva, en vez de dejar un número que quedó en la unidad anterior.
    setUmbralEdit(prev => {
      if (!(materialId in prev)) return prev;
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  };
  const [fichaCargando, setFichaCargando] = useState(false);
  const [ajusteCantidad, setAjusteCantidad] = useState('');
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  const puedeEditarCatalogo = ['jefe_bodega', 'administrador', 'staff'].includes(rol);
  const puedeAjustar = ['jefe_bodega', 'ayudante_bodega', 'administrador', 'staff'].includes(rol);

  // ── carga ──────────────────────────────────────────────────────────────
  const cargarStock = useCallback(async (proyectoId: string) => {
    setCargando(true);
    const [stockRes, cuadRes] = await Promise.all([
      supabase.from('bodega_stock_actual').select('*').eq('proyecto_id', proyectoId).order('nombre'),
      supabase.from('bodega_cuadrillas').select('id, nombre').eq('activa', true).order('nombre'),
    ]);
    setMateriales((stockRes.data as StockRow[] | null) ?? []);
    setCuadrillas(((cuadRes.data as any[]) ?? []).map(c => ({ id: c.id, nombre: c.nombre })));
    setCargando(false);
  }, []);

  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargarInicial(); }
  });

  const cargarInicial = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;

    const { data: usuarioRow } = await supabase
      .from('usuarios').select('rol').eq('id', authData.user.id).maybeSingle();
    if (usuarioRow) setRol(usuarioRow.rol ?? '');

    let proy = proyecto;
    if (!proy) {
      const { data: up } = await supabase
        .from('usuario_proyectos')
        .select('proyecto_id, proyectos ( id, nombre, codigo )')
        .eq('usuario_id', authData.user.id)
        .eq('es_principal', true)
        .maybeSingle();
      if (up?.proyectos) { proy = up.proyectos as unknown as Proyecto; setProyecto(proy); }
    }
    if (proy) await cargarStock(proy.id);
    else setCargando(false);
  };

  // Pull-to-refresh: recarga el stock deslizando hacia abajo.
  const onRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    if (proyecto) await cargarStock(proyecto.id);
    e.detail.complete();
  };

  // Al elegir una cuadrilla, cargamos los material_ids que le corresponden
  // (cadena: cuadrilla → actividades → materiales)
  const filtrarPorCuadrilla = async (cuadrillaId: string) => {
    setCuadrillaSeleccionada(cuadrillaId);
    if (!cuadrillaId) { setMaterialesCuadrilla(null); return; }

    // Paso 1: actividad_ids de la cuadrilla
    const { data: cuadActs } = await supabase
      .from('bodega_cuadrilla_actividades')
      .select('actividad_id')
      .eq('cuadrilla_id', cuadrillaId);
    const actIds = ((cuadActs as any[]) ?? []).map(r => r.actividad_id);
    if (actIds.length === 0) { setMaterialesCuadrilla(new Set()); return; }

    // Paso 2: material_ids que tienen esas actividades
    const { data: matActs } = await supabase
      .from('bodega_material_actividades')
      .select('material_id')
      .in('actividad_id', actIds);
    const matIds = new Set(((matActs as any[]) ?? []).map(r => r.material_id));
    setMaterialesCuadrilla(matIds);
  };

  // ── filtrado ───────────────────────────────────────────────────────────
  const materialesFiltrados = useMemo(() => {
    let lista = materiales;
    if (materialesCuadrilla) lista = lista.filter(m => materialesCuadrilla.has(m.material_id));
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(m => m.nombre.toLowerCase().includes(q));
    }
    if (filtroStock === 'con_stock') lista = lista.filter(m => m.stock_actual > 0);
    else if (filtroStock === 'sin_stock') lista = lista.filter(m => m.stock_actual <= 0);
    else if (filtroStock === 'bajo_minimo') lista = lista.filter(m => m.bajo_stock);
    return lista.slice(0, 80);
  }, [materiales, busqueda, filtroStock, materialesCuadrilla]);

  const totalBajoStock = useMemo(() => materiales.filter(m => m.bajo_stock).length, [materiales]);
  const totalConStock = useMemo(() => materiales.filter(m => m.stock_actual > 0).length, [materiales]);
  const totalSinStock = useMemo(() => materiales.filter(m => m.stock_actual <= 0).length, [materiales]);

  // ── umbral ─────────────────────────────────────────────────────────────
  const guardarUmbral = async (m: StockRow) => {
    if (!proyecto) return;
    const valor = umbralEdit[m.material_id];
    const umbralDisplay = valor === '' || valor === undefined ? null : parseFloat(valor);
    if (valor !== '' && valor !== undefined && (umbralDisplay === null || isNaN(umbralDisplay) || umbralDisplay < 0)) {
      setToastColor('danger'); setToastMsg('Umbral inválido'); return;
    }
    // Se guarda siempre en la unidad granular (la misma que usa stock_actual
    // para compararse), sin importar en qué unidad lo haya tecleado la
    // persona — por eso se convierte antes de mandarlo a la RPC.
    const umbral = umbralDisplay === null ? null : convertirDesdeDisplay(umbralDisplay, m);
    const { error } = await supabase.rpc('bodega_set_umbral_minimo', {
      p_proyecto_id: proyecto.id, p_material_id: m.material_id, p_umbral: umbral,
    });
    if (error) { setToastColor('danger'); setToastMsg('No se pudo guardar el umbral: ' + error.message); }
    else cargarStock(proyecto.id);
  };

  // ── ficha ──────────────────────────────────────────────────────────────
  const cargarHistorialAjustes = async (materialId: string) => {
    const { data } = await supabase
      .from('bodega_ajustes')
      .select('cantidad, motivo, creado_en, usuarios ( nombre )')
      .eq('material_id', materialId)
      .order('creado_en', { ascending: false });
    setFichaAjustes((data as unknown as AjusteRow[] | null) ?? []);
  };

  const abrirFicha = async (m: StockRow) => {
    setFichaMaterial(m);
    setFichaAbierta(true);
    setFichaCargando(true);
    setAjusteCantidad(''); setAjusteMotivo('');
    const [ocs, entregas, actividades, prestamosData] = await Promise.all([
      supabase.rpc('bodega_material_ocs', { p_material_id: m.material_id }),
      supabase.rpc('bodega_material_entregas', { p_material_id: m.material_id }),
      supabase.from('bodega_material_actividades').select('bodega_actividades ( nombre )').eq('material_id', m.material_id),
      supabase.rpc('bodega_material_prestamos', { p_material_id: m.material_id }),
      cargarHistorialAjustes(m.material_id),
    ]);
    setFichaOcs((ocs.data as OcRow[] | null) ?? []);
    setFichaEntregas((entregas.data as EntregaRow[] | null) ?? []);
    setFichaPrestamos((prestamosData.data as PrestamoRow[] | null) ?? []);
    const nombresActividades = ((actividades.data as any[]) ?? [])
      .map(r => r.bodega_actividades?.nombre)
      .filter(Boolean)
      .sort();
    setFichaActividades(nombresActividades);
    setFichaCargando(false);
  };

  const guardarAjuste = async () => {
    if (!proyecto || !fichaMaterial) return;
    const cant = parseFloat(ajusteCantidad);
    if (!cant || isNaN(cant)) { setToastColor('danger'); setToastMsg('Ingresa una cantidad (positiva o negativa)'); return; }
    const motivo = ajusteMotivo.trim();
    if (!motivo) { setToastColor('danger'); setToastMsg('Indica el motivo del ajuste — queda registrado en el historial'); return; }
    setGuardandoAjuste(true);
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from('bodega_ajustes').insert({
      proyecto_id: proyecto.id,
      material_id: fichaMaterial.material_id,
      cantidad: cant,
      motivo,
      registrado_por: authData?.user?.id,
    });
    setGuardandoAjuste(false);
    if (error) { setToastColor('danger'); setToastMsg('No se pudo guardar el ajuste: ' + error.message); }
    else {
      setToastColor('success'); setToastMsg('Ajuste registrado');
      setAjusteCantidad(''); setAjusteMotivo('');
      await Promise.all([cargarStock(proyecto.id), cargarHistorialAjustes(fichaMaterial.material_id)]);
      setFichaAbierta(false);
    }
  };

  const fmtFecha = (f: string | null) => {
    if (!f) return '';
    const d = new Date(f);
    return isNaN(d.getTime()) ? f : d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  // ============================================================
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Stock de bodega</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <IonRefresher slot="fixed" onIonRefresh={onRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div style={{ padding: 16, paddingBottom: 40 }}>

          {proyecto && (
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>{proyecto.nombre}</div>
          )}

          {/* Búsqueda y filtro */}
          <div style={sCard}>
            {cuadrillas.length > 0 && (
              <select
                style={{ ...sInput, marginBottom: 8 }}
                value={cuadrillaSeleccionada}
                onChange={e => filtrarPorCuadrilla(e.target.value)}
              >
                <option value="">Todas las cuadrillas</option>
                {cuadrillas.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            )}
            <input style={sInput} placeholder="Buscar material..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {([
                { key: 'todos', label: 'Todos', total: materiales.length },
                { key: 'con_stock', label: 'Con stock', total: totalConStock },
                { key: 'sin_stock', label: 'Sin stock', total: totalSinStock },
                { key: 'bajo_minimo', label: 'Bajo mínimo', total: totalBajoStock },
              ] as { key: FiltroStock; label: string; total: number }[]).map(op => {
                const activo = filtroStock === op.key;
                // El filtro de "bajo mínimo" usa rojo (es una alerta), el resto azul.
                const colorActivo = op.key === 'bajo_minimo' ? rojo : azul;
                const bgActivo = op.key === 'bajo_minimo' ? rojoBg : azulBg;
                const bordActivo = op.key === 'bajo_minimo' ? rojoBord : azulBord;
                return (
                  <button
                    key={op.key}
                    onClick={() => setFiltroStock(op.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                      border: `0.5px solid ${activo ? colorActivo : border}`,
                      background: activo ? bgActivo : 'transparent',
                      color: activo ? colorActivo : textSecondary,
                    }}
                  >
                    {op.label}
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 8,
                      background: activo ? colorActivo : (dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'),
                      color: activo ? '#fff' : textMuted,
                    }}>
                      {op.total}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {!cargando && totalBajoStock > 0 && filtroStock !== 'bajo_minimo' && (
            <div
              onClick={() => setFiltroStock('bajo_minimo')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                background: rojoBg, border: `1px solid ${rojoBord}`, borderRadius: 14,
                padding: '12px 14px', marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: rojo }}>
                  {totalBajoStock} material{totalBajoStock === 1 ? '' : 'es'} bajo el stock mínimo
                </div>
                <div style={{ fontSize: 11, color: rojo, opacity: 0.85 }}>Toca para ver el detalle</div>
              </div>
              <span style={{ fontSize: 18, color: rojo }}>›</span>
            </div>
          )}

          {cargando && <div style={{ textAlign: 'center', padding: 30 }}><IonSpinner name="crescent" /></div>}

          {!cargando && materiales.length === 0 && (
            <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: '30px 0', lineHeight: 1.6 }}>
              No hay materiales cargados todavía.<br />Sube una planilla de AYNI para empezar.
            </div>
          )}

          {!cargando && !busqueda.trim() && filtroStock === 'todos' && materiales.length > 80 && (
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>
              Mostrando 80 de {materiales.length} materiales — usa el buscador para encontrar otros.
            </div>
          )}

          {/* Lista */}
          {materialesFiltrados.map(m => (
            <div
              key={m.material_id}
              onClick={() => abrirFicha(m)}
              style={{
                ...sCard, cursor: 'pointer',
                ...(m.bajo_stock ? {
                  background: rojoBg,
                  border: `1px solid ${rojoBord}`,
                  borderLeft: `4px solid ${rojo}`,
                } : {}),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.bajo_stock && <span style={{ fontSize: 13 }}>⚠️</span>}
                    {m.nombre}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 18, fontWeight: 600, color: m.bajo_stock ? rojo : textPrimary }}>{convertirADisplay(m.stock_actual, m)}</span>
                    <span style={{ fontSize: 12, color: textMuted }}>{mostrarUnidad(m) ?? 'sin unidad'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>
                    recibido {convertirADisplay(m.recibido_ayni, m)} {mostrarUnidad(m)}
                    {m.entregado > 0 ? ` · entregado ${convertirADisplay(m.entregado, m)}` : ''}
                    {m.prestado_neto > 0 ? ` · prestado ${convertirADisplay(m.prestado_neto, m)}` : ''}
                    {m.ajuste !== 0 ? ` · ajuste ${m.ajuste > 0 ? '+' : ''}${convertirADisplay(m.ajuste, m)}` : ''}
                  </div>
                  {m.bajo_stock && (
                    <div style={{
                      display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#fff',
                      background: rojo, borderRadius: 999, padding: '2px 8px', marginTop: 6, letterSpacing: '0.3px',
                    }}>
                      STOCK BAJO EL MÍNIMO
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 18, color: textMuted, flexShrink: 0 }}>›</div>
              </div>

              {/* Umbral inline (jefe de bodega) */}
              {puedeEditarCatalogo && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <div style={{ fontSize: 10, color: textMuted }}>
                      Umbral mínimo de alerta {mostrarUnidad(m) ? `(${mostrarUnidad(m)})` : ''}
                    </div>
                    {m.factor_conversion !== 1 && m.unidad_compra && (
                      <span
                        onClick={() => toggleUnidadMaterial(m.material_id)}
                        style={{ fontSize: 10, color: azul, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Definir en {getUnidadDisplay(m.material_id) === 'granular' ? m.unidad_compra : m.unidad}
                      </span>
                    )}
                  </div>
                  <input
                    type="number" min="0"
                    style={{ ...sInput, height: 32, fontSize: 13 }}
                    placeholder={m.umbral_minimo !== null ? String(convertirADisplay(m.umbral_minimo, m)) : 'sin definir'}
                    value={umbralEdit[m.material_id] ?? (m.umbral_minimo !== null ? String(convertirADisplay(m.umbral_minimo, m)) : '')}
                    onChange={e => setUmbralEdit(prev => ({ ...prev, [m.material_id]: e.target.value }))}
                    onBlur={() => guardarUmbral(m)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </IonContent>

      {/* ── Ficha de trazabilidad del material ──────────────────────────── */}
      <IonModal isOpen={fichaAbierta} onDidDismiss={() => setFichaAbierta(false)} initialBreakpoint={0.9} breakpoints={[0, 0.9, 1]}>
        <div style={{ padding: 20, background: dark ? '#0E1728' : '#ffffff', height: '100%', overflowY: 'auto' }}>
          {fichaMaterial && (
            <>
              <div style={{ fontSize: 17, fontWeight: 600, color: textPrimary }}>{fichaMaterial.nombre}</div>
              <div style={{ fontSize: 13, color: textSecondary, marginTop: 2 }}>
                {fichaMaterial.familia}{fichaMaterial.unidad ? ` · ${fichaMaterial.unidad}` : ''}
              </div>

              {/* Toggle de unidad por material (solo si tiene conversión) */}
              {fichaMaterial.factor_conversion !== 1 && fichaMaterial.unidad_compra && (
                <button
                  onClick={() => toggleUnidadMaterial(fichaMaterial.material_id)}
                  style={{
                    marginTop: 8, fontSize: 12, padding: '6px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `0.5px solid ${azulBord}`, background: azulBg, color: azul, fontWeight: 600,
                  }}
                >
                  {getUnidadDisplay(fichaMaterial.material_id) === 'granular'
                    ? `Cambiar a ${fichaMaterial.unidad_compra}`
                    : `Cambiar a ${fichaMaterial.unidad}`}
                </button>
              )}

              {/* Actividades donde se usa este material */}
              {fichaActividades.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {fichaActividades.map(nombre => (
                    <span key={nombre} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10, background: azulBg, color: azul, border: `0.5px solid ${azulBord}` }}>
                      {nombre}
                    </span>
                  ))}
                </div>
              )}
              {!fichaCargando && fichaActividades.length === 0 && (
                <div style={{ fontSize: 11, color: textMuted, marginTop: 8 }}>Sin actividad asociada todavía.</div>
              )}

              {/* Números clave */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '16px 0' }}>
                <div style={{ background: azulBg, borderRadius: 12, padding: '12px', border: `0.5px solid ${azulBord}` }}>
                  <div style={{ fontSize: 11, color: textSecondary }}>Recibido{fichaMaterial.fuente === 'ayni' ? ' AYNI' : ''}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: azul }}>
                    {convertirADisplay(fichaMaterial.recibido_ayni, fichaMaterial)} <span style={{ fontSize: 13, fontWeight: 400 }}>{mostrarUnidad(fichaMaterial)}</span>
                  </div>
                  {fichaMaterial.factor_conversion !== 1 && fichaMaterial.unidad_compra && (
                    <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
                      = {getUnidadDisplay(fichaMaterial.material_id) === 'compra' ? fichaMaterial.recibido_ayni + ' ' + fichaMaterial.unidad : fichaMaterial.recibido_compra + ' ' + fichaMaterial.unidad_compra}
                    </div>
                  )}
                </div>
                <div style={{ background: verdeBg, borderRadius: 12, padding: '12px', border: `0.5px solid ${verdeBord}` }}>
                  <div style={{ fontSize: 11, color: textSecondary }}>Stock en obra</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: fichaMaterial.bajo_stock ? rojo : verde }}>
                    {convertirADisplay(fichaMaterial.stock_actual, fichaMaterial)} <span style={{ fontSize: 13, fontWeight: 400 }}>{mostrarUnidad(fichaMaterial)}</span>
                  </div>
                  {fichaMaterial.prestado_neto > 0 && (
                    <div style={{ fontSize: 11, color: amarillo, marginTop: 2 }}>
                      prestado: {convertirADisplay(fichaMaterial.prestado_neto, fichaMaterial)}
                    </div>
                  )}
                </div>
              </div>

              {fichaCargando && <div style={{ textAlign: 'center', padding: 20 }}><IonSpinner name="crescent" /></div>}

              {!fichaCargando && (
                <>
                  {/* OC de AYNI */}
                  <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                    Órdenes de compra (AYNI)
                  </div>
                  {fichaOcs.length === 0 && <div style={{ fontSize: 13, color: textMuted, marginBottom: 14 }}>Sin OC registradas.</div>}

                  {/* Saldo agregado: suma comprado y recibido de TODAS las OC del
                      material, para saber cuánto falta por llegar en total, no
                      solo por línea. */}
                  {fichaOcs.length > 0 && (() => {
                    const totalComprado = fichaOcs.reduce((acc, oc) => acc + (oc.comprado_j ?? 0), 0);
                    const totalRecibido = fichaOcs.reduce((acc, oc) => acc + (oc.recibido ?? 0), 0);
                    const totalPendiente = totalComprado - totalRecibido;
                    const uni = fichaMaterial.unidad_compra ?? '';
                    return (
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', fontSize: 12,
                        marginBottom: 10, padding: '10px 12px', borderRadius: 10,
                        background: dark ? 'rgba(255,255,255,0.03)' : '#f8fafc', border: `0.5px solid ${border}`,
                      }}>
                        <div>
                          <div style={{ color: textMuted, fontSize: 10 }}>Comprado</div>
                          <div style={{ color: textPrimary, fontWeight: 600 }}>{totalComprado} <span style={{ fontWeight: 400, fontSize: 10 }}>{uni}</span></div>
                        </div>
                        <div>
                          <div style={{ color: textMuted, fontSize: 10 }}>Recibido</div>
                          <div style={{ color: textPrimary, fontWeight: 600 }}>{totalRecibido} <span style={{ fontWeight: 400, fontSize: 10 }}>{uni}</span></div>
                        </div>
                        <div>
                          <div style={{ color: textMuted, fontSize: 10 }}>Pendiente</div>
                          <div style={{ color: totalPendiente > 0 ? amarillo : textPrimary, fontWeight: 600 }}>{totalPendiente} <span style={{ fontWeight: 400, fontSize: 10 }}>{uni}</span></div>
                        </div>
                      </div>
                    );
                  })()}

                  {fichaOcs.map((oc, i) => {
                    const recTotal = (oc.estado_oc ?? '').toUpperCase().includes('TOTAL');
                    const col = recTotal ? verde : (oc.recibido ?? 0) > 0 ? amarillo : textMuted;
                    const bgc = recTotal ? verdeBg : (oc.recibido ?? 0) > 0 ? amarilloBg : 'transparent';
                    const brd = recTotal ? verdeBord : (oc.recibido ?? 0) > 0 ? amarilloBord : border;
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < fichaOcs.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                        <div>
                          <div style={{ fontSize: 13, color: textPrimary }}>OC {oc.n_oc || 's/n'} · {fmtFecha(oc.fecha_requerida)}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>{oc.estado_oc || oc.estado_req}</div>
                        </div>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 8, background: bgc, color: col, border: `0.5px solid ${brd}`, whiteSpace: 'nowrap' }}>
                          {(oc.por_recepcionar_k ?? 0) > 0
                            ? `${oc.recibido ?? 0} de ${oc.comprado_j} ${fichaMaterial.unidad_compra ?? ''}`
                            : `${oc.recibido ?? 0} ${fichaMaterial.unidad_compra ?? ''} recibido`}
                        </span>
                      </div>
                    );
                  })}

                  {/* Entregas (vales) */}
                  <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, margin: '16px 0 8px' }}>
                    Entregas en obra (vales)
                  </div>
                  {fichaEntregas.length === 0 && <div style={{ fontSize: 13, color: textMuted, marginBottom: 14 }}>Sin entregas todavía.</div>}
                  {fichaEntregas.map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < fichaEntregas.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: textPrimary }}>
                          {e.vale_codigo}
                          {e.estado === 'aprobado_con_obs' && <span style={{ fontSize: 11, color: amarillo }}> · c/obs</span>}
                        </div>
                        <div style={{ fontSize: 11, color: textMuted }}>
                          {e.retira_nombre} · {e.es_exterior ? 'Exteriores' : `Torre ${e.torre_nombre ?? ''}`} · {fmtFecha(e.fecha_resolucion)}
                        </div>
                        {e.observacion && <div style={{ fontSize: 11, color: amarillo, marginTop: 1 }}>{e.observacion}</div>}
                      </div>
                      <span style={{ fontSize: 13, color: rojo, marginLeft: 8, whiteSpace: 'nowrap' }}>
                        −{e.cantidad_entregada ?? 0} {fichaMaterial.unidad}
                      </span>
                    </div>
                  ))}

                  {/* Préstamos entre obras */}
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: `0.5px solid ${border}` }}>
                  <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                    Préstamos entre obras
                  </div>
                  {fichaPrestamos.length === 0 && <div style={{ fontSize: 13, color: textMuted, marginBottom: 14 }}>Sin préstamos registrados.</div>}
                  {fichaPrestamos.map((p, i) => {
                    const pendiente = p.cantidad_prestada - p.cantidad_devuelta;
                    const uni = p.unidad_registro ?? fichaMaterial.unidad ?? '';
                    const estColor = p.estado === 'devuelto' ? verde : p.estado === 'devuelto_parcial' ? amarillo : rojo;
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < fichaPrestamos.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                        <div>
                          <div style={{ fontSize: 13, color: textPrimary }}>Guía {p.numero_guia} → {p.obra_destino}</div>
                          <div style={{ fontSize: 11, color: textMuted }}>{p.fecha_prestamo}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 13, color: estColor, fontWeight: 600 }}>
                            {p.estado === 'devuelto' ? 'Devuelto' : `−${pendiente} ${uni}`}
                          </span>
                          {p.cantidad_devuelta > 0 && p.estado !== 'devuelto' && (
                            <div style={{ fontSize: 11, color: verde }}>dev: {p.cantidad_devuelta}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>

                  {/* Historial de ajustes manuales */}
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: `0.5px solid ${border}` }}>
                  <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                    Historial de ajustes manuales
                  </div>
                  {fichaAjustes.length === 0 && <div style={{ fontSize: 13, color: textMuted, marginBottom: 14 }}>Sin ajustes registrados.</div>}
                  {fichaAjustes.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: i < fichaAjustes.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: textPrimary }}>{a.motivo || 'Sin motivo indicado'}</div>
                        <div style={{ fontSize: 11, color: textMuted }}>
                          {a.usuarios?.nombre ?? 'Usuario desconocido'} · {fmtFecha(a.creado_en)}
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: a.cantidad >= 0 ? verde : rojo, marginLeft: 8, whiteSpace: 'nowrap' }}>
                        {a.cantidad > 0 ? '+' : ''}{a.cantidad}
                      </span>
                    </div>
                  ))}
                  </div>

                  {/* Ajuste manual opcional */}
                  {puedeAjustar && (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `0.5px solid ${border}` }}>
                      <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                        Ajuste manual {fichaMaterial.ajuste !== 0 ? `(actual: ${fichaMaterial.ajuste > 0 ? '+' : ''}${fichaMaterial.ajuste})` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: textMuted, marginBottom: 8 }}>
                        Corrige diferencias con el conteo físico. Usa negativo para descontar (ej. -5), positivo para sumar. El motivo es obligatorio y queda guardado en el historial de arriba.
                      </div>
                      <input type="number" placeholder="Cantidad (+/-)" style={{ ...sInput, height: 38, marginBottom: 8 }}
                        value={ajusteCantidad} onChange={e => setAjusteCantidad(e.target.value)} />
                      <input type="text" placeholder="Motivo del ajuste (obligatorio)" style={{ ...sInput, height: 38, marginBottom: 10 }}
                        value={ajusteMotivo} onChange={e => setAjusteMotivo(e.target.value)} />
                      <button onClick={guardarAjuste} disabled={guardandoAjuste} style={{ width: '100%', height: 42, borderRadius: 10, background: azul, border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        {guardandoAjuste ? 'Guardando...' : 'Registrar ajuste'}
                      </button>
                    </div>
                  )}
                </>
              )}

              <button onClick={() => setFichaAbierta(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 16, cursor: 'pointer' }}>
                Cerrar
              </button>
            </>
          )}
        </div>
      </IonModal>

      <IonToast isOpen={!!toastMsg} message={toastMsg} duration={2500} color={toastColor} onDidDismiss={() => setToastMsg('')} />
    </IonPage>
  );
};

export default StockBodega;
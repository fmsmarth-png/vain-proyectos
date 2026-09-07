import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle, IonToast, IonSpinner, IonRefresher, IonRefresherContent } from '@ionic/react';
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

interface MaterialCentral {
  id: string;
  nombre: string;
  unidad: string | null;
  total_teorico: number;
  despachado: number;
  por_despachar: number;
  entregado: number;
  stock_actual: number;
}

interface Despacho {
  id: string;
  numero_guia: string | null;
  fecha_despacho: string;
  notas: string | null;
  creado_en: string;
  registrado_por: string | null;
  usuarios: { nombre: string } | null;
  items: DespachoItem[];
}

interface DespachoItem {
  material_id: string;
  cantidad: number;
  nombre: string;
  unidad: string | null;
}

// ============================================================
const BodegaCentral: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);
  const location = useLocation<{ proyecto?: Proyecto }>();

  // ── tokens ──────────────────────────────────────────────────────────────
  const bg           = dark ? '#0B1220' : '#f0f4f8';
  const cardGrad     = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const border       = dark ? '#243550'  : '#e2e8f0';
  const textPrimary  = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary= dark ? '#6b7280'  : '#64748b';
  const textMuted    = dark ? '#5D728F'  : '#94a3b8';
  const toolbar      = dark ? '#0E1728'  : '#1e3a5f';
  const inputBg      = dark ? '#1B2C48'  : '#ffffff';
  const inputBorder  = dark ? '#243550'  : '#cbd5e1';
  const azul         = dark ? '#60a5fa'  : '#1d4ed8';
  const azulBg       = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const verde        = dark ? '#34d399'  : '#059669';
  const verdeBg      = dark ? 'rgba(52,211,153,0.06)' : '#f0fdf4';
  const amarillo     = dark ? '#fbbf24'  : '#d97706';
  const rojo         = dark ? '#f87171'  : '#b91c1c';

  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`,
    padding: '14px 14px', marginBottom: 10,
  };
  const sInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`,
    borderRadius: 10, padding: '8px 12px', fontSize: 14,
    background: inputBg, color: textPrimary, outline: 'none', height: 42,
  };
  const sBtnPrimary: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', color: '#ffffff',
    border: 'none', borderRadius: 12, padding: '13px 0', fontSize: 14,
    fontWeight: 700, width: '100%', cursor: 'pointer',
  };

  // ── estado ──────────────────────────────────────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(location.state?.proyecto ?? null);
  const [tab, setTab] = useState<'catalogo' | 'despachos'>('catalogo');
  const [cargando, setCargando] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  // Catálogo
  const [materiales, setMateriales] = useState<MaterialCentral[]>([]);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [unidadNuevo, setUnidadNuevo] = useState('');
  const [teoricoNuevo, setTeoricoNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNombreVal, setEditNombreVal] = useState('');
  const [editTeoricoVal, setEditTeoricoVal] = useState('');
  const [editUnidadVal, setEditUnidadVal] = useState('');
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  // Despachos
  const [despachos, setDespachos] = useState<Despacho[]>([]);
  const [numGuia, setNumGuia] = useState('');
  const [fechaDespacho, setFechaDespacho] = useState(new Date().toISOString().slice(0, 10));
  const [notasDespacho, setNotasDespacho] = useState('');
  const [itemsDespacho, setItemsDespacho] = useState<{ material_id: string; cantidad: string }[]>([]);
  const [guardandoDespacho, setGuardandoDespacho] = useState(false);

  // ── carga ───────────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async (proyectoId: string) => {
    setCargando(true);

    // Materiales desde la vista de stock (ya calcula despachado/entregado)
    const { data: stockData } = await supabase
      .from('bodega_stock_actual')
      .select('material_id, nombre, unidad, total_teorico, recibido_ayni, por_despachar, entregado, stock_actual')
      .eq('proyecto_id', proyectoId)
      .eq('fuente', 'bodega_central')
      .order('nombre');

    const mats = ((stockData as any[]) ?? []).map(r => ({
      id: r.material_id, nombre: r.nombre, unidad: r.unidad,
      total_teorico: r.total_teorico ?? 0,
      despachado: r.recibido_ayni ?? 0,
      por_despachar: r.por_despachar ?? 0,
      entregado: r.entregado ?? 0,
      stock_actual: r.stock_actual ?? 0,
    }));
    setMateriales(mats);

    // Despachos con sus items
    const { data: despData } = await supabase
      .from('bodega_despachos')
      .select('id, numero_guia, fecha_despacho, notas, creado_en, registrado_por, usuarios ( nombre )')
      .eq('proyecto_id', proyectoId)
      .order('fecha_despacho', { ascending: false });

    const despachosBase = ((despData as any[]) ?? []).map(d => ({
      ...d, items: [] as DespachoItem[],
    }));

    if (despachosBase.length > 0) {
      const ids = despachosBase.map(d => d.id);
      const { data: itemsData } = await supabase
        .from('bodega_despacho_items')
        .select('despacho_id, material_id, cantidad, bodega_materiales ( nombre, unidad )')
        .in('despacho_id', ids);
      const itemsPorDespacho: Record<string, DespachoItem[]> = {};
      for (const it of (itemsData as any[]) ?? []) {
        const did = it.despacho_id;
        if (!itemsPorDespacho[did]) itemsPorDespacho[did] = [];
        itemsPorDespacho[did].push({
          material_id: it.material_id, cantidad: it.cantidad,
          nombre: it.bodega_materiales?.nombre ?? 'Material',
          unidad: it.bodega_materiales?.unidad ?? null,
        });
      }
      despachosBase.forEach(d => { d.items = itemsPorDespacho[d.id] ?? []; });
    }

    setDespachos(despachosBase as Despacho[]);
    setCargando(false);
  }, []);

  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargarInicial(); }
  });

  const cargarInicial = async () => {
    let proy = proyecto;
    if (!proy) {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        const { data: up } = await supabase
          .from('usuario_proyectos')
          .select('proyecto_id, proyectos ( id, nombre, codigo )')
          .eq('usuario_id', authData.user.id)
          .eq('es_principal', true)
          .maybeSingle();
        if (up?.proyectos) { proy = up.proyectos as unknown as Proyecto; setProyecto(proy); }
      }
    }
    if (proy) await cargarDatos(proy.id);
    else setCargando(false);
  };

  const onRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    if (proyecto) await cargarDatos(proyecto.id);
    e.detail.complete();
  };

  // ── Catálogo: crear material ────────────────────────────────────────────
  const crearMaterial = async () => {
    if (!proyecto) return;
    if (!nombreNuevo.trim()) { setToastColor('danger'); setToastMsg('El nombre es obligatorio'); return; }
    setCreando(true);
    const { error } = await supabase.from('bodega_materiales').insert({
      proyecto_id: proyecto.id, nombre: nombreNuevo.trim().toUpperCase(),
      unidad: unidadNuevo.trim().toUpperCase() || null,
      fuente: 'bodega_central',
      total_teorico: parseFloat(teoricoNuevo) || 0,
      recibido_ayni: 0, activo: true,
    });
    setCreando(false);
    if (error) { setToastColor('danger'); setToastMsg('No se pudo crear: ' + error.message); return; }
    setNombreNuevo(''); setUnidadNuevo(''); setTeoricoNuevo('');
    setToastColor('success'); setToastMsg('Material agregado');
    await cargarDatos(proyecto.id);
  };

  // ── Catálogo: editar nombre, teórico y unidad ───────────────────────────
  const iniciarEdicion = (m: MaterialCentral) => {
    setEditandoId(m.id);
    setEditNombreVal(m.nombre);
    setEditTeoricoVal(String(m.total_teorico));
    setEditUnidadVal(m.unidad ?? '');
  };

  const guardarEdicion = async () => {
    if (!editandoId || !proyecto) return;
    if (!editNombreVal.trim()) { setToastColor('danger'); setToastMsg('El nombre es obligatorio'); return; }
    const { error } = await supabase.from('bodega_materiales').update({
      nombre: editNombreVal.trim().toUpperCase(),
      total_teorico: parseFloat(editTeoricoVal) || 0,
      unidad: editUnidadVal.trim().toUpperCase() || null,
    }).eq('id', editandoId);
    if (error) { setToastColor('danger'); setToastMsg('No se pudo guardar: ' + error.message); return; }
    setEditandoId(null);
    setToastColor('success'); setToastMsg('Material actualizado');
    await cargarDatos(proyecto.id);
  };

  // ── Catálogo: eliminar (baja lógica, activo=false) ──────────────────────
  // No se borra físicamente: preserva el historial de despachos que ya
  // referencian este material. Queda fuera de bodega_stock_actual (la vista
  // ya filtra por activo) y no aparece más en el catálogo ni en despachos.
  const eliminarMaterial = async (m: MaterialCentral) => {
    if (!proyecto) return;
    if (!window.confirm(`¿Eliminar "${m.nombre}" del catálogo? Esta acción no se puede deshacer.`)) return;
    setEliminandoId(m.id);
    const { error } = await supabase.from('bodega_materiales')
      .update({ activo: false })
      .eq('id', m.id);
    setEliminandoId(null);
    if (error) { setToastColor('danger'); setToastMsg('No se pudo eliminar: ' + error.message); return; }
    if (editandoId === m.id) setEditandoId(null);
    setToastColor('success'); setToastMsg(`"${m.nombre}" eliminado del catálogo`);
    await cargarDatos(proyecto.id);
  };

  // ── Despachos: agregar/quitar items al formulario ──────────────────────
  const agregarItemDespacho = () => {
    setItemsDespacho(prev => [...prev, { material_id: '', cantidad: '' }]);
  };

  const actualizarItemDespacho = (idx: number, campo: 'material_id' | 'cantidad', valor: string) => {
    setItemsDespacho(prev => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  };

  const quitarItemDespacho = (idx: number) => {
    setItemsDespacho(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Despachos: guardar ──────────────────────────────────────────────────
  const guardarDespacho = async () => {
    if (!proyecto) return;
    // N° de guía es opcional: compras por caja chica no siempre traen guía.
    const itemsValidos = itemsDespacho.filter(it => it.material_id && parseFloat(it.cantidad) > 0);
    if (itemsValidos.length === 0) { setToastColor('danger'); setToastMsg('Agrega al menos un material con cantidad'); return; }

    setGuardandoDespacho(true);
    const { data: authData } = await supabase.auth.getUser();

    const { data: despacho, error: errDespacho } = await supabase
      .from('bodega_despachos')
      .insert({
        proyecto_id: proyecto.id, numero_guia: numGuia.trim() || null,
        fecha_despacho: fechaDespacho, notas: notasDespacho.trim() || null,
        registrado_por: authData?.user?.id ?? null,
      })
      .select('id')
      .single();

    if (errDespacho || !despacho) {
      setGuardandoDespacho(false);
      setToastColor('danger');
      setToastMsg('No se pudo registrar: ' + (errDespacho?.message ?? 'error'));
      return;
    }

    const rows = itemsValidos.map(it => ({
      despacho_id: despacho.id, material_id: it.material_id,
      cantidad: parseFloat(it.cantidad),
    }));
    const { error: errItems } = await supabase.from('bodega_despacho_items').insert(rows);
    setGuardandoDespacho(false);

    if (errItems) {
      setToastColor('danger');
      setToastMsg('Guía creada pero no se pudieron guardar los materiales: ' + errItems.message);
      return;
    }

    const etiqueta = numGuia.trim() ? `Guía ${numGuia.trim()}` : 'Registro (caja chica, sin guía)';
    setNumGuia(''); setNotasDespacho(''); setItemsDespacho([]);
    setFechaDespacho(new Date().toISOString().slice(0, 10));
    setToastColor('success'); setToastMsg(`${etiqueta} registrada con ${itemsValidos.length} material(es)`);
    await cargarDatos(proyecto.id);
  };

  // ── helpers de render ───────────────────────────────────────────────────
  const materialesParaSelect = useMemo(() =>
    materiales.filter(m => !itemsDespacho.some(it => it.material_id === m.id))
  , [materiales, itemsDespacho]);

  const fmtFecha = (s: string) => {
    const d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ── tabs ─────────────────────────────────────────────────────────────────
  const tabStyle = (activo: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 600,
    color: activo ? azul : textMuted, cursor: 'pointer',
    borderBottom: activo ? `2px solid ${azul}` : `1px solid ${border}`,
    background: 'transparent',
  });

  // ============================================================
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Bodega central</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <IonRefresher slot="fixed" onIonRefresh={onRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div style={{ padding: 16, paddingBottom: 40 }}>

          {proyecto && (
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>
              {proyecto.nombre}
            </div>
          )}

          {/* ── Tabs ──────────────────────────────────────────── */}
          <div style={{ display: 'flex', marginBottom: 14 }}>
            <div style={tabStyle(tab === 'catalogo')} onClick={() => setTab('catalogo')}>
              Catálogo ({materiales.length})
            </div>
            <div style={tabStyle(tab === 'despachos')} onClick={() => setTab('despachos')}>
              Despachos ({despachos.length})
            </div>
          </div>

          {cargando && <div style={{ textAlign: 'center', padding: 30 }}><IonSpinner name="crescent" /></div>}

          {/* ══════════════════════════════════════════════════════
              TAB CATÁLOGO
              ══════════════════════════════════════════════════════ */}
          {!cargando && tab === 'catalogo' && (
            <>
              {/* Agregar material */}
              <div style={sCard}>
                <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 10 }}>
                  Nuevo material
                </div>
                <input style={{ ...sInput, marginBottom: 8 }} placeholder="Nombre del material"
                  value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input style={{ ...sInput, flex: 1 }} placeholder="Unidad (ej. UN, ML, MT)"
                    value={unidadNuevo} onChange={e => setUnidadNuevo(e.target.value)} />
                  <input style={{ ...sInput, flex: 1 }} type="number" placeholder="Total teórico"
                    value={teoricoNuevo} onChange={e => setTeoricoNuevo(e.target.value)} />
                </div>
                <button style={sBtnPrimary} disabled={creando} onClick={crearMaterial}>
                  {creando ? 'Creando...' : '+ Agregar material'}
                </button>
              </div>

              {/* Lista de materiales */}
              {materiales.length === 0 && (
                <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: 20 }}>
                  No hay materiales de bodega central en este proyecto.
                </div>
              )}

              {materiales.map(m => {
                const editando = editandoId === m.id;
                return (
                  <div key={m.id} style={sCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{m.nombre}</div>
                        <div style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>
                          {m.unidad ?? 'sin unidad'}
                        </div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: m.stock_actual > 0 ? verde : m.stock_actual < 0 ? rojo : textMuted }}>
                        {m.stock_actual}
                      </div>
                    </div>

                    {/* Números clave */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: azulBg, color: azul }}>
                        Teórico: {m.total_teorico}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: verdeBg, color: verde }}>
                        Despachado: {m.despachado}
                      </span>
                      {m.por_despachar > 0 && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: dark ? 'rgba(251,191,36,0.08)' : '#fffbeb', color: amarillo }}>
                          Por despachar: {m.por_despachar}
                        </span>
                      )}
                      {m.entregado > 0 && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: dark ? 'rgba(248,113,113,0.08)' : '#fef2f2', color: rojo }}>
                          Entregado: {m.entregado}
                        </span>
                      )}
                    </div>

                    {/* Edición inline de nombre, teórico y unidad */}
                    {editando ? (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }}>
                        <input style={{ ...sInput, marginBottom: 8 }} placeholder="Nombre del material"
                          value={editNombreVal} onChange={e => setEditNombreVal(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input style={{ ...sInput, flex: 1 }} placeholder="Unidad" value={editUnidadVal}
                            onChange={e => setEditUnidadVal(e.target.value)} />
                          <input style={{ ...sInput, flex: 1 }} type="number" placeholder="Total teórico" value={editTeoricoVal}
                            onChange={e => setEditTeoricoVal(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={guardarEdicion} style={{ ...sBtnPrimary, flex: 1, padding: '10px 0' }}>Guardar</button>
                          <button onClick={() => setEditandoId(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
                        </div>
                        <button
                          onClick={() => eliminarMaterial(m)}
                          disabled={eliminandoId === m.id}
                          style={{
                            width: '100%', marginTop: 8, padding: '10px 0', borderRadius: 12,
                            background: 'transparent', border: `0.5px solid ${rojo}`, color: rojo,
                            cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            opacity: eliminandoId === m.id ? 0.6 : 1,
                          }}
                        >
                          {eliminandoId === m.id ? 'Eliminando...' : '🗑 Eliminar del catálogo'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${border}` }}>
                        <span onClick={() => iniciarEdicion(m)} style={{ fontSize: 12, color: azul, cursor: 'pointer' }}>
                          Editar / eliminar
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB DESPACHOS
              ══════════════════════════════════════════════════════ */}
          {!cargando && tab === 'despachos' && (
            <>
              {/* Registrar nuevo despacho */}
              <div style={sCard}>
                <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 10 }}>
                  Registrar despacho
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input style={{ ...sInput, flex: 2 }} placeholder="N° guía (opcional — vacío si es caja chica)"
                    value={numGuia} onChange={e => setNumGuia(e.target.value)} />
                  <input style={{ ...sInput, flex: 1 }} type="date"
                    value={fechaDespacho} onChange={e => setFechaDespacho(e.target.value)} />
                </div>
                <input style={{ ...sInput, marginBottom: 10 }} placeholder="Notas (opcional)"
                  value={notasDespacho} onChange={e => setNotasDespacho(e.target.value)} />

                <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 6 }}>
                  Materiales en este despacho
                </div>

                {itemsDespacho.map((it, idx) => {
                  const matSel = materiales.find(m => m.id === it.material_id);
                  return (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <select
                        style={{ ...sInput, flex: 3 }}
                        value={it.material_id}
                        onChange={e => actualizarItemDespacho(idx, 'material_id', e.target.value)}
                      >
                        <option value="">Selecciona material</option>
                        {materiales.map(m => (
                          <option key={m.id} value={m.id}
                            disabled={itemsDespacho.some((x, xi) => xi !== idx && x.material_id === m.id)}
                          >
                            {m.nombre}{m.unidad ? ` (${m.unidad})` : ''}
                          </option>
                        ))}
                      </select>
                      <input style={{ ...sInput, flex: 1, textAlign: 'right' }} type="number" min="0"
                        placeholder="Cant." value={it.cantidad}
                        onChange={e => actualizarItemDespacho(idx, 'cantidad', e.target.value)} />
                      <span onClick={() => quitarItemDespacho(idx)} style={{ color: rojo, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</span>
                    </div>
                  );
                })}

                <button onClick={agregarItemDespacho}
                  style={{ width: '100%', padding: '8px 0', borderRadius: 10, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 13, cursor: 'pointer', marginBottom: 10 }}>
                  + Agregar material al despacho
                </button>

                <button style={sBtnPrimary} disabled={guardandoDespacho} onClick={guardarDespacho}>
                  {guardandoDespacho ? 'Registrando...' : 'Registrar despacho'}
                </button>
              </div>

              {/* Historial de despachos */}
              {despachos.length === 0 && (
                <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: 20 }}>
                  No hay despachos registrados.
                </div>
              )}

              {despachos.map(d => (
                <div key={d.id} style={sCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: textPrimary }}>
                        {d.numero_guia ? `Guía ${d.numero_guia}` : '🧾 Caja chica (sin guía)'}
                      </div>
                      <div style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>
                        {fmtFecha(d.fecha_despacho)}
                        {d.usuarios?.nombre ? ` · ${d.usuarios.nombre}` : ''}
                      </div>
                      {d.notas && <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>{d.notas}</div>}
                    </div>
                    <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: verdeBg, color: verde, fontWeight: 600 }}>
                      {d.items.length} mat.
                    </span>
                  </div>

                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${border}` }}>
                    {d.items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                        <span style={{ color: textPrimary }}>{it.nombre}</span>
                        <span style={{ color: textSecondary }}>{it.cantidad}{it.unidad ? ` ${it.unidad}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

        </div>
      </IonContent>

      <IonToast isOpen={!!toastMsg} message={toastMsg} duration={2500} color={toastColor} onDidDismiss={() => setToastMsg('')} />
    </IonPage>
  );
};

export default BodegaCentral;
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

interface MaterialStock {
  id: string;
  nombre: string;
  unidad: string | null;        // unidad granular (la que se muestra por defecto)
  unidad_compra: string | null; // unidad de empaque
  factor_conversion: number;
  stock_actual: number;
  fuente: string;
}

interface PrestamoItem {
  id: string;
  material_id: string;
  cantidad_prestada: number;
  cantidad_devuelta: number;
  nombre: string;
  unidad: string | null;
  unidad_registro: string | null;  // la unidad en la que se registró el préstamo
}

interface Devolucion {
  id: string;
  numero_guia: string;
  fecha_devolucion: string;
  items: { prestamo_item_id: string; cantidad: number }[];
}

interface Prestamo {
  id: string;
  obra_destino: string;
  numero_guia: string;
  fecha_prestamo: string;
  estado: string;
  notas: string | null;
  retira_nombre: string | null;
  creado_en: string;
  usuarios: { nombre: string } | null;
  items: PrestamoItem[];
  devoluciones: Devolucion[];
}

// ============================================================
const PrestamosMaterial: React.FC = () => {
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
  const amarilloBg   = dark ? 'rgba(251,191,36,0.08)' : '#fffbeb';
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
  const [tab, setTab] = useState<'nuevo' | 'prestamos'>('prestamos');
  const [cargando, setCargando] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  // Materiales disponibles (para el formulario de nuevo préstamo)
  const [materiales, setMateriales] = useState<MaterialStock[]>([]);
  const [proyectos, setProyectos] = useState<{ id: string; nombre: string }[]>([]);

  // Formulario nuevo préstamo
  const [obraDestino, setObraDestino] = useState('');
  const [retiraNombre, setRetiraNombre] = useState('');
  const [numGuia, setNumGuia] = useState('');
  const [fechaPrestamo, setFechaPrestamo] = useState(new Date().toISOString().slice(0, 10));
  const [notasPrestamo, setNotasPrestamo] = useState('');
  const [itemsPrestamo, setItemsPrestamo] = useState<{
    material_id: string;
    cantidad: string;
    busqueda: string;
    unidadElegida: 'solicitud' | 'compra';
  }[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Lista de préstamos
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [devolviendo, setDevolviendo] = useState<Record<string, Record<string, string>>>({});
  const [guiaDevolucion, setGuiaDevolucion] = useState<Record<string, string>>({});
  const [guardandoDevolucion, setGuardandoDevolucion] = useState(false);

  // ── carga ───────────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async (proyectoId: string) => {
    setCargando(true);

    // Lista de proyectos (para elegir obra destino, excluyendo el actual)
    const { data: proyData } = await supabase
      .from('proyectos')
      .select('id, nombre')
      .neq('id', proyectoId)
      .order('nombre');
    setProyectos(((proyData as any[]) ?? []).map(p => ({ id: p.id, nombre: p.nombre })));

    // Materiales con stock (para seleccionar al prestar)
    const { data: stockData } = await supabase
      .from('bodega_stock_actual')
      .select('material_id, nombre, unidad, unidad_compra, factor_conversion, stock_actual, fuente')
      .eq('proyecto_id', proyectoId)
      .order('nombre');
    setMateriales(((stockData as any[]) ?? []).map(r => ({
      id: r.material_id, nombre: r.nombre, unidad: r.unidad,
      unidad_compra: r.unidad_compra ?? r.unidad,
      factor_conversion: r.factor_conversion ?? 1,
      stock_actual: r.stock_actual ?? 0, fuente: r.fuente ?? 'ayni',
    })));

    // Préstamos con items
    const { data: prestData } = await supabase
      .from('bodega_prestamos')
      .select('id, obra_destino, numero_guia, fecha_prestamo, estado, notas, retira_nombre, creado_en, usuarios ( nombre )')
      .eq('proyecto_id', proyectoId)
      .order('fecha_prestamo', { ascending: false });

    const base = ((prestData as any[]) ?? []).map(p => ({ ...p, items: [] as PrestamoItem[], devoluciones: [] as Devolucion[] }));

    if (base.length > 0) {
      const ids = base.map(p => p.id);

      // Items del préstamo
      const { data: itemsData } = await supabase
        .from('bodega_prestamo_items')
        .select('id, prestamo_id, material_id, cantidad_prestada, cantidad_devuelta, unidad_registro, bodega_materiales ( nombre, unidad )')
        .in('prestamo_id', ids);
      const porPrestamo: Record<string, PrestamoItem[]> = {};
      for (const it of (itemsData as any[]) ?? []) {
        const pid = it.prestamo_id;
        if (!porPrestamo[pid]) porPrestamo[pid] = [];
        porPrestamo[pid].push({
          id: it.id, material_id: it.material_id,
          cantidad_prestada: it.cantidad_prestada, cantidad_devuelta: it.cantidad_devuelta,
          nombre: it.bodega_materiales?.nombre ?? 'Material',
          unidad: it.bodega_materiales?.unidad ?? null,
          unidad_registro: it.unidad_registro ?? it.bodega_materiales?.unidad ?? null,
        });
      }
      base.forEach(p => { p.items = porPrestamo[p.id] ?? []; });

      // Devoluciones con sus items
      const { data: devData } = await supabase
        .from('bodega_devoluciones')
        .select('id, prestamo_id, numero_guia, fecha_devolucion')
        .in('prestamo_id', ids)
        .order('fecha_devolucion', { ascending: false });

      if (devData && devData.length > 0) {
        const devIds = (devData as any[]).map(d => d.id);
        const { data: devItemsData } = await supabase
          .from('bodega_devolucion_items')
          .select('devolucion_id, prestamo_item_id, cantidad')
          .in('devolucion_id', devIds);

        const devItemsPorDev: Record<string, { prestamo_item_id: string; cantidad: number }[]> = {};
        for (const di of (devItemsData as any[]) ?? []) {
          if (!devItemsPorDev[di.devolucion_id]) devItemsPorDev[di.devolucion_id] = [];
          devItemsPorDev[di.devolucion_id].push({ prestamo_item_id: di.prestamo_item_id, cantidad: di.cantidad });
        }

        const devPorPrestamo: Record<string, Devolucion[]> = {};
        for (const d of (devData as any[])) {
          if (!devPorPrestamo[d.prestamo_id]) devPorPrestamo[d.prestamo_id] = [];
          devPorPrestamo[d.prestamo_id].push({
            id: d.id, numero_guia: d.numero_guia, fecha_devolucion: d.fecha_devolucion,
            items: devItemsPorDev[d.id] ?? [],
          });
        }
        base.forEach(p => { p.devoluciones = devPorPrestamo[p.id] ?? []; });
      }
    }

    setPrestamos(base as Prestamo[]);
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

  // ── Nuevo préstamo ─────────────────────────────────────────────────────
  const agregarItem = () => setItemsPrestamo(prev => [...prev, { material_id: '', cantidad: '', busqueda: '', unidadElegida: 'solicitud' }]);

  const seleccionarMaterial = (idx: number, mat: MaterialStock) => {
    setItemsPrestamo(prev => prev.map((it, i) => (i === idx ? { ...it, material_id: mat.id, busqueda: mat.nombre, unidadElegida: 'solicitud' } : it)));
  };

  const actualizarItem = (idx: number, campo: string, valor: string) =>
    setItemsPrestamo(prev => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));

  const quitarItem = (idx: number) => setItemsPrestamo(prev => prev.filter((_, i) => i !== idx));

  const guardarPrestamo = async () => {
    if (!proyecto) return;
    if (!obraDestino.trim()) { setToastColor('danger'); setToastMsg('Ingresa la obra destino'); return; }
    if (!numGuia.trim()) { setToastColor('danger'); setToastMsg('Ingresa el N° de guía'); return; }
    const validos = itemsPrestamo.filter(it => it.material_id && parseFloat(it.cantidad) > 0);
    if (validos.length === 0) { setToastColor('danger'); setToastMsg('Agrega al menos un material'); return; }

    // Se guarda la cantidad TAL CUAL la ingresó el usuario, sin convertir.
    // La unidad elegida se guarda en unidad_registro para que la vista sepa
    // si debe aplicar conversión al calcular el stock.
    const itemsParaGuardar = validos.map(it => {
      const mat = materiales.find(m => m.id === it.material_id);
      const unidadUsada = it.unidadElegida === 'compra' ? (mat?.unidad_compra ?? mat?.unidad ?? '') : (mat?.unidad ?? '');
      return {
        material_id: it.material_id,
        cantidad: parseFloat(it.cantidad),
        unidad_registro: unidadUsada,
      };
    });

    setGuardando(true);
    const { data: authData } = await supabase.auth.getUser();

    const { data: prest, error: errPrest } = await supabase
      .from('bodega_prestamos')
      .insert({
        proyecto_id: proyecto.id, obra_destino: obraDestino.trim(),
        numero_guia: numGuia.trim(), fecha_prestamo: fechaPrestamo,
        retira_nombre: retiraNombre.trim() || null,
        notas: notasPrestamo.trim() || null,
        registrado_por: authData?.user?.id ?? null,
      })
      .select('id')
      .single();

    if (errPrest || !prest) {
      setGuardando(false);
      setToastColor('danger');
      setToastMsg('No se pudo registrar: ' + (errPrest?.message ?? 'error'));
      return;
    }

    const rows = itemsParaGuardar.map(it => ({
      prestamo_id: prest.id, material_id: it.material_id,
      cantidad_prestada: it.cantidad, cantidad_devuelta: 0,
      unidad_registro: it.unidad_registro,
    }));
    const { error: errItems } = await supabase.from('bodega_prestamo_items').insert(rows);
    setGuardando(false);

    if (errItems) {
      setToastColor('danger');
      setToastMsg('Préstamo creado pero falló al guardar materiales: ' + errItems.message);
      return;
    }

    setObraDestino(''); setRetiraNombre(''); setNumGuia(''); setNotasPrestamo(''); setItemsPrestamo([]);
    setFechaPrestamo(new Date().toISOString().slice(0, 10));
    setToastColor('success');
    setToastMsg(`Préstamo registrado: guía ${numGuia.trim()}`);
    setTab('prestamos');
    await cargarDatos(proyecto.id);
  };

  // ── Devolución ─────────────────────────────────────────────────────────
  const iniciarDevolucion = (prestamo: Prestamo) => {
    setExpandido(prestamo.id);
    const vals: Record<string, string> = {};
    prestamo.items.forEach(it => { vals[it.id] = ''; });
    setDevolviendo(prev => ({ ...prev, [prestamo.id]: vals }));
    setGuiaDevolucion(prev => ({ ...prev, [prestamo.id]: '' }));
  };

  const guardarDevolucion = async (prestamo: Prestamo) => {
    const vals = devolviendo[prestamo.id];
    const guia = guiaDevolucion[prestamo.id]?.trim();
    if (!vals) return;
    if (!guia) { setToastColor('danger'); setToastMsg('Ingresa el N° de guía de devolución'); return; }

    const updates: { id: string; nueva_devuelta: number; cantidad: number }[] = [];
    for (const item of prestamo.items) {
      const input = parseFloat(vals[item.id] ?? '');
      if (!input || input <= 0) continue;
      const maxDevolvible = item.cantidad_prestada - item.cantidad_devuelta;
      const devolver = Math.min(input, maxDevolvible);
      if (devolver > 0) {
        updates.push({ id: item.id, nueva_devuelta: item.cantidad_devuelta + devolver, cantidad: devolver });
      }
    }

    if (updates.length === 0) {
      setToastColor('danger'); setToastMsg('Ingresa al menos una cantidad a devolver'); return;
    }

    setGuardandoDevolucion(true);
    const { data: authData } = await supabase.auth.getUser();

    // 1) Crear registro de devolución con su guía
    const { data: devolucion, error: errDev } = await supabase
      .from('bodega_devoluciones')
      .insert({
        prestamo_id: prestamo.id,
        numero_guia: guia,
        fecha_devolucion: new Date().toISOString().slice(0, 10),
        registrado_por: authData?.user?.id ?? null,
      })
      .select('id')
      .single();

    if (errDev || !devolucion) {
      setGuardandoDevolucion(false);
      setToastColor('danger');
      setToastMsg('No se pudo registrar la devolución: ' + (errDev?.message ?? 'error'));
      return;
    }

    // 2) Items de la devolución (registro de qué se devolvió en esta guía)
    const devItems = updates.map(up => ({
      devolucion_id: devolucion.id,
      prestamo_item_id: up.id,
      cantidad: up.cantidad,
    }));
    await supabase.from('bodega_devolucion_items').insert(devItems);

    // 3) Actualizar cantidad_devuelta acumulada en prestamo_items
    for (const up of updates) {
      await supabase.from('bodega_prestamo_items')
        .update({ cantidad_devuelta: up.nueva_devuelta })
        .eq('id', up.id);
    }

    // 4) Actualizar estado del préstamo
    const { data: itemsActualizados } = await supabase
      .from('bodega_prestamo_items')
      .select('cantidad_prestada, cantidad_devuelta')
      .eq('prestamo_id', prestamo.id);

    const items = (itemsActualizados as any[]) ?? [];
    const todoDevuelto = items.every(it => it.cantidad_devuelta >= it.cantidad_prestada);
    const algunoDevuelto = items.some(it => it.cantidad_devuelta > 0);
    const nuevoEstado = todoDevuelto ? 'devuelto' : algunoDevuelto ? 'devuelto_parcial' : 'prestado';

    await supabase.from('bodega_prestamos')
      .update({ estado: nuevoEstado })
      .eq('id', prestamo.id);

    setGuardandoDevolucion(false);
    setExpandido(null);
    setToastColor('success');
    setToastMsg(todoDevuelto ? `Préstamo devuelto completamente (guía ${guia})` : `Devolución parcial registrada (guía ${guia})`);
    if (proyecto) await cargarDatos(proyecto.id);
  };

  // ── helpers ─────────────────────────────────────────────────────────────
  const fmtFecha = (s: string) => {
    const d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const estadoLabel = (estado: string) => {
    if (estado === 'devuelto') return { text: 'Devuelto', color: verde, bg: verdeBg };
    if (estado === 'devuelto_parcial') return { text: 'Parcial', color: amarillo, bg: amarilloBg };
    return { text: 'Prestado', color: rojo, bg: dark ? 'rgba(248,113,113,0.08)' : '#fef2f2' };
  };

  const prestamosActivos = useMemo(() => prestamos.filter(p => p.estado !== 'devuelto'), [prestamos]);
  const prestamosDevueltos = useMemo(() => prestamos.filter(p => p.estado === 'devuelto'), [prestamos]);

  const tabStyle = (activo: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 600,
    color: activo ? azul : textMuted, cursor: 'pointer',
    borderBottom: activo ? `2px solid ${azul}` : `1px solid ${border}`,
    background: 'transparent',
  });

  // ── render de un préstamo ───────────────────────────────────────────────
  const renderPrestamo = (p: Prestamo) => {
    const est = estadoLabel(p.estado);
    const isExpanded = expandido === p.id;
    const vals = devolviendo[p.id] ?? {};

    return (
      <div key={p.id} style={sCard}>
        <div
          onClick={() => setExpandido(isExpanded ? null : p.id)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: textPrimary }}>
                Guía {p.numero_guia}
              </div>
              <div style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>
                {fmtFecha(p.fecha_prestamo)} → {p.obra_destino}
                {p.retira_nombre ? ` · Retira: ${p.retira_nombre}` : ''}
                {p.usuarios?.nombre ? ` · Emisor: ${p.usuarios.nombre}` : ''}
              </div>
              {p.notas && <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>{p.notas}</div>}
            </div>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: est.bg, color: est.color, fontWeight: 600, flexShrink: 0 }}>
              {est.text}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }}>
            {p.estado !== 'devuelto' && devolviendo[p.id] && (
              <div style={{ marginBottom: 10 }}>
                <input
                  style={{ ...sInput, marginBottom: 8 }}
                  placeholder="N° guía de devolución"
                  value={guiaDevolucion[p.id] ?? ''}
                  onChange={e => setGuiaDevolucion(prev => ({ ...prev, [p.id]: e.target.value }))}
                />
              </div>
            )}

            {p.items.map(it => {
              const pendiente = it.cantidad_prestada - it.cantidad_devuelta;
              const uni = it.unidad_registro ?? it.unidad ?? '';
              return (
                <div key={it.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: textPrimary, flex: 1 }}>{it.nombre}</span>
                    <div style={{ display: 'flex', gap: 8, fontSize: 12, color: textSecondary }}>
                      <span>Prestado: {it.cantidad_prestada} {uni}</span>
                      {it.cantidad_devuelta > 0 && <span style={{ color: verde }}>Dev: {it.cantidad_devuelta}</span>}
                      {pendiente > 0 && <span style={{ color: amarillo }}>Pend: {pendiente}</span>}
                    </div>
                  </div>

                  {/* Input de devolución (solo si hay pendiente) */}
                  {p.estado !== 'devuelto' && pendiente > 0 && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                      <input
                        style={{ ...sInput, flex: 1, height: 34, fontSize: 13 }}
                        type="number" min="0" max={pendiente}
                        placeholder={`Devolver (máx ${pendiente})`}
                        value={vals[it.id] ?? ''}
                        onChange={e => setDevolviendo(prev => ({
                          ...prev,
                          [p.id]: { ...prev[p.id], [it.id]: e.target.value },
                        }))}
                      />
                      <span style={{ fontSize: 11, color: textMuted }}>{uni}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Historial de devoluciones registradas */}
            {p.devoluciones.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }}>
                <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 6 }}>
                  Devoluciones registradas
                </div>
                {p.devoluciones.map(dev => (
                  <div key={dev.id} style={{ fontSize: 12, color: textSecondary, marginBottom: 6, padding: '4px 8px', borderRadius: 8, background: verdeBg }}>
                    <span style={{ fontWeight: 600, color: verde }}>Guía {dev.numero_guia}</span>
                    <span> · {fmtFecha(dev.fecha_devolucion)}</span>
                    {dev.items.map(di => {
                      const itemOrig = p.items.find(it => it.id === di.prestamo_item_id);
                      return (
                        <div key={di.prestamo_item_id} style={{ paddingLeft: 8, marginTop: 2 }}>
                          {itemOrig?.nombre ?? 'Material'}: {di.cantidad} {itemOrig?.unidad_registro ?? ''}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {p.estado !== 'devuelto' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {!devolviendo[p.id] ? (
                  <button
                    onClick={() => iniciarDevolucion(p)}
                    style={{ ...sBtnPrimary, background: verde, padding: '10px 0' }}
                  >
                    Registrar devolución
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => guardarDevolucion(p)}
                      disabled={guardandoDevolucion}
                      style={{ ...sBtnPrimary, flex: 1, background: verde, padding: '10px 0' }}
                    >
                      {guardandoDevolucion ? 'Guardando...' : 'Confirmar devolución'}
                    </button>
                    <button
                      onClick={() => { setDevolviendo(prev => { const n = { ...prev }; delete n[p.id]; return n; }); }}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, cursor: 'pointer', fontSize: 13 }}
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Préstamos entre obras</IonTitle>
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

          {/* ── Tabs ──────────────────────────────────────────── */}
          <div style={{ display: 'flex', marginBottom: 14 }}>
            <div style={tabStyle(tab === 'prestamos')} onClick={() => setTab('prestamos')}>
              Préstamos ({prestamosActivos.length} activos)
            </div>
            <div style={tabStyle(tab === 'nuevo')} onClick={() => setTab('nuevo')}>
              Nuevo préstamo
            </div>
          </div>

          {cargando && <div style={{ textAlign: 'center', padding: 30 }}><IonSpinner name="crescent" /></div>}

          {/* ══════════════════════════════════════════════════════
              TAB PRÉSTAMOS
              ══════════════════════════════════════════════════════ */}
          {!cargando && tab === 'prestamos' && (
            <>
              {prestamos.length === 0 && (
                <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: 20 }}>
                  No hay préstamos registrados.
                </div>
              )}

              {/* Activos primero */}
              {prestamosActivos.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                    Activos ({prestamosActivos.length})
                  </div>
                  {prestamosActivos.map(renderPrestamo)}
                </>
              )}

              {/* Devueltos después */}
              {prestamosDevueltos.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, margin: '16px 0 8px' }}>
                    Devueltos ({prestamosDevueltos.length})
                  </div>
                  {prestamosDevueltos.map(renderPrestamo)}
                </>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB NUEVO PRÉSTAMO
              ══════════════════════════════════════════════════════ */}
          {!cargando && tab === 'nuevo' && (
            <div style={sCard}>
              <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 10 }}>
                Registrar préstamo
              </div>

              <select style={{ ...sInput, marginBottom: 8 }}
                value={obraDestino} onChange={e => setObraDestino(e.target.value)}>
                <option value="">Selecciona la obra destino</option>
                {proyectos.map(p => (
                  <option key={p.id} value={p.nombre}>{p.nombre}</option>
                ))}
              </select>

              <input style={{ ...sInput, marginBottom: 8 }} placeholder="Nombre de quien retira (opcional)"
                value={retiraNombre} onChange={e => setRetiraNombre(e.target.value)} />

              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input style={{ ...sInput, flex: 2 }} placeholder="N° guía de despacho"
                  value={numGuia} onChange={e => setNumGuia(e.target.value)} />
                <input style={{ ...sInput, flex: 1 }} type="date"
                  value={fechaPrestamo} onChange={e => setFechaPrestamo(e.target.value)} />
              </div>

              <input style={{ ...sInput, marginBottom: 10 }} placeholder="Notas (opcional)"
                value={notasPrestamo} onChange={e => setNotasPrestamo(e.target.value)} />

              <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 6 }}>
                Materiales a prestar
              </div>

              {itemsPrestamo.map((it, idx) => {
                const matSel = materiales.find(m => m.id === it.material_id);
                const yaUsados = new Set(itemsPrestamo.filter((x, xi) => xi !== idx && x.material_id).map(x => x.material_id));
                const sugerencias = it.busqueda.trim() && !it.material_id
                  ? materiales.filter(m => !yaUsados.has(m.id) && m.stock_actual > 0 && m.nombre.toLowerCase().includes(it.busqueda.toLowerCase())).slice(0, 6)
                  : [];

                return (
                  <div key={idx} style={{ marginBottom: 10, padding: '8px 0', borderBottom: `0.5px solid ${border}` }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{ flex: 3, position: 'relative' }}>
                        <input
                          style={sInput}
                          placeholder="Buscar material..."
                          value={it.material_id ? (matSel?.nombre ?? '') : it.busqueda}
                          onChange={e => {
                            setItemsPrestamo(prev => prev.map((x, i) => (i === idx ? { ...x, busqueda: e.target.value, material_id: '' } : x)));
                          }}
                        />
                        {sugerencias.length > 0 && (
                          <div style={{ position: 'absolute', zIndex: 10, width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
                            {sugerencias.map(m => (
                              <div key={m.id} onClick={() => seleccionarMaterial(idx, m)}
                                style={{ padding: '8px 12px', fontSize: 13, color: textPrimary, cursor: 'pointer', borderBottom: `0.5px solid ${border}` }}>
                                {m.nombre}
                                <span style={{ color: textMuted, fontSize: 11 }}> · {m.stock_actual}{m.unidad ? ` ${m.unidad}` : ''} disp.</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <input style={{ ...sInput, flex: 1, textAlign: 'right' }} type="number" min="0"
                        placeholder="Cant." value={it.cantidad}
                        onChange={e => actualizarItem(idx, 'cantidad', e.target.value)} />
                      <span onClick={() => quitarItem(idx)} style={{ color: rojo, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</span>
                    </div>

                    {/* Selector de unidad (solo si el material tiene conversión) */}
                    {matSel && matSel.factor_conversion !== 1 && matSel.unidad_compra && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button
                          onClick={() => actualizarItem(idx, 'unidadElegida', 'solicitud')}
                          style={{
                            flex: 1, height: 30, borderRadius: 8, fontSize: 11, cursor: 'pointer',
                            border: `0.5px solid ${it.unidadElegida === 'solicitud' ? azul : border}`,
                            background: it.unidadElegida === 'solicitud' ? azulBg : 'transparent',
                            color: it.unidadElegida === 'solicitud' ? azul : textSecondary,
                          }}
                        >
                          En {matSel.unidad}
                        </button>
                        <button
                          onClick={() => actualizarItem(idx, 'unidadElegida', 'compra')}
                          style={{
                            flex: 1, height: 30, borderRadius: 8, fontSize: 11, cursor: 'pointer',
                            border: `0.5px solid ${it.unidadElegida === 'compra' ? azul : border}`,
                            background: it.unidadElegida === 'compra' ? azulBg : 'transparent',
                            color: it.unidadElegida === 'compra' ? azul : textSecondary,
                          }}
                        >
                          En {matSel.unidad_compra}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <button onClick={agregarItem}
                style={{ width: '100%', padding: '8px 0', borderRadius: 10, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 13, cursor: 'pointer', marginBottom: 10 }}>
                + Agregar material
              </button>

              <button style={sBtnPrimary} disabled={guardando} onClick={guardarPrestamo}>
                {guardando ? 'Registrando...' : 'Registrar préstamo'}
              </button>
            </div>
          )}

        </div>
      </IonContent>

      <IonToast isOpen={!!toastMsg} message={toastMsg} duration={2500} color={toastColor} onDidDismiss={() => setToastMsg('')} />
    </IonPage>
  );
};

export default PrestamosMaterial;
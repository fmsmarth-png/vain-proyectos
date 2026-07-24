import {
  IonContent, IonPage, IonHeader, IonToolbar, IonTitle,
  IonButtons, IonMenuButton, IonSpinner, IonIcon,
} from '@ionic/react';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { Capacitor } from '@capacitor/core';
import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  chevronDown, chevronForward, downloadOutline,
  refreshOutline, searchOutline,
} from 'ionicons/icons';

/**
 * Reporte OG — apartado analítico de solo lectura sobre og_registros.
 * Consume la vista `og_reparaciones` (registro + item_revision + accion + ubicación).
 *
 * Filtros estilo AUTOFILTRO de Excel:
 *  - Cada columna es filtrable con multi-selección (varios valores por columna).
 *  - Todos los filtros se combinan a la vez (AND entre columnas).
 *  - Los conteos de cada opción reflejan los demás filtros activos (como Excel).
 *  - Vista "Resumen" = tabla dinámica: eliges "Agrupar por" y ves el desglose por acción.
 *  - Export a Excel del set filtrado (formato largo + autofiltro).
 *
 * Cableado (lo haces tú, como quedamos):
 *  - Ruta en App.tsx:  <Route path="/reporte-og" component={ReporteOG} exact />
 *  - Entrada en MenuLateral.tsx (gateada por el permiso que administres desde Admin).
 */

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Row {
  id: string;
  proyecto: string | null;
  torre: string | null;
  frente: string | null;
  depto: number | string | null;
  id_obra: string | null;
  tipo_depto: string | null;
  ambiente: string | null;
  elemento: string | null;
  tipo_elemento: string | null;
  tipo_revision: string | null;
  item_revision: string | null;
  tolerancia: string | null;
  accion: string | null;
  creado_en: string | null;
  es_importado: boolean | null;
}

type DimKey =
  | 'torre' | 'tipo_depto' | 'ambiente' | 'elemento'
  | 'item_revision' | 'accion' | 'depto' | 'tolerancia';

const DIMENSIONES: { key: DimKey; label: string; buscador: boolean }[] = [
  { key: 'torre',         label: 'Torre',             buscador: false },
  { key: 'tipo_depto',    label: 'Tipo depto',        buscador: false },
  { key: 'ambiente',      label: 'Ambiente',          buscador: false },
  { key: 'elemento',      label: 'Elemento',          buscador: true  },
  { key: 'item_revision', label: 'Ítem de revisión',  buscador: false },
  { key: 'accion',        label: 'Acción',            buscador: false },
  { key: 'depto',         label: 'Depto',             buscador: true  },
  { key: 'tolerancia',    label: 'Tolerancia',        buscador: true  },
];

// Dimensiones para "Agrupar por" (tabla dinámica)
const AGRUPABLES: { key: DimKey; label: string }[] = [
  { key: 'torre',         label: 'Torre' },
  { key: 'depto',         label: 'Depto' },
  { key: 'ambiente',      label: 'Ambiente' },
  { key: 'elemento',      label: 'Elemento' },
  { key: 'item_revision', label: 'Ítem de revisión' },
  { key: 'tipo_depto',    label: 'Tipo depto' },
  { key: 'tolerancia',    label: 'Tolerancia' },
];

// Orden y color de acciones
const ACCIONES = ['picar', 'copa', 'yeso', 'albañilería', 'revisar'] as const;
const COLOR_ACCION: Record<string, string> = {
  picar: '#ef4444',
  copa: '#f59e0b',
  yeso: '#8b5cf6',
  'albañilería': '#3b82f6',
  revisar: '#6b7280',
};

const NULO = '—';
const val = (r: Row, k: DimKey): string => {
  const v = (r as any)[k];
  return v === null || v === undefined || v === '' ? NULO : String(v);
};

// ── Componente ────────────────────────────────────────────────────────────────
const ReporteOG: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg            = dark ? '#000000' : '#f3f4f6';
  const card          = dark ? '#111111' : '#ffffff';
  const border        = dark ? '#222222' : '#e5e7eb';
  const textPrimary   = dark ? '#f9fafb' : '#111827';
  const textSecondary = '#6b7280';
  const textMuted     = dark ? '#4b5563' : '#9ca3af';
  const toolbar       = dark ? '#111111' : '#1e3a5f';
  const inputBg       = dark ? '#1a1a1a' : '#ffffff';
  const rowAlt        = dark ? '#161616' : '#f9fafb';

  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [filtros, setFiltros]     = useState<Record<string, string[]>>({}); // [] o ausente = todos
  const [abiertos, setAbiertos]   = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda]   = useState<Record<string, string>>({});
  const [panelAbierto, setPanel]  = useState(true);

  const [vista, setVista]         = useState<'detalle' | 'resumen'>('resumen');
  const [agruparPor, setAgrupar]  = useState<DimKey>('depto');

  // ── Carga ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Sesión no válida. Vuelve a iniciar sesión.'); setLoading(false); return; }

      const { data, error } = await supabase
        .from('og_reparaciones')
        .select('*')
        .order('torre', { ascending: true })
        .order('depto', { ascending: true });

      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, []);

  // ── Opciones por dimensión (universo completo) ─────────────────────────────
  const opciones = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const d of DIMENSIONES) {
      const s = new Set<string>();
      rows.forEach((r) => s.add(val(r, d.key)));
      o[d.key] = Array.from(s).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    }
    return o;
  }, [rows]);

  // ── Filas que pasan TODOS los filtros ──────────────────────────────────────
  const filtradas = useMemo(() => rows.filter((r) =>
    DIMENSIONES.every((d) => {
      const sel = filtros[d.key];
      if (!sel || sel.length === 0) return true;
      return sel.includes(val(r, d.key));
    })
  ), [rows, filtros]);

  // Filas que pasan todos los filtros MENOS uno (para conteos estilo Excel)
  const filtradasExcepto = (dimKey: string) => rows.filter((r) =>
    DIMENSIONES.every((d) => {
      if (d.key === dimKey) return true;
      const sel = filtros[d.key];
      if (!sel || sel.length === 0) return true;
      return sel.includes(val(r, d.key));
    })
  );

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const k: Record<string, number> = { total: filtradas.length };
    ACCIONES.forEach((a) => (k[a] = 0));
    filtradas.forEach((r) => { const a = r.accion || 'revisar'; k[a] = (k[a] || 0) + 1; });
    return k;
  }, [filtradas]);

  // ── Pivote (tabla dinámica) ────────────────────────────────────────────────
  const pivote = useMemo(() => {
    const map = new Map<string, any>();
    filtradas.forEach((r) => {
      const clave = val(r, agruparPor);
      if (!map.has(clave)) {
        map.set(clave, {
          clave,
          torre: r.torre, frente: r.frente, tipo_depto: r.tipo_depto,
          total: 0, picar: 0, copa: 0, yeso: 0, 'albañilería': 0, revisar: 0,
        });
      }
      const fila = map.get(clave);
      const a = r.accion || 'revisar';
      fila[a] = (fila[a] || 0) + 1;
      fila.total += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtradas, agruparPor]);

  // ── Acciones de UI ─────────────────────────────────────────────────────────
  const toggleAbierto = (dim: string) =>
    setAbiertos((prev) => { const n = new Set(prev); n.has(dim) ? n.delete(dim) : n.add(dim); return n; });

  const toggleValor = (dim: string, valor: string) =>
    setFiltros((prev) => {
      const cur = new Set(prev[dim] || []);
      cur.has(valor) ? cur.delete(valor) : cur.add(valor);
      return { ...prev, [dim]: Array.from(cur) };
    });

  const marcarTodos = (dim: string) => setFiltros((prev) => ({ ...prev, [dim]: [] }));
  const limpiarTodo = () => { setFiltros({}); setBusqueda({}); };

  const filtrosActivos = DIMENSIONES.filter((d) => (filtros[d.key]?.length ?? 0) > 0).length;

  // ── Export Excel (patrón nativo Capacitor: base64 → Filesystem → Share) ────
  const exportar = async () => {
    if (!filtradas.length) return;
    const filas = filtradas.map((r) => ({
      Torre: r.torre ?? '',
      Frente: r.frente ?? '',
      Depto: r.depto ?? '',
      'Tipo depto': r.tipo_depto ?? '',
      Ambiente: r.ambiente ?? '',
      Elemento: r.elemento ?? '',
      'Ítem revisión': r.item_revision ?? '',
      Tolerancia: r.tolerancia ?? '',
      'Acción': r.accion ?? '',
      Fecha: r.creado_en ? new Date(r.creado_en).toLocaleDateString('es-CL') : '',
      Origen: r.es_importado ? 'Histórico' : 'App',
    }));
    const enc = ['Torre', 'Frente', 'Depto', 'Tipo depto', 'Ambiente', 'Elemento',
      'Ítem revisión', 'Tolerancia', 'Acción', 'Fecha', 'Origen'];
    const hoja = XLSX.utils.json_to_sheet(filas, { header: enc });
    hoja['!cols'] = enc.map((h) =>
      h === 'Tolerancia' ? { wch: 28 } : h === 'Elemento' ? { wch: 22 }
        : h === 'Ambiente' ? { wch: 16 } : h === 'Frente' ? { wch: 10 } : { wch: 12 });
    hoja['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: enc.length - 1 } }) };

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Reporte OG');
    const nombre = `Reporte_OG_${new Date().toISOString().slice(0, 10)}.xlsx`;

    if (!Capacitor.isNativePlatform()) { XLSX.writeFile(libro, nombre); return; }
    const base64 = XLSX.write(libro, { bookType: 'xlsx', type: 'base64' });
    const resultado = await Filesystem.writeFile({ path: nombre, data: base64, directory: Directory.Cache });
    await Share.share({ title: nombre, url: resultado.uri, dialogTitle: 'Guardar o compartir Excel' });
  };

  // ── Estilos reutilizables ──────────────────────────────────────────────────
  const tarjeta: React.CSSProperties = {
    background: card, border: `0.5px solid ${border}`, borderRadius: 12, padding: 12, marginBottom: 12,
  };
  const chip = (color: string, activo = true): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
    background: activo ? color + '22' : 'transparent', color: activo ? color : textMuted,
    border: `1px solid ${color}55`, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
  });
  const th: React.CSSProperties = {
    textAlign: 'left', padding: '8px 8px', fontSize: 11, color: textSecondary,
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: `1px solid ${border}`,
  };
  const td: React.CSSProperties = { padding: '8px 8px', fontSize: 13, color: textPrimary, borderBottom: `0.5px solid ${border}` };
  const tdNum: React.CSSProperties = { ...td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' };

  const badge = (accion: string | null) => {
    const a = accion || 'revisar';
    const c = COLOR_ACCION[a] || textMuted;
    return (
      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11,
        fontWeight: 700, color: c, background: c + '1f' }}>{a}</span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#fff' } as any}>
          <IonButtons slot="start"><IonMenuButton /></IonButtons>
          <IonTitle>Reporte OG</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 12, maxWidth: 900, margin: '0 auto' }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <IonSpinner name="crescent" />
              <p style={{ color: textSecondary, marginTop: 8 }}>Cargando registros OG…</p>
            </div>
          )}

          {error && !loading && (
            <div style={{ ...tarjeta, borderColor: '#ef4444' }}>
              <p style={{ color: '#ef4444', margin: 0 }}>{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* KPIs */}
              <div style={{ ...tarjeta, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={chip(dark ? '#e5e7eb' : '#111827')}>
                  Total&nbsp;<b>{kpis.total}</b>
                </span>
                {ACCIONES.map((a) => kpis[a] > 0 && (
                  <span key={a} style={chip(COLOR_ACCION[a])}>{a}&nbsp;<b>{kpis[a]}</b></span>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: textSecondary }}>
                  Mostrando <b style={{ color: textPrimary }}>{filtradas.length}</b> de {rows.length}
                </span>
              </div>

              {/* Panel de filtros (autofiltro Excel) */}
              <div style={tarjeta}>
                <div
                  onClick={() => setPanel((v) => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <IonIcon icon={panelAbierto ? chevronDown : chevronForward} style={{ color: textSecondary }} />
                  <span style={{ fontWeight: 700, color: textPrimary }}>Filtros</span>
                  {filtrosActivos > 0 && (
                    <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                      {filtrosActivos} activos
                    </span>
                  )}
                  {filtrosActivos > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); limpiarTodo(); }}
                      style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary,
                        borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
                    >
                      <IonIcon icon={refreshOutline} /> Limpiar
                    </button>
                  )}
                </div>

                {panelAbierto && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {DIMENSIONES.map((d) => {
                      const abierto = abiertos.has(d.key);
                      const sel = filtros[d.key] || [];
                      const q = (busqueda[d.key] || '').toLowerCase();

                      // Conteos reflejando los OTROS filtros (comportamiento Excel)
                      const universo = abierto ? filtradasExcepto(d.key) : [];
                      const conteo: Record<string, number> = {};
                      universo.forEach((r) => { const v = val(r, d.key); conteo[v] = (conteo[v] || 0) + 1; });

                      const opts = opciones[d.key].filter((o) => !q || o.toLowerCase().includes(q));

                      return (
                        <div key={d.key} style={{ border: `0.5px solid ${border}`, borderRadius: 10, overflow: 'hidden' }}>
                          <div
                            onClick={() => toggleAbierto(d.key)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', background: inputBg }}
                          >
                            <IonIcon icon={abierto ? chevronDown : chevronForward} style={{ color: textSecondary, fontSize: 14 }} />
                            <span style={{ fontWeight: 600, color: textPrimary, fontSize: 14 }}>{d.label}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 12, color: sel.length ? '#3b82f6' : textMuted, fontWeight: 600 }}>
                              {sel.length ? `${sel.length} sel.` : 'Todos'}
                            </span>
                          </div>

                          {abierto && (
                            <div style={{ padding: 10, borderTop: `0.5px solid ${border}` }}>
                              {d.buscador && (
                                <div style={{ position: 'relative', marginBottom: 8 }}>
                                  <IonIcon icon={searchOutline} style={{ position: 'absolute', left: 8, top: 9, color: textMuted, fontSize: 14 }} />
                                  <input
                                    value={busqueda[d.key] || ''}
                                    onChange={(e) => setBusqueda((p) => ({ ...p, [d.key]: e.target.value }))}
                                    placeholder={`Buscar ${d.label.toLowerCase()}…`}
                                    style={{ width: '100%', padding: '7px 8px 7px 28px', borderRadius: 8,
                                      border: `0.5px solid ${border}`, background: bg, color: textPrimary, fontSize: 13, outline: 'none' }}
                                  />
                                </div>
                              )}

                              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                                <button onClick={() => marcarTodos(d.key)}
                                  style={{ fontSize: 11, color: '#3b82f6', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                                  Seleccionar todos
                                </button>
                                {sel.length > 0 && (
                                  <button onClick={() => setFiltros((p) => ({ ...p, [d.key]: [] }))}
                                    style={{ fontSize: 11, color: textSecondary, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    Ninguno
                                  </button>
                                )}
                              </div>

                              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 2 }}>
                                {opts.map((o) => {
                                  const marcado = sel.includes(o);
                                  const n = conteo[o] || 0;
                                  const vacio = n === 0 && !marcado;
                                  return (
                                    <label key={o}
                                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px',
                                        borderRadius: 6, cursor: 'pointer', opacity: vacio ? 0.4 : 1,
                                        background: marcado ? '#3b82f622' : 'transparent' }}>
                                      <input type="checkbox" checked={marcado} onChange={() => toggleValor(d.key, o)}
                                        style={{ accentColor: '#3b82f6', width: 16, height: 16 }} />
                                      <span style={{ fontSize: 13, color: textPrimary, flex: 1 }}>
                                        {d.key === 'accion' ? badge(o) : o}
                                      </span>
                                      <span style={{ fontSize: 11, color: textMuted, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                                    </label>
                                  );
                                })}
                                {opts.length === 0 && (
                                  <span style={{ fontSize: 12, color: textMuted, padding: 6 }}>Sin coincidencias</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selector de vista + export */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', border: `0.5px solid ${border}`, borderRadius: 10, overflow: 'hidden' }}>
                  {(['resumen', 'detalle'] as const).map((v) => (
                    <button key={v} onClick={() => setVista(v)}
                      style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                        background: vista === v ? '#3b82f6' : inputBg, color: vista === v ? '#fff' : textSecondary }}>
                      {v === 'resumen' ? 'Resumen' : 'Detalle'}
                    </button>
                  ))}
                </div>

                {vista === 'resumen' && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: textSecondary }}>Agrupar por</span>
                    <select value={agruparPor} onChange={(e) => setAgrupar(e.target.value as DimKey)}
                      style={{ padding: '7px 10px', borderRadius: 8, border: `0.5px solid ${border}`,
                        background: inputBg, color: textPrimary, fontSize: 13, outline: 'none' }}>
                      {AGRUPABLES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                    </select>
                  </div>
                )}

                <button onClick={exportar} disabled={!filtradas.length}
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: filtradas.length ? '#16a34a' : border, color: '#fff', border: 'none',
                    borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600,
                    cursor: filtradas.length ? 'pointer' : 'default' }}>
                  <IonIcon icon={downloadOutline} /> Excel
                </button>
              </div>

              {/* RESUMEN (pivote) */}
              {vista === 'resumen' && (
                <div style={{ ...tarjeta, padding: 0, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                    <thead>
                      <tr>
                        <th style={th}>{AGRUPABLES.find((a) => a.key === agruparPor)?.label}</th>
                        {ACCIONES.map((a) => <th key={a} style={{ ...th, textAlign: 'center', color: COLOR_ACCION[a] }}>{a}</th>)}
                        <th style={{ ...th, textAlign: 'center' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pivote.map((f, i) => (
                        <tr key={f.clave} style={{ background: i % 2 ? rowAlt : 'transparent' }}>
                          <td style={td}>
                            {agruparPor === 'depto'
                              ? <span>{f.torre ? `T${f.torre} · ` : ''}<b>{f.clave}</b>{f.tipo_depto ? ` (${f.tipo_depto})` : ''}</span>
                              : agruparPor === 'accion' ? badge(f.clave) : <b>{f.clave}</b>}
                          </td>
                          {ACCIONES.map((a) => (
                            <td key={a} style={{ ...tdNum, color: f[a] ? COLOR_ACCION[a] : textMuted, fontWeight: f[a] ? 700 : 400 }}>
                              {f[a] || ''}
                            </td>
                          ))}
                          <td style={{ ...tdNum, fontWeight: 800, color: textPrimary }}>{f.total}</td>
                        </tr>
                      ))}
                      {pivote.length === 0 && (
                        <tr><td style={td} colSpan={ACCIONES.length + 2}>Sin datos para los filtros actuales.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* DETALLE */}
              {vista === 'detalle' && (
                <div style={{ ...tarjeta, padding: 0, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th style={th}>Torre/Depto</th>
                        <th style={th}>Ambiente</th>
                        <th style={th}>Elemento</th>
                        <th style={th}>Ítem</th>
                        <th style={th}>Tolerancia</th>
                        <th style={{ ...th, textAlign: 'center' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.slice(0, 300).map((r, i) => (
                        <tr key={r.id} style={{ background: i % 2 ? rowAlt : 'transparent' }}>
                          <td style={td}><b>{r.torre}</b> · {String(r.depto ?? NULO)}{r.tipo_depto ? ` (${r.tipo_depto})` : ''}</td>
                          <td style={td}>{r.ambiente ?? NULO}</td>
                          <td style={td}>{r.elemento ?? NULO}</td>
                          <td style={td}>{r.item_revision ?? NULO}</td>
                          <td style={{ ...td, fontSize: 12, color: textSecondary }}>{r.tolerancia ?? NULO}</td>
                          <td style={{ ...td, textAlign: 'center' }}>{badge(r.accion)}</td>
                        </tr>
                      ))}
                      {filtradas.length === 0 && (
                        <tr><td style={td} colSpan={6}>Sin registros para los filtros actuales.</td></tr>
                      )}
                    </tbody>
                  </table>
                  {filtradas.length > 300 && (
                    <div style={{ padding: 10, fontSize: 12, color: textSecondary, textAlign: 'center' }}>
                      Mostrando las primeras 300 de {filtradas.length}. Afina los filtros o exporta a Excel para ver todas.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ReporteOG;

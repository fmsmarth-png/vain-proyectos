// src/pages/AdminAsignarPlanos.tsx
// Asignación masiva de planos a departamentos vía planilla Excel/CSV
// Estilo unificado con la app (dark/light theme)
// FMS · Septiembre 2026

import React, { useState, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonMenuButton,
} from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';
import * as XLSX from 'xlsx';

interface FilaPlanilla {
  proyecto: string; torre: string; id_obra: string; plano_version_id: string;
}

interface FilaProcesada extends FilaPlanilla {
  estado: 'ok' | 'depto_no_encontrado' | 'plano_no_existe' | 'ya_asignado' | 'error';
  depto_id?: string; plano_actual?: string | null; mensaje?: string;
}

type FiltroEstado = 'todos' | 'ok' | 'depto_no_encontrado' | 'plano_no_existe' | 'ya_asignado';

const normalizar = (val: unknown): string => String(val ?? '').trim().toUpperCase();

const AdminAsignarPlanos: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg          = dark ? '#0B1220' : '#f0f4f8';
  const card        = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const border      = dark ? '#243550'  : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb'  : '#0f172a';
  const textMuted   = dark ? '#5D728F'  : '#94a3b8';
  const toolbar     = dark ? '#0E1728'  : '#1e3a5f';
  const inputBg     = dark ? '#1B2C48'  : '#ffffff';
  const inputBorder = dark ? '#243550'  : '#cbd5e1';
  const azul        = dark ? '#60a5fa'  : '#1d4ed8';
  const azulBg      = dark ? 'rgba(96,165,250,0.08)' : '#eff6ff';
  const azulBord    = dark ? 'rgba(96,165,250,0.2)'  : '#bfdbfe';
  const verde       = dark ? '#4ade80'  : '#15803d';
  const verdeBg     = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord   = dark ? 'rgba(74,222,128,0.2)'  : '#bbf7d0';
  const rojo        = dark ? '#f87171'  : '#b91c1c';
  const rojoBg      = dark ? 'rgba(239,68,68,0.06)'  : '#fef2f2';
  const rojoBord    = dark ? 'rgba(239,68,68,0.15)'  : '#fecaca';
  const naranja     = dark ? '#fb923c'  : '#ea580c';
  const naranjaBg   = dark ? 'rgba(251,146,60,0.08)' : '#fff7ed';
  const naranjaBord = dark ? 'rgba(251,146,60,0.2)'  : '#fed7aa';

  const sInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`, borderRadius: 10, padding: '8px 12px', fontSize: 13, background: inputBg, color: textPrimary, outline: 'none', height: 40 };
  const sLabel: React.CSSProperties = { fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 6 };
  const sCard: React.CSSProperties = { background: card, borderRadius: 14, border: `0.5px solid ${border}`, padding: 12, marginBottom: 10 };
  const sBtn = (color: string, bgColor: string, borderColor: string, disabled = false): React.CSSProperties => ({
    height: 36, borderRadius: 10, fontSize: 12, fontWeight: 600,
    border: `0.5px solid ${borderColor}`, background: bgColor,
    color, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, padding: '0 14px',
  });

  const estadoCfg: Record<string, { color: string; bg: string; bord: string; texto: string }> = {
    ok:                   { color: verde,   bg: verdeBg,   bord: verdeBord,   texto: 'Listo' },
    depto_no_encontrado:  { color: rojo,    bg: rojoBg,    bord: rojoBord,    texto: 'No encontrado' },
    plano_no_existe:      { color: naranja, bg: naranjaBg, bord: naranjaBord, texto: 'Plano nuevo' },
    ya_asignado:          { color: textMuted, bg: 'transparent', bord: border, texto: 'Ya asignado' },
    error:                { color: rojo,    bg: rojoBg,    bord: rojoBord,    texto: 'Error' },
  };

  const [filas, setFilas]               = useState<FilaProcesada[]>([]);
  const [cargando, setCargando]         = useState(false);
  const [procesando, setProcesando]     = useState(false);
  const [aplicando, setAplicando]       = useState(false);
  const [resultado, setResultado]       = useState<{ ok: number; error: number } | null>(null);
  const [filtro, setFiltro]             = useState<FiltroEstado>('todos');
  const [busqueda, setBusqueda]         = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [status, setStatus]             = useState<{ msg: string; ok: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // ── Parse ──

  const leerArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCargando(true); setResultado(null); setSeleccionados(new Set()); setStatus(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (!json.length) { setStatus({ msg: 'Planilla vacía', ok: false }); setCargando(false); return; }
      const find = (keys: string[], candidates: string[]) => {
        const key = keys.find(k => candidates.some(c => k.trim().toLowerCase().replace(/[_\s]/g, '') === c));
        return key ?? null;
      };
      const filasRaw: FilaPlanilla[] = json.map(row => {
        const keys = Object.keys(row);
        const g = (cs: string[]) => { const k = find(keys, cs); return k ? String(row[k] ?? '').trim() : ''; };
        return { proyecto: g(['proyecto', 'project']), torre: g(['torre', 'tower']), id_obra: g(['idobra', 'id_obra', 'obra']), plano_version_id: g(['planoversionid', 'plano_version_id', 'plano', 'tipo']) };
      }).filter(f => f.proyecto && f.torre && f.id_obra && f.plano_version_id);
      if (!filasRaw.length) { setStatus({ msg: 'Columnas no encontradas. Esperadas: proyecto, torre, id_obra, plano_version_id', ok: false }); setCargando(false); return; }
      await procesarFilas(filasRaw);
    } catch (err) { setStatus({ msg: 'Error: ' + (err as Error).message, ok: false }); }
    setCargando(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const procesarFilas = async (filasRaw: FilaPlanilla[]) => {
    setProcesando(true);
    const { data: pe } = await supabase.from('og_planos').select('plano_version_id').eq('activo', true);
    const planosSet = new Set((pe ?? []).map(p => p.plano_version_id));
    const { data: proyectos } = await supabase.from('proyectos').select('id, nombre');
    const pm = new Map<string, string>(); (proyectos ?? []).forEach(p => pm.set(normalizar(p.nombre), p.id));
    const pIds = [...new Set(filasRaw.map(f => normalizar(f.proyecto)))].map(n => pm.get(n)).filter(Boolean) as string[];
    const { data: torres } = await supabase.from('torres').select('id, nombre, proyecto_id').in('proyecto_id', pIds);
    const tm = new Map<string, string>(); (torres ?? []).forEach(t => tm.set(`${t.proyecto_id}|${normalizar(t.nombre)}`, t.id));
    const tIds = [...new Set(tm.values())];
    const allDeptos: any[] = [];
    for (let i = 0; i < tIds.length; i += 50) {
      const { data } = await supabase.from('departamentos').select('id, id_obra, torre_id, plano_version_id, numero').in('torre_id', tIds.slice(i, i + 50));
      if (data) allDeptos.push(...data);
    }
    const dm = new Map<string, any>(); allDeptos.forEach(d => { if (d.id_obra) dm.set(`${d.torre_id}|${normalizar(d.id_obra)}`, d); });
    const proc: FilaProcesada[] = filasRaw.map(f => {
      const pId = pm.get(normalizar(f.proyecto));
      if (!pId) return { ...f, estado: 'depto_no_encontrado' as const, mensaje: `Proyecto "${f.proyecto}" no encontrado` };
      const tId = tm.get(`${pId}|${normalizar(f.torre)}`);
      if (!tId) return { ...f, estado: 'depto_no_encontrado' as const, mensaje: `Torre "${f.torre}" no encontrada` };
      const d = dm.get(`${tId}|${normalizar(f.id_obra)}`);
      if (!d) return { ...f, estado: 'depto_no_encontrado' as const, mensaje: `ID Obra "${f.id_obra}" no encontrado` };
      if (!planosSet.has(f.plano_version_id.trim())) return { ...f, estado: 'plano_no_existe' as const, depto_id: d.id, plano_actual: d.plano_version_id, mensaje: `Plano "${f.plano_version_id}" no existe` };
      if (d.plano_version_id === f.plano_version_id.trim()) return { ...f, estado: 'ya_asignado' as const, depto_id: d.id, plano_actual: d.plano_version_id };
      return { ...f, estado: 'ok' as const, depto_id: d.id, plano_actual: d.plano_version_id };
    });
    setFilas(proc);
    const okIdx = new Set<number>(); proc.forEach((f, i) => { if (f.estado === 'ok') okIdx.add(i); }); setSeleccionados(okIdx);
    setProcesando(false);
  };

  // ── Stats ──

  const conteos = { ok: filas.filter(f => f.estado === 'ok').length, depto_no_encontrado: filas.filter(f => f.estado === 'depto_no_encontrado').length, plano_no_existe: filas.filter(f => f.estado === 'plano_no_existe').length, ya_asignado: filas.filter(f => f.estado === 'ya_asignado').length };
  const planosNuevos = [...new Set(filas.filter(f => f.estado === 'plano_no_existe').map(f => f.plano_version_id))];
  const filasFiltradas = filas.filter(f => { if (filtro !== 'todos' && f.estado !== filtro) return false; if (busqueda) { const q = busqueda.toLowerCase(); return f.proyecto.toLowerCase().includes(q) || f.torre.toLowerCase().includes(q) || f.id_obra.toLowerCase().includes(q) || f.plano_version_id.toLowerCase().includes(q); } return true; });

  const toggleSel = (i: number) => setSeleccionados(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  // ── Apply ──

  const crearPlanosNuevos = async () => {
    setAplicando(true);
    let ok = 0;
    for (const p of planosNuevos) { const { error } = await supabase.from('og_planos').insert({ plano_version_id: p, activo: true }); if (!error) ok++; }
    setFilas(prev => prev.map(f => f.estado === 'plano_no_existe' && f.depto_id ? { ...f, estado: f.plano_actual === f.plano_version_id ? 'ya_asignado' : 'ok' } : f));
    setStatus({ msg: `✓ ${ok} plano(s) creado(s)`, ok: true });
    setAplicando(false);
  };

  const aplicarAsignaciones = async () => {
    if (!confirm(`¿Asignar plano a ${seleccionados.size} departamento(s)?`)) return;
    setAplicando(true);
    const porPlano = new Map<string, string[]>();
    seleccionados.forEach(i => { const f = filas[i]; if (!f.depto_id || f.estado === 'depto_no_encontrado') return; const g = porPlano.get(f.plano_version_id) ?? []; g.push(f.depto_id); porPlano.set(f.plano_version_id, g); });
    let ok = 0, err = 0;
    for (const [pid, ids] of porPlano.entries()) {
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from('departamentos').update({ plano_version_id: pid }).in('id', ids.slice(i, i + 100));
        if (error) err += ids.slice(i, i + 100).length; else ok += ids.slice(i, i + 100).length;
      }
    }
    setResultado({ ok, error: err });
    setFilas(prev => prev.map((f, i) => seleccionados.has(i) && f.depto_id ? { ...f, estado: 'ya_asignado', plano_actual: f.plano_version_id } : f));
    setSeleccionados(new Set());
    setAplicando(false);
  };

  const descargarPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([['proyecto', 'torre', 'id_obra', 'plano_version_id'], ['Valle Grande 8', 'A', '1F1.1', 'S5_N_DER_V1']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Asignaciones');
    XLSX.writeFile(wb, 'plantilla_asignar_planos.xlsx');
  };

  const limpiar = () => { setFilas([]); setResultado(null); setSeleccionados(new Set()); setFiltro('todos'); setBusqueda(''); setStatus(null); };

  // ── Render ──

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>📎 Asignar Planos OG</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 14, paddingBottom: 60 }}>

          {/* Status */}
          {status && (
            <div style={{ padding: '8px 12px', borderRadius: 10, marginBottom: 10, fontSize: 12, fontWeight: 600, background: status.ok ? verdeBg : rojoBg, border: `0.5px solid ${status.ok ? verdeBord : rojoBord}`, color: status.ok ? verde : rojo }}>
              {status.msg}
            </div>
          )}

          {/* Upload section */}
          {filas.length === 0 && !procesando && (
            <div style={{ ...sCard, textAlign: 'center', padding: '30px 16px' }}>
              <div style={{ fontSize: 42, marginBottom: 12 }}>📎</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>Carga tu planilla de asignación</div>
              <div style={{ fontSize: 12, color: textMuted, marginBottom: 20 }}>
                Excel o CSV con columnas: <b>proyecto</b>, <b>torre</b>, <b>id_obra</b>, <b>plano_version_id</b>
              </div>
              <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={leerArchivo} style={{ display: 'none' }} />
              <button onClick={() => fileInput.current?.click()} disabled={cargando} style={{ ...sBtn('#fff', '#1e3a5f', 'transparent', cargando), width: '100%', marginBottom: 8 }}>
                {cargando ? 'Procesando...' : '📂 Seleccionar archivo'}
              </button>
              <button onClick={descargarPlantilla} style={{ ...sBtn(azul, azulBg, azulBord), width: '100%' }}>
                📥 Descargar plantilla de ejemplo
              </button>
            </div>
          )}

          {procesando && <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: textMuted }}>Cruzando datos con la base...</div>}

          {/* Preview */}
          {filas.length > 0 && !procesando && (
            <>
              {/* Filter chips */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                {([
                  { key: 'todos', label: `Todos (${filas.length})`, c: textMuted, bg: 'transparent', bd: border },
                  { key: 'ok', label: `Listos (${conteos.ok})`, c: verde, bg: verdeBg, bd: verdeBord },
                  conteos.plano_no_existe > 0 ? { key: 'plano_no_existe', label: `Plano nuevo (${conteos.plano_no_existe})`, c: naranja, bg: naranjaBg, bd: naranjaBord } : null,
                  conteos.depto_no_encontrado > 0 ? { key: 'depto_no_encontrado', label: `No encontrados (${conteos.depto_no_encontrado})`, c: rojo, bg: rojoBg, bd: rojoBord } : null,
                  conteos.ya_asignado > 0 ? { key: 'ya_asignado', label: `Ya asignados (${conteos.ya_asignado})`, c: textMuted, bg: 'transparent', bd: border } : null,
                ] as any[]).filter(Boolean).map((f: any) => (
                  <button key={f.key} onClick={() => setFiltro(f.key)}
                    style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filtro === f.key ? f.c : f.bd}`, background: filtro === f.key ? f.bg : 'transparent', color: filtro === f.key ? f.c : textMuted }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* New planos warning */}
              {planosNuevos.length > 0 && (
                <div style={{ ...sCard, border: `0.5px solid ${naranjaBord}`, background: naranjaBg }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: naranja, marginBottom: 6 }}>⚠ Planos nuevos detectados</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {planosNuevos.map(p => <span key={p} style={{ fontSize: 10, fontWeight: 700, color: naranja, background: dark ? '#1B2C48' : '#fff', padding: '2px 8px', borderRadius: 6, border: `0.5px solid ${naranjaBord}` }}>{p}</span>)}
                  </div>
                  <button onClick={crearPlanosNuevos} disabled={aplicando} style={{ ...sBtn('#fff', naranja, 'transparent', aplicando), width: '100%' }}>
                    Crear {planosNuevos.length} plano(s) en og_planos
                  </button>
                  <div style={{ fontSize: 10, color: naranja, opacity: 0.7, marginTop: 4 }}>Se crean sin imagen. Configura después en Gestión Planos.</div>
                </div>
              )}

              {/* Result */}
              {resultado && (
                <div style={{ ...sCard, border: `0.5px solid ${resultado.error > 0 ? naranjaBord : verdeBord}`, background: resultado.error > 0 ? naranjaBg : verdeBg }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: resultado.error > 0 ? naranja : verde }}>
                    ✓ {resultado.ok} actualizado(s){resultado.error > 0 ? ` · ${resultado.error} error(es)` : ''}
                  </span>
                </div>
              )}

              {/* Search */}
              <input style={{ ...sInput, marginBottom: 8 }} placeholder="🔍 Buscar proyecto, torre, id_obra..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />

              {/* Selection */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: textMuted }}>{seleccionados.size} seleccionado(s)</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => { const s = new Set<number>(); filasFiltradas.forEach((f, i) => { const ri = filas.indexOf(f); if (f.estado === 'ok') s.add(ri); }); setSeleccionados(s); }} style={{ fontSize: 10, fontWeight: 600, color: azul, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    Sel. listos
                  </button>
                  <button onClick={() => setSeleccionados(new Set())} style={{ fontSize: 10, fontWeight: 600, color: textMuted, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    Ninguno
                  </button>
                </div>
              </div>

              {/* Table */}
              <div style={sCard}>
                {filasFiltradas.map((fila, i) => {
                  const ri = filas.indexOf(fila);
                  const cfg = estadoCfg[fila.estado] ?? estadoCfg.error;
                  const sel = seleccionados.has(ri);
                  const selectable = fila.estado === 'ok' || fila.estado === 'plano_no_existe';
                  return (
                    <div key={ri} onClick={() => selectable && toggleSel(ri)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', borderRadius: 8, marginBottom: 3, cursor: selectable ? 'pointer' : 'default',
                        border: `0.5px solid ${sel ? azulBord : border}`,
                        background: sel ? azulBg : 'transparent',
                        opacity: fila.estado === 'ya_asignado' ? 0.4 : 1,
                      }}>
                      {/* Checkbox */}
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${sel ? azul : inputBorder}`, background: sel ? azul : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {sel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: textMuted }}>{fila.proyecto}</span>
                          <span style={{ fontSize: 10, color: textMuted }}>·</span>
                          <span style={{ fontSize: 11, color: textMuted }}>{fila.torre}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: textPrimary }}>{fila.id_obra}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', color: azul }}>{fila.plano_version_id}</span>
                          {fila.plano_actual && fila.plano_actual !== fila.plano_version_id && (
                            <span style={{ fontSize: 9, color: textMuted }}>← {fila.plano_actual}</span>
                          )}
                        </div>
                        {fila.mensaje && <div style={{ fontSize: 10, color: cfg.color, marginTop: 1 }}>{fila.mensaje}</div>}
                      </div>
                      {/* Badge */}
                      <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '2px 6px', borderRadius: 4, border: `0.5px solid ${cfg.bord}`, flexShrink: 0 }}>
                        {cfg.texto}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={aplicarAsignaciones} disabled={seleccionados.size === 0 || aplicando}
                  style={{ ...sBtn('#fff', seleccionados.size > 0 ? '#1e3a5f' : inputBorder, 'transparent', seleccionados.size === 0 || aplicando), flex: 1 }}>
                  {aplicando ? 'Aplicando...' : `📎 Asignar ${seleccionados.size} depto(s)`}
                </button>
                <button onClick={limpiar} style={{ ...sBtn(textMuted, 'transparent', border), flex: 'none', padding: '0 12px' }}>🗑</button>
                <button onClick={() => fileInput.current?.click()} style={{ ...sBtn(textMuted, 'transparent', border), flex: 'none', padding: '0 12px' }}>📂</button>
                <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={leerArchivo} style={{ display: 'none' }} />
              </div>
            </>
          )}

        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminAsignarPlanos;  
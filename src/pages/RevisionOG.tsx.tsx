// src/pages/RevisionOG.tsx
// Módulo Revisión Tolerancias OG — Pantalla 1: Selector + lista de obs
// FMS · Junio 2026

import React, { useRef, useState, useMemo } from 'react';
import {
  IonContent, IonHeader, IonMenuButton, IonPage,
  IonTitle, IonToolbar, IonRefresher, IonRefresherContent,
} from '@ionic/react';
import { useIonViewDidEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

const RevisionOG: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const history = useHistory();
  const mounted = useRef(false);

  // ── tokens ────────────────────────────────────────────────────────────────
  const bg            = dark ? '#000000' : '#f0f4f8';
  const cardGrad      = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary = dark ? '#6b7280'  : '#64748b';
  const textMuted     = dark ? '#444444'  : '#94a3b8';
  const toolbar       = dark ? '#000000'  : '#1e3a5f';
  const inputBg       = dark ? '#111111'  : '#ffffff';
  const inputBorder   = dark ? '#1e1e1e'  : '#cbd5e1';
  const sepLine       = dark
    ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';
  const rojo      = dark ? '#f87171' : '#b91c1c';
  const rojoBg    = dark ? 'rgba(239,68,68,0.06)' : '#fef2f2';
  const rojoBord  = dark ? 'rgba(239,68,68,0.15)' : '#fecaca';
  const azul      = dark ? '#60a5fa' : '#1d4ed8';
  const azulBg    = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const azulBord  = dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe';
  const amarillo  = dark ? '#fbbf24' : '#a16207';
  const amarilloBg  = dark ? 'rgba(251,191,36,0.06)' : '#fffbeb';
  const amarilloBord = dark ? 'rgba(251,191,36,0.2)' : '#fde68a';

  // ── state ─────────────────────────────────────────────────────────────────
  const [usuario, setUsuario]     = useState<any>(null);
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [torres, setTorres]       = useState<any[]>([]);
  const [deptos, setDeptos]       = useState<any[]>([]);
  const [proyectoSel, setProyectoSel] = useState<any>(null);
  const [torreSel, setTorreSel]       = useState<any>(null);
  const [deptoSel, setDeptoSel]       = useState<any>(null);
  const [obsDepto, setObsDepto]   = useState<any[]>([]);
  const [cerrado, setCerrado]     = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [cargando, setCargando]   = useState(false);
  const [cerrando, setCerrando]   = useState(false);

  // ── init ──────────────────────────────────────────────────────────────────
  useIonViewDidEnter(() => {
    if (!mounted.current) {
      mounted.current = true;
      cargar();
    } else if (deptoSel) {
      // Al volver desde detalle, refrescar obs
      cargarObsDepto(deptoSel.id);
    }
  });

  const cargar = async () => {
    setCargando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: u } = await supabase
        .from('usuarios')
        .select('id, nombre, rol')
        .eq('email', user.email)
        .maybeSingle();
      setUsuario(u);

      let query = supabase
        .from('proyectos')
        .select('id, nombre, codigo')
        .eq('estado', 'activo')
        .order('nombre');

      if (u?.rol !== 'administrador') {
        const { data: up } = await supabase
          .from('usuario_proyectos')
          .select('proyecto_id')
          .eq('usuario_id', u?.id);
        const ids = (up || []).map((x: any) => x.proyecto_id);
        if (ids.length === 0) { setProyectos([]); return; }
        query = query.in('id', ids);
      }

      const { data: p } = await query;
      setProyectos(p || []);
    } finally {
      setCargando(false);
    }
  };

  const cargarTorres = async (proyId: string) => {
    const { data } = await supabase
      .from('torres')
      .select('id, nombre, frente')
      .eq('proyecto_id', proyId)
      .order('nombre');
    setTorres(data || []);
    setTorreSel(null);
    setDeptos([]);
    setDeptoSel(null);
    setObsDepto([]);
    setCerrado(false);
  };

  const cargarDeptos = async (torreId: string) => {
    const { data } = await supabase
      .from('departamentos')
      .select('id, numero, id_obra, piso')
      .eq('torre_id', torreId)
      .order('numero');
    setDeptos(data || []);
    setDeptoSel(null);
    setObsDepto([]);
    setCerrado(false);
  };

  const seleccionarDepto = async (depto: any) => {
    setDeptoSel(depto);
    setObsDepto([]);
    setCerrado(false);
    setExpandidos(new Set());
    await Promise.all([
      cargarObsDepto(depto.id),
      cargarEstadoDepto(depto.id),
    ]);
  };

  const cargarObsDepto = async (deptoId: string) => {
    const { data } = await supabase
      .from('og_registros')
      .select('id, ambiente, tipo_elemento, tipo_revision, elemento, tolerancia, creado_en, usuarios(nombre)')
      .eq('departamento_id', deptoId)
      .order('creado_en', { ascending: false });
    setObsDepto(data || []);
  };

  const cargarEstadoDepto = async (deptoId: string) => {
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

  const onRefresh = async (e: any) => {
    if (deptoSel) {
      await Promise.all([cargarObsDepto(deptoSel.id), cargarEstadoDepto(deptoSel.id)]);
    } else {
      await cargar();
    }
    e.detail.complete();
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

  const irADetalle = () => {
    if (!proyectoSel || !torreSel || !deptoSel) return;
    history.push('/revision-og/detalle', {
      proyecto: proyectoSel,
      torre:    torreSel,
      depto:    deptoSel,
      cerrado,
    });
  };

  const irAResumen = () => {
    if (!proyectoSel || !torreSel || !deptoSel) return;
    history.push('/revision-og/resumen', {
      proyecto: proyectoSel,
      torre:    torreSel,
      depto:    deptoSel,
    });
  };

  // ── styles ─────────────────────────────────────────────────────────────────
  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16,
    border: `0.5px solid ${border}`, padding: 14, marginBottom: 10,
  };
  const sSecLabel: React.CSSProperties = {
    fontSize: 9, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: 600, marginBottom: 10,
  };
  const sInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`,
    borderRadius: 10, padding: '8px 12px', fontSize: 14,
    background: inputBg, color: textPrimary, outline: 'none', height: 44,
  };
  const sFieldLabel: React.CSSProperties = { fontSize: 11, color: textSecondary, marginBottom: 4 };

  const esAdmin = usuario?.rol === 'administrador';

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral"
            style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>📐 Revisión OG</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <IonRefresher slot="fixed" onIonRefresh={onRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div style={{ padding: 16, paddingBottom: 40 }}>

          {/* ── Selector cascada ────────────────────────────────── */}
          <div style={sCard}>
            <div style={sSecLabel}>SELECCIÓN</div>

            <div style={sFieldLabel}>Proyecto</div>
            <select
              style={{ ...sInput, marginBottom: 12 }}
              value={proyectoSel?.id || ''}
              onChange={e => {
                const p = proyectos.find(x => x.id === e.target.value) || null;
                setProyectoSel(p);
                if (p) cargarTorres(p.id);
                else { setTorres([]); setTorreSel(null); setDeptos([]); setDeptoSel(null); }
              }}
            >
              <option value="">Seleccione proyecto...</option>
              {proyectos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>

            <div style={sFieldLabel}>Torre</div>
            <select
              style={{ ...sInput, marginBottom: 12, opacity: !proyectoSel ? 0.4 : 1 }}
              disabled={!proyectoSel}
              value={torreSel?.id || ''}
              onChange={e => {
                const t = torres.find(x => x.id === e.target.value) || null;
                setTorreSel(t);
                if (t) cargarDeptos(t.id);
                else { setDeptos([]); setDeptoSel(null); }
              }}
            >
              <option value="">Seleccione torre...</option>
              {torres.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>

            <div style={sFieldLabel}>Departamento</div>
            <select
              style={{ ...sInput, opacity: !torreSel ? 0.4 : 1 }}
              disabled={!torreSel}
              value={deptoSel?.id || ''}
              onChange={e => {
                const d = deptos.find(x => x.id === e.target.value) || null;
                if (d) seleccionarDepto(d);
                else { setDeptoSel(null); setObsDepto([]); setCerrado(false); }
              }}
            >
              <option value="">Seleccione departamento...</option>
              {deptos.map(d => (
                <option key={d.id} value={d.id}>
                  {d.numero}{d.id_obra ? ` — ${d.id_obra}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* ── Panel depto seleccionado ─────────────────────────── */}
          {deptoSel && (
            <>
              {/* Banner estado */}
              {cerrado ? (
                <div style={{
                  background: rojoBg, border: `0.5px solid ${rojoBord}`,
                  borderRadius: 12, padding: '10px 14px', marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🔒</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: rojo }}>Depto cerrado</div>
                      <div style={{ fontSize: 11, color: textSecondary }}>No se pueden agregar obs.</div>
                    </div>
                  </div>
                  {esAdmin && (
                    <button
                      onClick={reabrirDepto}
                      disabled={cerrando}
                      style={{
                        padding: '4px 12px', borderRadius: 8, border: `0.5px solid ${rojoBord}`,
                        background: 'transparent', color: rojo, fontSize: 12,
                        fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Reabrir
                    </button>
                  )}
                </div>
              ) : (
                <div style={{
                  background: amarilloBg, border: `0.5px solid ${amarilloBord}`,
                  borderRadius: 12, padding: '8px 14px', marginBottom: 10,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 14 }}>🔓</span>
                  <span style={{ fontSize: 12, color: amarillo, fontWeight: 600 }}>
                    Depto abierto · {obsDepto.length} obs registradas
                  </span>
                </div>
              )}

              {/* Botones de acción */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8, marginBottom: 10,
              }}>
                <button
                  onClick={irADetalle}
                  disabled={cerrado}
                  style={{
                    height: 50, borderRadius: 12, border: 'none',
                    background: cerrado
                      ? (dark ? '#1a1a1a' : '#e2e8f0')
                      : 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                    color: cerrado ? textMuted : '#fff',
                    fontSize: 14, fontWeight: 700,
                    cursor: cerrado ? 'not-allowed' : 'pointer',
                  }}
                >
                  📐 Inspeccionar
                </button>
                <button
                  onClick={irAResumen}
                  style={{
                    height: 50, borderRadius: 12,
                    border: `0.5px solid ${border}`,
                    background: 'transparent', color: textSecondary,
                    fontSize: 14, cursor: 'pointer',
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
                      cursor: cerrando ? 'not-allowed' : 'pointer',
                      opacity: cerrando ? 0.6 : 1,
                    }}
                  >
                    {cerrando ? 'Procesando...' : '🔒 Cerrar departamento'}
                  </button>
                )}
              </div>

              {/* Separador */}
              <div style={{ height: '0.5px', background: sepLine, margin: '16px 0' }} />

              {/* Lista observaciones */}
              <div style={sSecLabel}>
                OBSERVACIONES REGISTRADAS ({obsDepto.length})
              </div>

              {obsAgrupadas.length === 0 ? (
                <div style={{ ...sCard, textAlign: 'center', padding: '28px 14px' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 14, color: textSecondary }}>Sin observaciones registradas</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>
                    Toca "Inspeccionar" para comenzar
                  </div>
                </div>
              ) : (
                obsAgrupadas.map(({ ambiente, obs }) => (
                  <div key={ambiente} style={{ ...sCard, padding: 0, overflow: 'hidden', marginBottom: 8 }}>

                    {/* Header ambiente (toggle) */}
                    <button
                      onClick={() => toggleExpandir(ambiente)}
                      style={{
                        width: '100%', padding: '12px 14px',
                        background: 'transparent', border: 'none',
                        cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>🏠</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
                          {ambiente}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          background: azulBg, color: azul,
                          border: `0.5px solid ${azulBord}`,
                          borderRadius: 20, padding: '2px 8px',
                          fontSize: 12, fontWeight: 700,
                        }}>
                          {obs.length}
                        </span>
                        <span style={{ color: textMuted, fontSize: 11 }}>
                          {expandidos.has(ambiente) ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {/* Filas de obs */}
                    {expandidos.has(ambiente) && (
                      <div style={{ borderTop: `0.5px solid ${border}` }}>
                        {obs.map((o: any, i: number) => (
                          <div
                            key={o.id}
                            style={{
                              padding: '10px 14px',
                              borderBottom: i < obs.length - 1 ? `0.5px solid ${border}` : 'none',
                            }}
                          >
                            {/* Tipo + revisión */}
                            <div style={{
                              display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center', marginBottom: 4,
                            }}>
                              <span style={{ fontSize: 12, color: textMuted }}>
                                {o.tipo_elemento} · {o.tipo_revision}
                              </span>
                              {o.foto_url && (
                                <span style={{ fontSize: 11, color: azul }}>📷</span>
                              )}
                            </div>

                            {/* Elemento */}
                            <div style={{
                              fontSize: 13, fontWeight: 600, color: textPrimary, marginBottom: 3,
                            }}>
                              {o.elemento || '—'}
                            </div>

                            {/* Tolerancia */}
                            <div style={{
                              fontSize: 13, color: azul, fontWeight: 600, marginBottom: 4,
                            }}>
                              {o.tolerancia || '—'}
                            </div>

                            {/* Footer */}
                            <div style={{ fontSize: 11, color: textMuted }}>
                              {o.usuarios?.nombre || '—'} ·{' '}
                              {new Date(o.creado_en).toLocaleDateString('es-CL', {
                                day: '2-digit', month: '2-digit', year: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              })}
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

          {/* Estado cargando inicial */}
          {cargando && (
            <div style={{ textAlign: 'center', padding: 32, color: textMuted }}>
              Cargando...
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default RevisionOG;

import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle, IonToast } from '@ionic/react';
import { useRef, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

// ============================================================
// Tipos
// ============================================================
interface Proyecto { id: string; nombre: string; codigo: string; }

type EstadoItem = 'pendiente' | 'aprobado' | 'aprobado_con_obs' | 'rechazado';

interface ItemVale {
  id: string;
  material_id: string;
  cantidad_solicitada: number;
  cantidad_entregada: number | null;
  estado: EstadoItem;
  motivo_rechazo: string | null;
  observacion: string | null;
  bodega_materiales: { nombre: string; unidad: string | null } | null;
}

interface DeptoVale {
  departamentos: { id_obra: string; frente_depto: string } | null;
}

interface Vale {
  id: string;
  codigo: string;
  retira_nombre: string;
  fecha_emision: string;
  torres: { nombre: string } | null;
  vales_bodega_deptos: DeptoVale[];
  vales_bodega_items: ItemVale[];
}

// ============================================================
const AprobacionBodega: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);
  const location = useLocation<{ proyecto?: Proyecto }>();

  // ── tokens (idénticos al sistema de diseño VAIN) ──────────────────────────
  const bg            = dark ? '#000000' : '#f0f4f8';
  const cardGrad       = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border         = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary    = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary  = dark ? '#6b7280'  : '#64748b';
  const textMuted      = dark ? '#444444'  : '#94a3b8';
  const toolbar        = dark ? '#000000'  : '#1e3a5f';
  const inputBg        = dark ? '#111111'  : '#ffffff';
  const inputBorder    = dark ? '#1e1e1e'  : '#cbd5e1';

  const verde      = dark ? '#4ade80' : '#15803d';
  const verdeBg    = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord  = dark ? 'rgba(74,222,128,0.2)'  : '#bbf7d0';
  const amarillo     = dark ? '#fbbf24' : '#a16207';
  const amarilloBg   = dark ? 'rgba(251,191,36,0.06)' : '#fffbeb';
  const amarilloBord = dark ? 'rgba(251,191,36,0.2)'  : '#fde68a';
  const rojo      = dark ? '#f87171' : '#b91c1c';
  const rojoBg    = dark ? 'rgba(239,68,68,0.06)' : '#fef2f2';
  const rojoBord  = dark ? 'rgba(239,68,68,0.15)' : '#fecaca';

  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`,
    padding: '14px 14px', marginBottom: 10,
  };
  const sTextarea: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`,
    borderRadius: 10, padding: '8px 12px', fontSize: 13, background: inputBg,
    color: textPrimary, outline: 'none', resize: 'none', lineHeight: 1.5, marginBottom: 6,
  };
  const sInputSmall: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`,
    borderRadius: 10, padding: '8px 12px', fontSize: 13, background: inputBg,
    color: textPrimary, outline: 'none', height: 36, marginBottom: 6,
  };

  type EstadoVale = 'pendiente' | 'aprobado' | 'aprobado_obs' | 'parcial' | 'rechazado';

  const estadoColores = (estado: EstadoVale) => {
    if (estado === 'aprobado') return { bg: verdeBg, color: verde, border: verdeBord, label: 'Aprobado' };
    if (estado === 'aprobado_obs') return { bg: amarilloBg, color: amarillo, border: amarilloBord, label: 'Aprobado con obs.' };
    if (estado === 'rechazado') return { bg: rojoBg, color: rojo, border: rojoBord, label: 'Rechazado' };
    if (estado === 'parcial') return { bg: amarilloBg, color: amarillo, border: amarilloBord, label: 'Resuelto con rechazos' };
    return { bg: amarilloBg, color: amarillo, border: amarilloBord, label: 'Pendiente' };
  };

  // ── estado ─────────────────────────────────────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(location.state?.proyecto ?? null);
  const [vales, setVales] = useState<Vale[]>([]);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [rechazoAbierto, setRechazoAbierto] = useState<Record<string, boolean>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [obsAbierto, setObsAbierto] = useState<Record<string, boolean>>({});
  const [cantidadEntregada, setCantidadEntregada] = useState<Record<string, string>>({});
  const [observaciones, setObservaciones] = useState<Record<string, string>>({});
  const [procesando, setProcesando] = useState<Record<string, boolean>>({});
  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  // ── carga ──────────────────────────────────────────────────────────────
  const cargarVales = useCallback(async (proyectoId: string) => {
    const { data, error } = await supabase
      .from('vales_bodega')
      .select(`
        id, codigo, retira_nombre, fecha_emision,
        torres ( nombre ),
        vales_bodega_deptos ( departamentos ( id_obra, frente_depto ) ),
        vales_bodega_items ( id, material_id, cantidad_solicitada, cantidad_entregada, estado, motivo_rechazo, observacion, bodega_materiales ( nombre, unidad ) )
      `)
      .eq('proyecto_id', proyectoId)
      .order('fecha_emision', { ascending: false })
      .limit(50);
    if (!error && data) setVales(data as unknown as Vale[]);
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
          .single();
        if (up?.proyectos) {
          proy = up.proyectos as unknown as Proyecto;
          setProyecto(proy);
        }
      }
    }
    if (proy) await cargarVales(proy.id);
  };

  // ── Realtime: nuevas solicitudes y cambios de estado se reflejan solos ──
  useEffect(() => {
    if (!proyecto) return;
    const channel = supabase
      .channel(`bodega-vales-${proyecto.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vales_bodega', filter: `proyecto_id=eq.${proyecto.id}` },
        () => cargarVales(proyecto.id)
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vales_bodega_items' },
        () => cargarVales(proyecto.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [proyecto, cargarVales]);

  // ── derivados ──────────────────────────────────────────────────────────
  const resumenVale = (v: Vale) => {
    const items = v.vales_bodega_items;
    const total = items.length;
    const aprobados = items.filter(i => i.estado === 'aprobado').length;
    const conObs = items.filter(i => i.estado === 'aprobado_con_obs').length;
    const rechazados = items.filter(i => i.estado === 'rechazado').length;
    const pendientes = items.filter(i => i.estado === 'pendiente').length;
    let estado: EstadoVale = 'pendiente';
    if (pendientes === 0) {
      const totalAprobados = aprobados + conObs;
      if (rechazados > 0 && totalAprobados > 0) estado = 'parcial';
      else if (rechazados > 0 && totalAprobados === 0) estado = 'rechazado';
      else if (conObs > 0) estado = 'aprobado_obs';
      else estado = 'aprobado';
    }
    return { total, aprobados, conObs, rechazados, pendientes, estado };
  };

  const frentesVale = (v: Vale) => {
    const set = new Set<string>();
    v.vales_bodega_deptos.forEach(d => { if (d.departamentos?.frente_depto) set.add(d.departamentos.frente_depto); });
    return Array.from(set).join(', ');
  };

  // ── acciones ───────────────────────────────────────────────────────────
  const aprobarItem = async (itemId: string) => {
    setProcesando(prev => ({ ...prev, [itemId]: true }));
    const { error } = await supabase.rpc('bodega_resolver_item_vale', {
      p_item_id: itemId, p_decision: 'aprobado',
    });
    setProcesando(prev => ({ ...prev, [itemId]: false }));
    if (error) {
      setToastColor('danger');
      setToastMsg('No se pudo aprobar: ' + error.message);
    } else if (proyecto) {
      cargarVales(proyecto.id);
    }
  };

  const abrirRechazo = (itemId: string) => {
    setObsAbierto(prev => ({ ...prev, [itemId]: false }));
    setRechazoAbierto(prev => ({ ...prev, [itemId]: true }));
  };

  const abrirAprobarConObs = (itemId: string, cantidadSolicitada: number) => {
    setRechazoAbierto(prev => ({ ...prev, [itemId]: false }));
    setCantidadEntregada(prev => ({ ...prev, [itemId]: prev[itemId] ?? String(cantidadSolicitada) }));
    setObsAbierto(prev => ({ ...prev, [itemId]: true }));
  };

  const confirmarRechazo = async (itemId: string) => {
    const motivo = (motivos[itemId] ?? '').trim();
    if (!motivo) {
      setToastColor('danger');
      setToastMsg('Indica el motivo del rechazo');
      return;
    }
    setProcesando(prev => ({ ...prev, [itemId]: true }));
    const { error } = await supabase.rpc('bodega_resolver_item_vale', {
      p_item_id: itemId, p_decision: 'rechazado', p_motivo_rechazo: motivo,
    });
    setProcesando(prev => ({ ...prev, [itemId]: false }));
    if (error) {
      setToastColor('danger');
      setToastMsg('No se pudo rechazar: ' + error.message);
    } else {
      setRechazoAbierto(prev => ({ ...prev, [itemId]: false }));
      if (proyecto) cargarVales(proyecto.id);
    }
  };

  const confirmarAprobarConObs = async (itemId: string) => {
    const cantidad = parseFloat(cantidadEntregada[itemId] ?? '');
    const obs = (observaciones[itemId] ?? '').trim();
    if (!cantidad || cantidad <= 0) {
      setToastColor('danger');
      setToastMsg('Ingresa la cantidad realmente entregada');
      return;
    }
    if (!obs) {
      setToastColor('danger');
      setToastMsg('Indica la observación (ej: no había stock suficiente)');
      return;
    }
    setProcesando(prev => ({ ...prev, [itemId]: true }));
    const { error } = await supabase.rpc('bodega_resolver_item_vale', {
      p_item_id: itemId, p_decision: 'aprobado_con_obs',
      p_cantidad_entregada: cantidad, p_observacion: obs,
    });
    setProcesando(prev => ({ ...prev, [itemId]: false }));
    if (error) {
      setToastColor('danger');
      setToastMsg('No se pudo aprobar con observación: ' + error.message);
    } else {
      setObsAbierto(prev => ({ ...prev, [itemId]: false }));
      if (proyecto) cargarVales(proyecto.id);
    }
  };

  // ============================================================
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Vales de bodega</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16, paddingBottom: 40 }}>

          {proyecto && (
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>
              {proyecto.nombre} · todas las torres
            </div>
          )}

          {vales.length === 0 && (
            <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: '40px 0' }}>
              No hay solicitudes todavía. Aparecerán aquí automáticamente cuando un jefe de terreno emita un vale.
            </div>
          )}

          {vales.map(v => {
            const resumen = resumenVale(v);
            const colores = estadoColores(resumen.estado);
            const abierto = expandidoId === v.id;
            return (
              <div key={v.id} style={sCard}>
                <div
                  onClick={() => setExpandidoId(abierto ? null : v.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: textPrimary }}>{v.retira_nombre}</div>
                    <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>
                      {v.codigo} · {v.torres ? `Torre ${v.torres.nombre}` : 'Exteriores'}{frentesVale(v) ? ` · ${frentesVale(v)}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 10, background: colores.bg, color: colores.color, border: `0.5px solid ${colores.border}` }}>
                    {colores.label}
                  </span>
                </div>

                {abierto && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${border}` }}>
                    <div style={{ fontSize: 12, color: textMuted, marginBottom: 10 }}>
                      {resumen.total - resumen.pendientes} de {resumen.total} materiales resueltos
                      ({resumen.aprobados} aprobados, {resumen.conObs} con obs., {resumen.rechazados} rechazados)
                    </div>

                    {v.vales_bodega_items.map(item => (
                      <div key={item.id} style={{ padding: '8px 0', borderBottom: `0.5px solid ${border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: 14, color: textPrimary }}>{item.bodega_materiales?.nombre ?? 'Material'}</div>
                            <div style={{ fontSize: 12, color: textSecondary, marginTop: 1 }}>
                              Solicitado: {item.cantidad_solicitada}{item.bodega_materiales?.unidad ? ` ${item.bodega_materiales.unidad}` : ''}
                              {item.estado !== 'pendiente' && item.cantidad_entregada !== null && item.cantidad_entregada !== item.cantidad_solicitada && (
                                <> · Entregado: {item.cantidad_entregada}{item.bodega_materiales?.unidad ? ` ${item.bodega_materiales.unidad}` : ''}</>
                              )}
                            </div>
                          </div>

                          {item.estado === 'pendiente' ? (
                            <div style={{ display: 'flex', gap: 12 }}>
                              <span
                                onClick={() => abrirRechazo(item.id)}
                                style={{ color: rojo, fontSize: 19, cursor: 'pointer', opacity: procesando[item.id] ? 0.4 : 1 }}
                              >✕</span>
                              <span
                                onClick={() => abrirAprobarConObs(item.id, item.cantidad_solicitada)}
                                style={{ color: amarillo, fontSize: 17, cursor: 'pointer', opacity: procesando[item.id] ? 0.4 : 1 }}
                                title="Aprobar con observación"
                              >✎</span>
                              <span
                                onClick={() => !procesando[item.id] && aprobarItem(item.id)}
                                style={{ color: verde, fontSize: 19, cursor: 'pointer', opacity: procesando[item.id] ? 0.4 : 1 }}
                              >✓</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 500, color: item.estado === 'rechazado' ? rojo : (item.estado === 'aprobado_con_obs' ? amarillo : verde) }}>
                              {item.estado === 'aprobado' && 'Aprobado'}
                              {item.estado === 'aprobado_con_obs' && 'Aprobado con obs.'}
                              {item.estado === 'rechazado' && 'Rechazado'}
                            </span>
                          )}
                        </div>

                        {item.estado === 'rechazado' && item.motivo_rechazo && (
                          <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>Motivo: {item.motivo_rechazo}</div>
                        )}
                        {item.estado === 'aprobado_con_obs' && item.observacion && (
                          <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>Obs: {item.observacion}</div>
                        )}

                        {rechazoAbierto[item.id] && item.estado === 'pendiente' && (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              rows={2}
                              style={sTextarea}
                              placeholder="Motivo del rechazo de este material"
                              value={motivos[item.id] ?? ''}
                              onChange={e => setMotivos(prev => ({ ...prev, [item.id]: e.target.value }))}
                            />
                            <button
                              disabled={procesando[item.id]}
                              onClick={() => confirmarRechazo(item.id)}
                              style={{ width: '100%', background: rojoBg, color: rojo, border: `0.5px solid ${rojoBord}`, borderRadius: 10, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Confirmar rechazo
                            </button>
                          </div>
                        )}

                        {obsAbierto[item.id] && item.estado === 'pendiente' && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, color: textMuted, marginBottom: 4 }}>Cantidad realmente entregada</div>
                            <input
                              type="number"
                              min="0"
                              style={sInputSmall}
                              value={cantidadEntregada[item.id] ?? ''}
                              onChange={e => setCantidadEntregada(prev => ({ ...prev, [item.id]: e.target.value }))}
                            />
                            <textarea
                              rows={2}
                              style={sTextarea}
                              placeholder="Observación (ej: no había stock suficiente)"
                              value={observaciones[item.id] ?? ''}
                              onChange={e => setObservaciones(prev => ({ ...prev, [item.id]: e.target.value }))}
                            />
                            <button
                              disabled={procesando[item.id]}
                              onClick={() => confirmarAprobarConObs(item.id)}
                              style={{ width: '100%', background: amarilloBg, color: amarillo, border: `0.5px solid ${amarilloBord}`, borderRadius: 10, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Confirmar aprobación con observación
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

        </div>
      </IonContent>

      <IonToast
        isOpen={!!toastMsg}
        message={toastMsg}
        duration={3000}
        color={toastColor}
        onDidDismiss={() => setToastMsg('')}
      />
    </IonPage>
  );
};

export default AprobacionBodega;

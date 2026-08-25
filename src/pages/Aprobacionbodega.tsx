import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle, IonToast, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { usePermiso } from '../Context/usePermiso';
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
  emitido_por: string | null;
  usuarios: { nombre: string | null } | null;
  torres: { nombre: string; frente: string } | null;
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

  const { tienePermiso } = usePermiso();
  const puedeAprobar = tienePermiso('bodega_aprobar');

  // ── estado ─────────────────────────────────────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(location.state?.proyecto ?? null);
  const [vales, setVales] = useState<Vale[]>([]);
  const [filtroEmisor, setFiltroEmisor] = useState('');
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
        id, codigo, retira_nombre, fecha_emision, emitido_por,
        usuarios ( nombre ),
        torres ( nombre, frente ),
        vales_bodega_deptos ( departamentos ( id_obra, frente_depto ) ),
        vales_bodega_items ( id, material_id, cantidad_solicitada, cantidad_entregada, estado, motivo_rechazo, observacion, bodega_materiales ( nombre, unidad ) )
      `)
      .eq('proyecto_id', proyectoId)
      .order('fecha_emision', { ascending: false })
      .limit(300);
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

  // Pull-to-refresh: recarga manual deslizando hacia abajo, por si el Realtime
  // tarda o se quiere forzar una actualización inmediata.
  const onRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    if (proyecto) await cargarVales(proyecto.id);
    e.detail.complete();
  };

  // ── Realtime: nuevas solicitudes y cambios de estado se reflejan solos ──
  // Se escucha tanto el INSERT del encabezado (vales_bodega) como el INSERT y
  // UPDATE de sus líneas (vales_bodega_items). El INSERT de líneas es clave:
  // al emitir un vale, el encabezado se inserta ANTES que sus materiales, así
  // que la recarga disparada solo por el encabezado traía el vale sin detalle
  // (items aún no escritos). Al escuchar también el INSERT de líneas, cuando
  // estas llegan se dispara otra recarga que ya incluye el detalle completo.
  useEffect(() => {
    if (!proyecto) return;
    const channel = supabase
      .channel(`bodega-vales-${proyecto.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vales_bodega', filter: `proyecto_id=eq.${proyecto.id}` },
        () => cargarVales(proyecto.id)
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vales_bodega_items' },
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

  // ── filtro por emisor + agrupación por día ──────────────────────────────
  // Se agrupa por ID de usuario (emitido_por), no por nombre — dos cuentas
  // distintas pueden compartir el mismo nombre, y agrupar por texto las
  // colapsaría en una sola opción del filtro.
  const emisores = useMemo(() => {
    const mapa = new Map<string, string>();
    vales.forEach(v => {
      if (v.emitido_por) mapa.set(v.emitido_por, v.usuarios?.nombre ?? 'Sin nombre');
    });
    return Array.from(mapa.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [vales]);

  const valesFiltrados = useMemo(() => {
    if (!filtroEmisor) return vales;
    return vales.filter(v => v.emitido_por === filtroEmisor);
  }, [vales, filtroEmisor]);

  const fmtDia = (fechaISO: string) => {
    const d = new Date(fechaISO);
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Agrupa los vales ya filtrados por día calendario, conservando el orden
  // descendente que ya trae la consulta (más reciente primero).
  const gruposPorDia = useMemo(() => {
    const grupos: { dia: string; vales: Vale[] }[] = [];
    for (const v of valesFiltrados) {
      const dia = fmtDia(v.fecha_emision);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.dia === dia) ultimo.vales.push(v);
      else grupos.push({ dia, vales: [v] });
    }
    return grupos;
  }, [valesFiltrados]);

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
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Vales de bodega</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <IonRefresher slot="fixed" onIonRefresh={onRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div style={{ padding: 16, paddingBottom: 40 }}>

          {proyecto && (
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>
              {proyecto.nombre} · todas las torres
            </div>
          )}

          {vales.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: textMuted }}>
                {valesFiltrados.length} de {vales.length} vale{vales.length === 1 ? '' : 's'}
              </div>
              {emisores.length > 1 && (
                <select
                  value={filtroEmisor}
                  onChange={e => setFiltroEmisor(e.target.value)}
                  style={{
                    border: `0.5px solid ${inputBorder}`, borderRadius: 8, padding: '5px 8px',
                    fontSize: 12, background: inputBg, color: textPrimary, outline: 'none',
                  }}
                >
                  <option value="">Todos los emisores</option>
                  {emisores.map(({ id, nombre }) => {
                    const repetido = emisores.filter(e => e.nombre === nombre).length > 1;
                    return (
                      <option key={id} value={id}>
                        {nombre}{repetido ? ` (${id.slice(0, 6)})` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          )}

          {vales.length === 0 && (
            <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: '40px 0' }}>
              No hay solicitudes todavía. Aparecerán aquí automáticamente cuando un jefe de terreno emita un vale.
            </div>
          )}

          {gruposPorDia.map(grupo => (
            <div key={grupo.dia}>
              <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, margin: '14px 0 8px' }}>
                {grupo.dia}
              </div>
              {grupo.vales.map(v => {
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
                      {v.codigo} · {v.torres ? `Torre ${v.torres.frente}` : 'Exteriores'}{frentesVale(v) ? ` · ${frentesVale(v)}` : ''}
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
                            puedeAprobar ? (
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
                              <span style={{ fontSize: 12, fontWeight: 500, color: amarillo }}>Pendiente</span>
                            )
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
          ))}

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
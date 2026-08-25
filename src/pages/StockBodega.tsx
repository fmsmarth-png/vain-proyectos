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
  stock_actual: number;
  bajo_stock: boolean;
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
  const [soloBajoStock, setSoloBajoStock] = useState(location.state?.soloBajoStock ?? false);
  const [cargando, setCargando] = useState(true);

  // umbral edit (solo jefe de bodega)
  const [umbralEdit, setUmbralEdit] = useState<Record<string, string>>({});

  // ficha material
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [fichaMaterial, setFichaMaterial] = useState<StockRow | null>(null);
  const [fichaOcs, setFichaOcs] = useState<OcRow[]>([]);
  const [fichaEntregas, setFichaEntregas] = useState<EntregaRow[]>([]);
  const [fichaActividades, setFichaActividades] = useState<string[]>([]);
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
    const { data } = await supabase
      .from('bodega_stock_actual')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('nombre');
    setMateriales((data as StockRow[] | null) ?? []);
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

  // ── filtrado ───────────────────────────────────────────────────────────
  const materialesFiltrados = useMemo(() => {
    let lista = materiales;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(m => m.nombre.toLowerCase().includes(q));
    }
    if (soloBajoStock) lista = lista.filter(m => m.bajo_stock);
    return lista.slice(0, 80);
  }, [materiales, busqueda, soloBajoStock]);

  const totalBajoStock = useMemo(() => materiales.filter(m => m.bajo_stock).length, [materiales]);

  // ── umbral ─────────────────────────────────────────────────────────────
  const guardarUmbral = async (materialId: string) => {
    if (!proyecto) return;
    const valor = umbralEdit[materialId];
    const umbral = valor === '' || valor === undefined ? null : parseFloat(valor);
    if (valor !== '' && valor !== undefined && (umbral === null || isNaN(umbral) || umbral < 0)) {
      setToastColor('danger'); setToastMsg('Umbral inválido'); return;
    }
    const { error } = await supabase.rpc('bodega_set_umbral_minimo', {
      p_proyecto_id: proyecto.id, p_material_id: materialId, p_umbral: umbral,
    });
    if (error) { setToastColor('danger'); setToastMsg('No se pudo guardar el umbral: ' + error.message); }
    else cargarStock(proyecto.id);
  };

  // ── ficha ──────────────────────────────────────────────────────────────
  const abrirFicha = async (m: StockRow) => {
    setFichaMaterial(m);
    setFichaAbierta(true);
    setFichaCargando(true);
    setAjusteCantidad(''); setAjusteMotivo('');
    const [ocs, entregas, actividades] = await Promise.all([
      supabase.rpc('bodega_material_ocs', { p_material_id: m.material_id }),
      supabase.rpc('bodega_material_entregas', { p_material_id: m.material_id }),
      supabase.from('bodega_material_actividades').select('bodega_actividades ( nombre )').eq('material_id', m.material_id),
    ]);
    setFichaOcs((ocs.data as OcRow[] | null) ?? []);
    setFichaEntregas((entregas.data as EntregaRow[] | null) ?? []);
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
    setGuardandoAjuste(true);
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from('bodega_ajustes').insert({
      proyecto_id: proyecto.id,
      material_id: fichaMaterial.material_id,
      cantidad: cant,
      motivo: ajusteMotivo.trim() || null,
      registrado_por: authData?.user?.id,
    });
    setGuardandoAjuste(false);
    if (error) { setToastColor('danger'); setToastMsg('No se pudo guardar el ajuste: ' + error.message); }
    else {
      setToastColor('success'); setToastMsg('Ajuste registrado');
      setAjusteCantidad(''); setAjusteMotivo('');
      await cargarStock(proyecto.id);
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

          {proyecto && <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>{proyecto.nombre}</div>}

          {/* Búsqueda y filtro */}
          <div style={sCard}>
            <input style={sInput} placeholder="Buscar material..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: textSecondary, marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={soloBajoStock} onChange={e => setSoloBajoStock(e.target.checked)} />
              Mostrar solo bajo stock
              {totalBajoStock > 0 && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: rojoBg, color: rojo, border: `0.5px solid ${rojoBord}` }}>{totalBajoStock}</span>
              )}
            </label>
          </div>

          {cargando && <div style={{ textAlign: 'center', padding: 30 }}><IonSpinner name="crescent" /></div>}

          {!cargando && materiales.length === 0 && (
            <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: '30px 0', lineHeight: 1.6 }}>
              No hay materiales cargados todavía.<br />Sube una planilla de AYNI para empezar.
            </div>
          )}

          {!cargando && !busqueda.trim() && !soloBajoStock && materiales.length > 80 && (
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>
              Mostrando 80 de {materiales.length} materiales — usa el buscador para encontrar otros.
            </div>
          )}

          {/* Lista */}
          {materialesFiltrados.map(m => (
            <div key={m.material_id} onClick={() => abrirFicha(m)} style={{ ...sCard, cursor: 'pointer', ...(m.bajo_stock ? { borderColor: rojoBord } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: textPrimary }}>{m.nombre}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 18, fontWeight: 600, color: m.bajo_stock ? rojo : textPrimary }}>{m.stock_actual}</span>
                    <span style={{ fontSize: 12, color: textMuted }}>{m.unidad ?? 'sin unidad'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>
                    recibido {m.recibido_ayni}
                    {m.factor_conversion !== 1 && m.unidad_compra && (
                      <span> ({m.recibido_compra} {m.unidad_compra})</span>
                    )}
                    {m.entregado > 0 ? ` · entregado ${m.entregado}` : ''}
                    {m.ajuste !== 0 ? ` · ajuste ${m.ajuste > 0 ? '+' : ''}${m.ajuste}` : ''}
                  </div>
                  {m.bajo_stock && <div style={{ fontSize: 11, color: rojo, marginTop: 2, fontWeight: 500 }}>Stock bajo el mínimo</div>}
                </div>
                <div style={{ fontSize: 18, color: textMuted, flexShrink: 0 }}>›</div>
              </div>

              {/* Umbral inline (jefe de bodega) */}
              {puedeEditarCatalogo && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }} onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize: 10, color: textMuted, marginBottom: 3 }}>Umbral mínimo de alerta</div>
                  <input
                    type="number" min="0"
                    style={{ ...sInput, height: 32, fontSize: 13 }}
                    placeholder={m.umbral_minimo !== null ? String(m.umbral_minimo) : 'sin definir'}
                    value={umbralEdit[m.material_id] ?? (m.umbral_minimo !== null ? String(m.umbral_minimo) : '')}
                    onChange={e => setUmbralEdit(prev => ({ ...prev, [m.material_id]: e.target.value }))}
                    onBlur={() => guardarUmbral(m.material_id)}
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
                  <div style={{ fontSize: 11, color: textSecondary }}>Recibido AYNI</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: azul }}>
                    {fichaMaterial.recibido_ayni} <span style={{ fontSize: 13, fontWeight: 400 }}>{fichaMaterial.unidad}</span>
                  </div>
                  {fichaMaterial.factor_conversion !== 1 && fichaMaterial.unidad_compra && (
                    <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
                      = {fichaMaterial.recibido_compra} {fichaMaterial.unidad_compra}
                    </div>
                  )}
                </div>
                <div style={{ background: verdeBg, borderRadius: 12, padding: '12px', border: `0.5px solid ${verdeBord}` }}>
                  <div style={{ fontSize: 11, color: textSecondary }}>Stock en obra</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: fichaMaterial.bajo_stock ? rojo : verde }}>
                    {fichaMaterial.stock_actual} <span style={{ fontSize: 13, fontWeight: 400 }}>{fichaMaterial.unidad}</span>
                  </div>
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

                  {/* Ajuste manual opcional */}
                  {puedeAjustar && (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `0.5px solid ${border}` }}>
                      <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                        Ajuste manual {fichaMaterial.ajuste !== 0 ? `(actual: ${fichaMaterial.ajuste > 0 ? '+' : ''}${fichaMaterial.ajuste})` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: textMuted, marginBottom: 8 }}>
                        Corrige diferencias con el conteo físico. Usa negativo para descontar (ej. -5), positivo para sumar.
                      </div>
                      <input type="number" placeholder="Cantidad (+/-)" style={{ ...sInput, height: 38, marginBottom: 8 }}
                        value={ajusteCantidad} onChange={e => setAjusteCantidad(e.target.value)} />
                      <input type="text" placeholder="Motivo (opcional)" style={{ ...sInput, height: 38, marginBottom: 10 }}
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
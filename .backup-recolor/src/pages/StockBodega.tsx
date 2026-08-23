import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle, IonToast } from '@ionic/react';
import { useRef, useState, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

// ============================================================
// Tipos
// ============================================================
interface Proyecto { id: string; nombre: string; codigo: string; }

interface Material {
  id: string;
  nombre: string;
  unidad: string | null;
  especialidad: string | null;
}

interface StockRow {
  material_id: string;
  cantidad_actual: number;
  umbral_minimo: number | null;
}

interface MaterialConStock extends Material {
  cantidad_actual: number;
  umbral_minimo: number | null;
  bajoStock: boolean;
}

const UNIDADES_SUGERIDAS = ['kg', 'saco', 'unidad', 'm', 'm2', 'm3', 'rollo', 'plancha', 'litro', 'galón', 'caja', 'par'];

// ============================================================
const StockBodega: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);
  const location = useLocation<{ proyecto?: Proyecto; soloBajoStock?: boolean }>();

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
  const sInputXs: React.CSSProperties = {
    boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`,
    borderRadius: 8, padding: '4px 8px', fontSize: 12,
    background: inputBg, color: textPrimary, outline: 'none', height: 28,
  };

  // ── estado ─────────────────────────────────────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(location.state?.proyecto ?? null);
  const [rol, setRol] = useState<string>('');
  const [materiales, setMateriales] = useState<MaterialConStock[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [soloBajoStock, setSoloBajoStock] = useState(location.state?.soloBajoStock ?? false);
  const [ingresoAbierto, setIngresoAbierto] = useState<string | null>(null);
  const [cantidadIngreso, setCantidadIngreso] = useState<Record<string, string>>({});
  const [referenciaIngreso, setReferenciaIngreso] = useState<Record<string, string>>({});
  const [umbralEdit, setUmbralEdit] = useState<Record<string, string>>({});
  const [unidadEdit, setUnidadEdit] = useState<Record<string, string>>({});
  const [procesando, setProcesando] = useState<Record<string, boolean>>({});
  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  const puedeEditarCatalogo = ['jefe_bodega', 'administrador', 'staff'].includes(rol);
  const puedeIngresar = ['jefe_bodega', 'ayudante_bodega', 'administrador', 'staff'].includes(rol);

  // ── carga ──────────────────────────────────────────────────────────────
  const cargarStock = useCallback(async (proyectoId: string) => {
    const { data: materialesData } = await supabase
      .from('bodega_materiales')
      .select('id, nombre, unidad, especialidad')
      .eq('activo', true)
      .order('nombre');

    const { data: stockData } = await supabase
      .from('bodega_stock')
      .select('material_id, cantidad_actual, umbral_minimo')
      .eq('proyecto_id', proyectoId);

    const stockMap = new Map<string, StockRow>();
    (stockData as StockRow[] | null)?.forEach(s => stockMap.set(s.material_id, s));

    const combinado: MaterialConStock[] = (materialesData as Material[] | null ?? []).map(m => {
      const s = stockMap.get(m.id);
      const cantidad_actual = s?.cantidad_actual ?? 0;
      const umbral_minimo = s?.umbral_minimo ?? null;
      return {
        ...m,
        cantidad_actual,
        umbral_minimo,
        bajoStock: umbral_minimo !== null && cantidad_actual <= umbral_minimo,
      };
    });
    setMateriales(combinado);
  }, []);

  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargarInicial(); }
  });

  const cargarInicial = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;

    const { data: usuarioRow } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', authData.user.id)
      .single();
    if (usuarioRow) setRol(usuarioRow.rol ?? '');

    let proy = proyecto;
    if (!proy) {
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
    if (proy) await cargarStock(proy.id);
  };

  // ── filtrado ───────────────────────────────────────────────────────────
  const materialesFiltrados = useMemo(() => {
    let lista = materiales;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(m => m.nombre.toLowerCase().includes(q));
    }
    if (soloBajoStock) lista = lista.filter(m => m.bajoStock);
    return lista.slice(0, 80); // evita renderizar 277 filas si no se está buscando
  }, [materiales, busqueda, soloBajoStock]);

  const totalBajoStock = useMemo(() => materiales.filter(m => m.bajoStock).length, [materiales]);

  // ── acciones ───────────────────────────────────────────────────────────
  const abrirIngreso = (materialId: string) => {
    setIngresoAbierto(prev => (prev === materialId ? null : materialId));
  };

  const confirmarIngreso = async (materialId: string) => {
    if (!proyecto) return;
    const cantidad = parseFloat(cantidadIngreso[materialId] ?? '');
    if (!cantidad || cantidad <= 0) {
      setToastColor('danger'); setToastMsg('Ingresa una cantidad válida'); return;
    }
    setProcesando(prev => ({ ...prev, [materialId]: true }));
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from('bodega_movimientos_stock').insert({
      proyecto_id: proyecto.id,
      material_id: materialId,
      tipo: 'ingreso',
      cantidad,
      registrado_por: authData?.user?.id,
      referencia: (referenciaIngreso[materialId] ?? '').trim() || null,
    });
    setProcesando(prev => ({ ...prev, [materialId]: false }));
    if (error) {
      setToastColor('danger'); setToastMsg('No se pudo registrar el ingreso: ' + error.message);
    } else {
      setToastColor('success'); setToastMsg('Stock actualizado');
      setIngresoAbierto(null);
      setCantidadIngreso(prev => ({ ...prev, [materialId]: '' }));
      setReferenciaIngreso(prev => ({ ...prev, [materialId]: '' }));
      cargarStock(proyecto.id);
    }
  };

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
    if (error) {
      setToastColor('danger'); setToastMsg('No se pudo guardar el umbral: ' + error.message);
    } else {
      cargarStock(proyecto.id);
    }
  };

  const guardarUnidad = async (materialId: string) => {
    const unidad = (unidadEdit[materialId] ?? '').trim();
    const { error } = await supabase
      .from('bodega_materiales')
      .update({ unidad: unidad || null })
      .eq('id', materialId);
    if (error) {
      setToastColor('danger'); setToastMsg('No se pudo guardar la unidad: ' + error.message);
    } else if (proyecto) {
      cargarStock(proyecto.id);
    }
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
        <div style={{ padding: 16, paddingBottom: 40 }}>

          {proyecto && (
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>{proyecto.nombre}</div>
          )}

          {/* ── Búsqueda y filtro ──────────────────────────────── */}
          <div style={sCard}>
            <input
              style={sInput}
              placeholder="Buscar material..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: textSecondary, marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={soloBajoStock} onChange={e => setSoloBajoStock(e.target.checked)} />
              Mostrar solo bajo stock
              {totalBajoStock > 0 && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: rojoBg, color: rojo, border: `0.5px solid ${rojoBord}` }}>
                  {totalBajoStock}
                </span>
              )}
            </label>
          </div>

          {materialesFiltrados.length === 0 && (
            <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: '30px 0' }}>
              No se encontraron materiales.
            </div>
          )}

          {!busqueda.trim() && !soloBajoStock && materiales.length > 80 && (
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>
              Mostrando 80 de {materiales.length} materiales — usa el buscador para encontrar otros.
            </div>
          )}

          {/* ── Lista de materiales ────────────────────────────── */}
          {materialesFiltrados.map(m => (
            <div key={m.id} style={{ ...sCard, ...(m.bajoStock ? { borderColor: rojoBord } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: textPrimary }}>{m.nombre}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 18, fontWeight: 600, color: m.bajoStock ? rojo : textPrimary }}>
                      {m.cantidad_actual}
                    </span>
                    <span style={{ fontSize: 12, color: textMuted }}>{m.unidad ?? 'sin unidad'}</span>
                  </div>
                  {m.bajoStock && (
                    <div style={{ fontSize: 11, color: rojo, marginTop: 2, fontWeight: 500 }}>Stock bajo el mínimo</div>
                  )}
                </div>

                {puedeIngresar && (
                  <button
                    onClick={() => abrirIngreso(m.id)}
                    style={{ background: azulBg, color: azul, border: `0.5px solid ${azulBord}`, borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    + Ingresar
                  </button>
                )}
              </div>

              {/* ── Ingreso manual ──────────────────────────────── */}
              {ingresoAbierto === m.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <input
                      type="number" min="0" placeholder="Cantidad"
                      style={{ ...sInput, height: 36, flex: 1 }}
                      value={cantidadIngreso[m.id] ?? ''}
                      onChange={e => setCantidadIngreso(prev => ({ ...prev, [m.id]: e.target.value }))}
                    />
                  </div>
                  <input
                    type="text" placeholder="Referencia (ej: guía de despacho, opcional)"
                    style={{ ...sInput, height: 36, marginBottom: 8 }}
                    value={referenciaIngreso[m.id] ?? ''}
                    onChange={e => setReferenciaIngreso(prev => ({ ...prev, [m.id]: e.target.value }))}
                  />
                  <button
                    disabled={procesando[m.id]}
                    onClick={() => confirmarIngreso(m.id)}
                    style={{ width: '100%', background: verde, color: '#ffffff', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {procesando[m.id] ? 'Guardando...' : 'Confirmar ingreso'}
                  </button>
                </div>
              )}

              {/* ── Edición de unidad y umbral (jefe de bodega) ─── */}
              {puedeEditarCatalogo && (
                <div style={{ display: 'flex', gap: 10, marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: textMuted, marginBottom: 3 }}>Unidad</div>
                    <input
                      style={{ ...sInputXs, width: '100%' }}
                      list={`unidades-${m.id}`}
                      placeholder={m.unidad ?? '—'}
                      value={unidadEdit[m.id] ?? m.unidad ?? ''}
                      onChange={e => setUnidadEdit(prev => ({ ...prev, [m.id]: e.target.value }))}
                      onBlur={() => guardarUnidad(m.id)}
                    />
                    <datalist id={`unidades-${m.id}`}>
                      {UNIDADES_SUGERIDAS.map(u => <option key={u} value={u} />)}
                    </datalist>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: textMuted, marginBottom: 3 }}>Umbral mínimo</div>
                    <input
                      type="number" min="0"
                      style={{ ...sInputXs, width: '100%' }}
                      placeholder={m.umbral_minimo !== null ? String(m.umbral_minimo) : 'sin definir'}
                      value={umbralEdit[m.id] ?? (m.umbral_minimo !== null ? String(m.umbral_minimo) : '')}
                      onChange={e => setUmbralEdit(prev => ({ ...prev, [m.id]: e.target.value }))}
                      onBlur={() => guardarUmbral(m.id)}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

        </div>
      </IonContent>

      <IonToast
        isOpen={!!toastMsg}
        message={toastMsg}
        duration={2500}
        color={toastColor}
        onDidDismiss={() => setToastMsg('')}
      />
    </IonPage>
  );
};

export default StockBodega;

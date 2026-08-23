import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle } from '@ionic/react';
import { useRef, useState, useCallback, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

// ============================================================
// Tipos
// ============================================================
interface Proyecto { id: string; nombre: string; direccion: string | null; codigo: string; }

interface ValeReciente {
  id: string;
  codigo: string;
  retira_nombre: string;
  fecha_emision: string;
  torres: { nombre: string } | null;
  vales_bodega_items: { estado: string }[];
}

interface MaterialBajoStock {
  material_id: string;
  cantidad_actual: number;
  umbral_minimo: number;
  bodega_materiales: { nombre: string; unidad: string | null } | null;
}

// ============================================================
const DashboardBodega: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);
  const history = useHistory();

  // ── tokens (idénticos al sistema de diseño VAIN) ──────────────────────────
  const bg            = dark ? '#000000' : '#f0f4f8';
  const cardGrad       = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border         = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary    = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary  = dark ? '#6b7280'  : '#64748b';
  const textMuted      = dark ? '#444444'  : '#94a3b8';
  const toolbar        = dark ? '#000000'  : '#1e3a5f';

  const verde      = dark ? '#4ade80' : '#15803d';
  const verdeBg    = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord  = dark ? 'rgba(74,222,128,0.2)'  : '#bbf7d0';
  const amarillo     = dark ? '#fbbf24' : '#a16207';
  const amarilloBg   = dark ? 'rgba(251,191,36,0.06)' : '#fffbeb';
  const amarilloBord = dark ? 'rgba(251,191,36,0.2)'  : '#fde68a';
  const rojo       = dark ? '#f87171' : '#b91c1c';
  const rojoBg     = dark ? 'rgba(239,68,68,0.08)' : '#fef2f2';
  const rojoBord   = dark ? 'rgba(239,68,68,0.2)' : '#fecaca';

  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`,
    padding: '14px 14px', marginBottom: 12,
  };
  const sSecLabel: React.CSSProperties = {
    fontSize: 11, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1px', fontWeight: 600, marginBottom: 10,
  };

  // ── estado ─────────────────────────────────────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [valesRecientes, setValesRecientes] = useState<ValeReciente[]>([]);
  const [pendientesCount, setPendientesCount] = useState(0);
  const [materialesBajoStock, setMaterialesBajoStock] = useState<MaterialBajoStock[]>([]);

  // ── carga ──────────────────────────────────────────────────────────────
  const cargarVales = useCallback(async (proyectoId: string) => {
    const { data } = await supabase
      .from('vales_bodega')
      .select(`
        id, codigo, retira_nombre, fecha_emision,
        torres ( nombre ),
        vales_bodega_items ( estado )
      `)
      .eq('proyecto_id', proyectoId)
      .order('fecha_emision', { ascending: false })
      .limit(5);

    const lista = (data as unknown as ValeReciente[]) ?? [];
    setValesRecientes(lista);

    // Para el contador de pendientes consideramos también vales fuera del top 5
    const { count } = await supabase
      .from('vales_bodega_items')
      .select('id, vales_bodega!inner(proyecto_id)', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
      .eq('vales_bodega.proyecto_id', proyectoId);
    setPendientesCount(count ?? 0);
  }, []);

  const cargarStockBajo = useCallback(async (proyectoId: string) => {
    const { data } = await supabase
      .from('bodega_stock')
      .select('material_id, cantidad_actual, umbral_minimo, bodega_materiales ( nombre, unidad )')
      .eq('proyecto_id', proyectoId)
      .not('umbral_minimo', 'is', null);

    const bajoStock = ((data as unknown as MaterialBajoStock[]) ?? [])
      .filter(m => m.cantidad_actual <= m.umbral_minimo)
      .sort((a, b) => (a.cantidad_actual - a.umbral_minimo) - (b.cantidad_actual - b.umbral_minimo))
      .slice(0, 5);
    setMaterialesBajoStock(bajoStock);
  }, []);

  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargarInicial(); }
  });

  const cargarInicial = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;

    const { data: up } = await supabase
      .from('usuario_proyectos')
      .select('proyecto_id, proyectos ( id, nombre, direccion, codigo )')
      .eq('usuario_id', authData.user.id)
      .eq('es_principal', true)
      .single();

    const proy = up?.proyectos as unknown as Proyecto | undefined;
    if (!proy) return;
    setProyecto(proy);
    await Promise.all([cargarVales(proy.id), cargarStockBajo(proy.id)]);
  };

  // ── Realtime: refresca solo cuando algo de bodega cambia en este proyecto ──
  useEffect(() => {
    if (!proyecto) return;
    const channel = supabase
      .channel(`bodega-dashboard-${proyecto.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vales_bodega', filter: `proyecto_id=eq.${proyecto.id}` },
        () => cargarVales(proyecto.id)
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vales_bodega_items' },
        () => cargarVales(proyecto.id)
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bodega_stock', filter: `proyecto_id=eq.${proyecto.id}` },
        () => cargarStockBajo(proyecto.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [proyecto, cargarVales, cargarStockBajo]);

  // ── derivados ──────────────────────────────────────────────────────────
  const estadoVale = (v: ValeReciente) => {
    const items = v.vales_bodega_items;
    if (items.some(i => i.estado === 'pendiente')) return { label: 'Pendiente', bg: amarilloBg, color: amarillo, border: amarilloBord };
    if (items.every(i => i.estado === 'aprobado')) return { label: 'Aprobado', bg: verdeBg, color: verde, border: verdeBord };
    if (items.every(i => i.estado === 'rechazado')) return { label: 'Rechazado', bg: rojoBg, color: rojo, border: rojoBord };
    return { label: 'Con observaciones', bg: amarilloBg, color: amarillo, border: amarilloBord };
  };

  const tiempoDesde = (fecha: string) => {
    const diffMs = Date.now() - new Date(fecha).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'recién';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} d`;
  };

  // ============================================================
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Bodega</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16, paddingBottom: 40 }}>

          {/* ── Banner del proyecto ─────────────────────────────── */}
          {proyecto && (
            <div
              onClick={() => history.push('/bodega/stock', { proyecto })}
              style={{
                borderRadius: 18, padding: '20px 18px', marginBottom: 16, cursor: 'pointer',
                background: dark
                  ? 'linear-gradient(135deg, #111827 0%, #1f2937 100%)'
                  : 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                color: '#ffffff',
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                {proyecto.codigo}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{proyecto.nombre}</div>
              {proyecto.direccion && (
                <div style={{ fontSize: 12, opacity: 0.8 }}>{proyecto.direccion}</div>
              )}
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 12 }}>Ver stock de bodega →</div>
            </div>
          )}

          {!proyecto && (
            <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: '30px 0' }}>
              No tienes un proyecto principal asignado todavía.
            </div>
          )}

          {/* ── Tarjeta: últimos vales ──────────────────────────── */}
          <div style={sCard} onClick={() => proyecto && history.push('/bodega/aprobacion', { proyecto })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={sSecLabel}>Últimos vales</div>
              {pendientesCount > 0 && (
                <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 10, background: amarilloBg, color: amarillo, border: `0.5px solid ${amarilloBord}`, fontWeight: 600 }}>
                  {pendientesCount} pendiente{pendientesCount === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {valesRecientes.length === 0 && (
              <div style={{ fontSize: 13, color: textMuted }}>Sin solicitudes todavía.</div>
            )}

            {valesRecientes.map((v, idx) => {
              const est = estadoVale(v);
              return (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < valesRecientes.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {v.retira_nombre}
                    </div>
                    <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>
                      {v.codigo} · {v.torres ? `Torre ${v.torres.nombre}` : 'Exteriores'} · {tiempoDesde(v.fecha_emision)}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 8, background: est.bg, color: est.color, border: `0.5px solid ${est.border}`, whiteSpace: 'nowrap', marginLeft: 8 }}>
                    {est.label}
                  </span>
                </div>
              );
            })}

            <div style={{ fontSize: 12, color: textSecondary, marginTop: 10, textAlign: 'center' }}>Ver todos →</div>
          </div>

          {/* ── Tarjeta: materiales bajo el mínimo ──────────────── */}
          <div style={sCard} onClick={() => proyecto && history.push('/bodega/stock', { proyecto, soloBajoStock: true })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={sSecLabel}>Materiales bajo el mínimo</div>
              {materialesBajoStock.length > 0 && (
                <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 10, background: rojoBg, color: rojo, border: `0.5px solid ${rojoBord}`, fontWeight: 600 }}>
                  {materialesBajoStock.length}
                </span>
              )}
            </div>

            {materialesBajoStock.length === 0 && (
              <div style={{ fontSize: 13, color: textMuted }}>Todo el stock está sobre su umbral mínimo.</div>
            )}

            {materialesBajoStock.map((m, idx) => (
              <div key={m.material_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < materialesBajoStock.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                <div style={{ fontSize: 13, color: textPrimary }}>{m.bodega_materiales?.nombre ?? 'Material'}</div>
                <div style={{ fontSize: 12, color: rojo, fontWeight: 500 }}>
                  {m.cantidad_actual} / {m.umbral_minimo}{m.bodega_materiales?.unidad ? ` ${m.bodega_materiales.unidad}` : ''}
                </div>
              </div>
            ))}

            <div style={{ fontSize: 12, color: textSecondary, marginTop: 10, textAlign: 'center' }}>Ver stock completo →</div>
          </div>

        </div>
      </IonContent>
    </IonPage>
  );
};

export default DashboardBodega;

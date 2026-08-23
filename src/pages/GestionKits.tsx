import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle, IonToast, IonModal, IonSpinner } from '@ionic/react';
import { useRef, useState, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

// ============================================================
// Tipos
// ============================================================
interface Proyecto { id: string; nombre: string; codigo: string; }

interface Kit {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

interface Material {
  id: string;
  nombre: string;
  unidad_solicitud: string | null;
  unidad_compra: string | null;
  factor_conversion: number;
}

interface KitItem {
  id: string;
  material_id: string;
  cantidad: number;
  material_nombre: string;
  material_unidad: string | null;
  notaOriginal?: string;
}

// ============================================================
const GestionKits: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);
  const location = useLocation<{ proyecto?: Proyecto }>();

  // ── tokens (idénticos al resto del módulo bodega) ──────────────────────
  const bg            = dark ? '#0B1220' : '#f0f4f8';
  const cardGrad       = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const border         = dark ? '#243550'  : '#e2e8f0';
  const textPrimary    = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary  = dark ? '#6b7280'  : '#64748b';
  const textMuted      = dark ? '#5D728F'  : '#94a3b8';
  const toolbar        = dark ? '#0E1728'  : '#1e3a5f';
  const inputBg        = dark ? '#1B2C48'  : '#ffffff';
  const inputBorder    = dark ? '#243550'  : '#cbd5e1';

  const azul      = dark ? '#60a5fa' : '#1d4ed8';
  const rojo      = dark ? '#f87171' : '#b91c1c';
  const textMutedBadge = dark ? 'rgba(148,163,184,0.12)' : '#f1f5f9';

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
  const sBtnSecondary: React.CSSProperties = {
    width: '100%', height: 40, borderRadius: 12, background: 'transparent',
    border: `0.5px solid ${border}`, color: textSecondary, fontSize: 13, cursor: 'pointer',
  };

  // ── estado ─────────────────────────────────────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(location.state?.proyecto ?? null);
  const [kits, setKits] = useState<Kit[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  // Crear kit
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [descNuevo, setDescNuevo] = useState('');
  const [creando, setCreando] = useState(false);

  // Editor de kit (modal)
  const [kitEditando, setKitEditando] = useState<Kit | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [items, setItems] = useState<KitItem[]>([]);
  const [itemsCargando, setItemsCargando] = useState(false);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [materialInput, setMaterialInput] = useState('');
  const [materialSeleccionado, setMaterialSeleccionado] = useState<Material | null>(null);
  const [cantidadInput, setCantidadInput] = useState('1');
  const [unidadElegida, setUnidadElegida] = useState<'solicitud' | 'compra'>('solicitud');
  const [guardandoItem, setGuardandoItem] = useState(false);

  // ── carga ──────────────────────────────────────────────────────────────
  const cargarKits = useCallback(async (proyectoId: string) => {
    setCargando(true);
    const { data } = await supabase
      .from('bodega_kits')
      .select('id, nombre, descripcion, activo')
      .eq('proyecto_id', proyectoId)
      .order('nombre');
    setKits((data as Kit[] | null) ?? []);
    setCargando(false);
  }, []);

  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargarInicial(); }
  });

  const cargarInicial = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;

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
    if (proy) {
      await cargarKits(proy.id);
      const { data: materialesData } = await supabase
        .from('bodega_materiales')
        .select('id, nombre, unidad, unidad_solicitud, factor_conversion')
        .eq('proyecto_id', proy.id)
        .eq('activo', true)
        .order('nombre');
      if (materialesData) {
        const mapeados = (materialesData as any[]).map(m => ({
          id: m.id, nombre: m.nombre,
          unidad_solicitud: m.unidad_solicitud ?? m.unidad,
          unidad_compra: m.unidad,
          factor_conversion: m.factor_conversion ?? 1,
        }));
        setMateriales(mapeados as Material[]);
      }
    } else {
      setCargando(false);
    }
  };

  // ── crear kit ──────────────────────────────────────────────────────────
  const crearKit = async () => {
    if (!proyecto) return;
    if (!nombreNuevo.trim()) { setToastColor('danger'); setToastMsg('Ponle un nombre al kit'); return; }
    setCreando(true);
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('bodega_kits')
      .insert({
        proyecto_id: proyecto.id,
        nombre: nombreNuevo.trim(),
        descripcion: descNuevo.trim() || null,
        creado_por: authData?.user?.id ?? null,
      })
      .select('id, nombre, descripcion, activo')
      .single();
    setCreando(false);
    if (error || !data) {
      setToastColor('danger');
      setToastMsg('No se pudo crear el kit: ' + (error?.message ?? 'error desconocido'));
      return;
    }
    setKits(prev => [...prev, data as Kit].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setNombreNuevo('');
    setDescNuevo('');
    setToastColor('success');
    setToastMsg('Kit creado. Ábrelo para agregarle materiales.');
  };

  // ── activar / desactivar ──────────────────────────────────────────────
  const toggleActivo = async (kit: Kit) => {
    const nuevoEstado = !kit.activo;
    const { error } = await supabase.from('bodega_kits').update({ activo: nuevoEstado }).eq('id', kit.id);
    if (error) { setToastColor('danger'); setToastMsg('No se pudo actualizar el kit'); return; }
    setKits(prev => prev.map(k => (k.id === kit.id ? { ...k, activo: nuevoEstado } : k)));
  };

  // ── eliminar kit ───────────────────────────────────────────────────────
  const eliminarKit = async (kit: Kit) => {
    if (!window.confirm(`¿Eliminar el kit "${kit.nombre}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from('bodega_kits').delete().eq('id', kit.id);
    if (error) { setToastColor('danger'); setToastMsg('No se pudo eliminar el kit'); return; }
    setKits(prev => prev.filter(k => k.id !== kit.id));
    setToastColor('success');
    setToastMsg('Kit eliminado');
  };

  // ── editor de items del kit ───────────────────────────────────────────
  const abrirEditor = async (kit: Kit) => {
    setKitEditando(kit);
    setModalAbierto(true);
    setMaterialInput('');
    setMaterialSeleccionado(null);
    setCantidadInput('1');
    await cargarItems(kit.id);
  };

  const cargarItems = async (kitId: string) => {
    setItemsCargando(true);
    const { data } = await supabase
      .from('bodega_kit_items')
      .select('id, material_id, cantidad, bodega_materiales ( nombre, unidad, unidad_solicitud )')
      .eq('kit_id', kitId);
    const filas = ((data as any[]) ?? []).map(r => ({
      id: r.id,
      material_id: r.material_id,
      cantidad: r.cantidad,
      material_nombre: r.bodega_materiales?.nombre ?? 'Material',
      material_unidad: r.bodega_materiales?.unidad_solicitud ?? r.bodega_materiales?.unidad ?? null,
    })).sort((a, b) => a.material_nombre.localeCompare(b.material_nombre));
    setItems(filas);
    setItemsCargando(false);
  };

  const sugerenciasMaterial = useMemo(() => {
    if (!materialInput.trim()) return [];
    const q = materialInput.toLowerCase();
    const yaEnKit = new Set(items.map(i => i.material_id));
    return materiales
      .filter(m => !yaEnKit.has(m.id) && m.nombre.toLowerCase().includes(q))
      .slice(0, 8);
  }, [materialInput, materiales, items]);

  const agregarItem = async () => {
    if (!kitEditando || !materialSeleccionado) return;
    const cantidad = parseFloat(cantidadInput);
    if (!cantidad || cantidad <= 0) { setToastColor('danger'); setToastMsg('Ingresa una cantidad válida'); return; }

    const enCompra = unidadElegida === 'compra' && materialSeleccionado.factor_conversion !== 1;
    const cantidadFinal = enCompra ? cantidad * materialSeleccionado.factor_conversion : cantidad;

    setGuardandoItem(true);
    const { data, error } = await supabase
      .from('bodega_kit_items')
      .insert({ kit_id: kitEditando.id, material_id: materialSeleccionado.id, cantidad: cantidadFinal })
      .select('id, material_id, cantidad')
      .single();
    setGuardandoItem(false);
    if (error || !data) {
      setToastColor('danger');
      setToastMsg('No se pudo agregar el material: ' + (error?.message ?? ''));
      return;
    }
    setItems(prev => [...prev, {
      id: data.id, material_id: materialSeleccionado.id, cantidad: cantidadFinal,
      material_nombre: materialSeleccionado.nombre, material_unidad: materialSeleccionado.unidad_solicitud,
      notaOriginal: enCompra ? `${cantidad} ${materialSeleccionado.unidad_compra}` : undefined,
    }].sort((a, b) => a.material_nombre.localeCompare(b.material_nombre)));
    setUnidadElegida('solicitud');
    setMaterialInput('');
    setMaterialSeleccionado(null);
    setCantidadInput('1');
  };

  const quitarItem = async (itemId: string) => {
    const { error } = await supabase.from('bodega_kit_items').delete().eq('id', itemId);
    if (error) { setToastColor('danger'); setToastMsg('No se pudo quitar el material'); return; }
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  // ============================================================
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Kits de materiales</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16, paddingBottom: 40 }}>

          {proyecto && (
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>
              Proyecto: <strong style={{ color: textPrimary }}>{proyecto.nombre}</strong>
            </div>
          )}

          {/* ── Crear kit ─────────────────────────────────────── */}
          <div style={sCard}>
            <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 10 }}>
              Nuevo kit
            </div>
            <input
              style={{ ...sInput, marginBottom: 8 }}
              placeholder="Nombre del kit (ej. Instalación puerta interior)"
              value={nombreNuevo}
              onChange={e => setNombreNuevo(e.target.value)}
            />
            <input
              style={{ ...sInput, marginBottom: 10 }}
              placeholder="Descripción (opcional)"
              value={descNuevo}
              onChange={e => setDescNuevo(e.target.value)}
            />
            <button style={sBtnPrimary} disabled={creando} onClick={crearKit}>
              {creando ? 'Creando...' : '+ Crear kit'}
            </button>
          </div>

          {/* ── Lista de kits ─────────────────────────────────── */}
          {cargando && <div style={{ textAlign: 'center', padding: 30 }}><IonSpinner name="crescent" /></div>}

          {!cargando && kits.length === 0 && (
            <div style={{ fontSize: 13, color: textMuted, textAlign: 'center', padding: '20px 0' }}>
              Todavía no hay kits creados en este proyecto.
            </div>
          )}

          {kits.map(kit => (
            <div key={kit.id} style={sCard}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div onClick={() => abrirEditor(kit)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ fontSize: 15, color: textPrimary, fontWeight: 600 }}>{kit.nombre}</div>
                  {kit.descripcion && <div style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>{kit.descripcion}</div>}
                  {!kit.activo && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: textMutedBadge, color: textMuted, marginTop: 6, display: 'inline-block' }}>
                      Inactivo
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 18, color: textMuted, flexShrink: 0, cursor: 'pointer' }} onClick={() => abrirEditor(kit)}>›</div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }}>
                <span onClick={() => toggleActivo(kit)} style={{ fontSize: 12, color: azul, cursor: 'pointer' }}>
                  {kit.activo ? 'Desactivar' : 'Activar'}
                </span>
                <span onClick={() => eliminarKit(kit)} style={{ fontSize: 12, color: rojo, cursor: 'pointer' }}>
                  Eliminar
                </span>
              </div>
            </div>
          ))}
        </div>
      </IonContent>

      {/* ── Editor de items del kit ────────────────────────────────────── */}
      <IonModal isOpen={modalAbierto} onDidDismiss={() => setModalAbierto(false)} initialBreakpoint={0.9} breakpoints={[0, 0.9, 1]}>
        <div style={{ padding: 20, background: dark ? '#0E1728' : '#ffffff', height: '100%', overflowY: 'auto' }}>
          {kitEditando && (
            <>
              <div style={{ fontSize: 17, fontWeight: 600, color: textPrimary }}>{kitEditando.nombre}</div>
              {kitEditando.descripcion && (
                <div style={{ fontSize: 13, color: textSecondary, marginTop: 2 }}>{kitEditando.descripcion}</div>
              )}

              <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, margin: '18px 0 8px' }}>
                Agregar material al kit
              </div>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  style={sInput}
                  placeholder="Buscar material..."
                  value={materialInput}
                  onChange={e => { setMaterialInput(e.target.value); setMaterialSeleccionado(null); }}
                />
                {sugerenciasMaterial.length > 0 && !materialSeleccionado && (
                  <div style={{ border: `0.5px solid ${border}`, borderRadius: 10, marginTop: 4, background: inputBg, position: 'absolute', zIndex: 10, width: '100%', overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                    {sugerenciasMaterial.map(m => (
                      <div
                        key={m.id}
                        onClick={() => { setMaterialSeleccionado(m); setMaterialInput(m.nombre); setUnidadElegida('solicitud'); }}
                        style={{ padding: '8px 12px', fontSize: 13, color: textPrimary, cursor: 'pointer', borderBottom: `0.5px solid ${border}` }}
                      >
                        {m.nombre}{!m.unidad_solicitud && <span style={{ color: textMuted }}> (sin unidad)</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Elegir unidad, solo si el material tiene ambas y son distintas */}
              {materialSeleccionado && materialSeleccionado.factor_conversion !== 1 && materialSeleccionado.unidad_compra && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    onClick={() => setUnidadElegida('solicitud')}
                    style={{
                      flex: 1, height: 34, borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      border: `0.5px solid ${unidadElegida === 'solicitud' ? azul : border}`,
                      background: unidadElegida === 'solicitud' ? 'rgba(29,78,216,0.08)' : 'transparent',
                      color: unidadElegida === 'solicitud' ? azul : textSecondary,
                    }}
                  >
                    En {materialSeleccionado.unidad_solicitud}
                  </button>
                  <button
                    onClick={() => setUnidadElegida('compra')}
                    style={{
                      flex: 1, height: 34, borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      border: `0.5px solid ${unidadElegida === 'compra' ? azul : border}`,
                      background: unidadElegida === 'compra' ? 'rgba(29,78,216,0.08)' : 'transparent',
                      color: unidadElegida === 'compra' ? azul : textSecondary,
                    }}
                  >
                    En {materialSeleccionado.unidad_compra}
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  style={{ ...sInput, flex: 1 }}
                  type="number" min="0" placeholder="Cantidad"
                  value={cantidadInput}
                  onChange={e => setCantidadInput(e.target.value)}
                />
                <button
                  style={{ ...sBtnPrimary, width: 120, padding: 0 }}
                  disabled={guardandoItem || !materialSeleccionado}
                  onClick={agregarItem}
                >
                  Agregar
                </button>
              </div>

              <div style={{ height: '0.5px', background: border, margin: '14px 0' }} />
              <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 8 }}>
                Materiales del kit
              </div>

              {itemsCargando && <div style={{ textAlign: 'center', padding: 20 }}><IonSpinner name="crescent" /></div>}

              {!itemsCargando && items.length === 0 && (
                <div style={{ fontSize: 13, color: textMuted }}>Este kit todavía no tiene materiales.</div>
              )}

              {!itemsCargando && items.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < items.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                  <div>
                    <div style={{ fontSize: 14, color: textPrimary }}>{item.material_nombre}</div>
                    {item.notaOriginal && (
                      <div style={{ fontSize: 11, color: textMuted }}>ingresado como {item.notaOriginal}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: textSecondary }}>{item.cantidad}{item.material_unidad ? ` ${item.material_unidad}` : ''}</span>
                    <span onClick={() => quitarItem(item.id)} style={{ color: rojo, cursor: 'pointer', fontSize: 13 }}>Quitar</span>
                  </div>
                </div>
              ))}

              <button onClick={() => setModalAbierto(false)} style={{ ...sBtnSecondary, marginTop: 20 }}>
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

export default GestionKits;
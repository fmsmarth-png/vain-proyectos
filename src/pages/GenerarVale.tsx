import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle, IonToast, IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/react';
import { useRef, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

// ============================================================
// Tipos
// ============================================================
interface Proyecto {
  id: string;
  nombre: string;
  codigo: string;
}

interface Torre {
  id: string;
  nombre: string;   // letra, ej "A"
  frente: string;   // id interno de obra de la torre
}

interface Departamento {
  id: string;
  numero: number;
  id_obra: string;        // ej "1F1.1"
  frente_depto: string;   // ej "1F1" — ya viene fusionado desde la BD
  piso: number;
}

interface Actividad {
  id: string;
  nombre: string;
}

interface Kit {
  id: string;
  nombre: string;
  descripcion: string | null;
}

interface Material {
  id: string;
  nombre: string;
  unidad_solicitud: string | null; // unidad granular (litros, kg...) — puede ser null hasta que el jefe de bodega la asigne
  unidad_compra: string | null;    // unidad de empaque tal cual la reporta AYNI (tambores, sacos...)
  factor_conversion: number;       // 1 = no hay distinción, solo existe una unidad
  actividad_id: string | null;
  stockActual: number;             // stock_actual de bodega_stock_actual para el proyecto (0 si no hay registro)
  tieneStock: boolean;             // stockActual > 0
}

interface ItemCarrito {
  material_id: string;
  nombre: string;
  unidad: string | null;      // unidad canónica en la que queda guardada la cantidad (siempre granular cuando existe)
  cantidad: number;
  notaOriginal?: string;      // ej. "5 TAMBOR 200 L" — cómo lo tecleó la persona, si eligió la unidad de compra
  sinStock?: boolean;         // se agregó a la solicitud sin stock disponible en bodega al momento de agregarlo
}

interface Usuario {
  id: string;
  nombre: string;
  rol: string;
  especialidad: string | null;
}

// ============================================================
// Helper: iniciales del emisor para el código del vale (ej "Hernán Díaz" -> "HD")
// ============================================================
function obtenerIniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'XX';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// ============================================================
// Página: Generar Vale Electrónico
//
// NOTA DE INTEGRACIÓN (pendiente de confirmar con el resto de la app):
// igual que InspeccionDepto, esta página asume que recibe el proyecto
// activo vía location.state.proyecto al navegar (state: { proyecto }).
// Si en tu router no llega así, ajusta cargarProyecto() para tomarlo
// de donde corresponda (route param, contexto, etc.)
// ============================================================
const GenerarVale: React.FC = () => {
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
  const sepLine         = dark
    ? 'linear-gradient(90deg, transparent, #243550, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';
  const azul      = dark ? '#60a5fa' : '#1d4ed8';
  const azulBg    = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const azulBord  = dark ? 'rgba(96,165,250,0.2)'  : '#bfdbfe';
  const rojo      = dark ? '#f87171' : '#b91c1c';
  const rojoBg    = dark ? 'rgba(239,68,68,0.08)' : '#fef2f2';
  const rojoBord  = dark ? 'rgba(239,68,68,0.25)' : '#fecaca';
  const verde     = dark ? '#4ade80' : '#15803d';
  const verdeBg   = dark ? 'rgba(74,222,128,0.08)' : '#f0fdf4';
  const verdeBord = dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0';

  const sCard: React.CSSProperties = {
    background: cardGrad,
    borderRadius: 16,
    border: `0.5px solid ${border}`,
    padding: '14px 14px',
    marginBottom: 10,
  };
  const sSecLabel: React.CSSProperties = {
    fontSize: 9, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12,
  };
  const sInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`,
    borderRadius: 10, padding: '8px 12px', fontSize: 14,
    background: inputBg, color: textPrimary, outline: 'none', height: 44,
  };
  const sInputSmall: React.CSSProperties = { ...sInput, height: 36, fontSize: 13 };
  const sFieldLabel: React.CSSProperties = { fontSize: 11, color: textSecondary, marginBottom: 4 };
  const sRow2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 };
  const sBtnPrimary: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', color: '#ffffff',
    border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 14,
    fontWeight: 700, width: '100%', cursor: 'pointer',
  };
  const sBtnSecondary: React.CSSProperties = {
    width: '100%', height: 40, borderRadius: 12, background: 'transparent',
    border: `0.5px solid ${border}`, color: textSecondary, fontSize: 13, cursor: 'pointer',
  };
  const chip: React.CSSProperties = {
    fontSize: 12, padding: '4px 10px', borderRadius: 999,
    background: azulBg, color: azul, border: `0.5px solid ${azulBord}`,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  // ── estado ─────────────────────────────────────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(location.state?.proyecto ?? null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [torres, setTorres] = useState<Torre[]>([]);
  const [torreId, setTorreId] = useState<string>('');
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [deptosSeleccionados, setDeptosSeleccionados] = useState<Set<string>>(new Set());
  const [mostrarDeptos, setMostrarDeptos] = useState(false);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [actividadesSeleccionadas, setActividadesSeleccionadas] = useState<Actividad[]>([]);
  const [actividadInput, setActividadInput] = useState('');
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [cuadrillas, setCuadrillas] = useState<{ id: string; nombre: string }[]>([]);
  const [cuadrillaSeleccionada, setCuadrillaSeleccionada] = useState('');
  const [materialesCuadrilla, setMaterialesCuadrilla] = useState<Set<string> | null>(null);
  const [kits, setKits] = useState<Kit[]>([]);
  const [aplicandoKit, setAplicandoKit] = useState<string | null>(null);
  const [materialInput, setMaterialInput] = useState('');
  const [materialSeleccionado, setMaterialSeleccionado] = useState<Material | null>(null);
  const [cantidadInput, setCantidadInput] = useState('1');
  const [unidadElegida, setUnidadElegida] = useState<'solicitud' | 'compra'>('solicitud');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [retiraNombre, setRetiraNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  // ── carga inicial ──────────────────────────────────────────────────────
  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargarInicial(); }
  });

  const cargarInicial = async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;

    const { data: usuarioRow } = await supabase
      .from('usuarios')
      .select('id, nombre, rol, especialidad')
      .eq('id', authData.user.id)
      .single();
    if (usuarioRow) setUsuario(usuarioRow as Usuario);

    let proy = proyecto;
    if (!proy) {
      // fallback: si no llegó por navegación, usar el proyecto principal del usuario
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
    if (!proy) return;

    const { data: torresData } = await supabase
      .from('torres')
      .select('id, nombre, frente')
      .eq('proyecto_id', proy.id);
    if (torresData) {
      // Se ordena por número de frente (orden de construcción), no por la
      // letra definitiva de venta — pueden no coincidir. Comparación
      // numérica real para que "10" no quede antes que "2".
      const ordenadas = (torresData as Torre[]).slice().sort((a, b) =>
        a.frente.localeCompare(b.frente, undefined, { numeric: true }));
      setTorres(ordenadas);
    }

    const { data: actividadesData } = await supabase
      .from('bodega_actividades')
      .select('id, nombre')
      .order('nombre');
    if (actividadesData) setActividades(actividadesData as Actividad[]);

    const { data: kitsData } = await supabase
      .from('bodega_kits')
      .select('id, nombre, descripcion')
      .eq('proyecto_id', proy.id)
      .eq('activo', true)
      .order('nombre');
    if (kitsData) setKits(kitsData as Kit[]);

    const { data: cuadData } = await supabase
      .from('bodega_cuadrillas')
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre');
    if (cuadData) setCuadrillas((cuadData as any[]).map(c => ({ id: c.id, nombre: c.nombre })));

    // Sin filtro por especialidad por ahora: TODOS los roles (jefe de terreno,
    // profesionales, admin) ven TODOS los materiales del proyecto. El catálogo
    // de AYNI no distingue especialidad todavía, y filtrar solo complicaba las
    // pruebas (ej. jefes de terreno sin especialidad quedaban sin ver nada).
    // El filtro por especialidad se puede reintroducir a futuro cuando se mapee
    // familia→especialidad.
    const { data: materialesData } = await supabase
      .from('bodega_materiales')
      .select('id, nombre, unidad, unidad_solicitud, factor_conversion, actividad_id')
      .eq('proyecto_id', proy.id)
      .eq('activo', true)
      .order('nombre');

    // ── stock disponible en bodega (vista bodega_stock_actual) ─────────
    const { data: stockData } = await supabase
      .from('bodega_stock_actual')
      .select('material_id, stock_actual')
      .eq('proyecto_id', proy.id);
    const stockMap = new Map<string, number>();
    (stockData as { material_id: string; stock_actual: number }[] | null)?.forEach(s =>
      stockMap.set(s.material_id, s.stock_actual)
    );

    if (materialesData) {
      const mapeados = (materialesData as any[]).map(m => {
        const stockActual = stockMap.get(m.id) ?? 0;
        return {
          id: m.id, nombre: m.nombre,
          unidad_solicitud: m.unidad_solicitud ?? m.unidad,
          unidad_compra: m.unidad,
          factor_conversion: m.factor_conversion ?? 1,
          actividad_id: m.actividad_id,
          stockActual,
          tieneStock: stockActual > 0,
        };
      });
      setMateriales(mapeados as Material[]);
    }
  };

  // Pull-to-refresh: recarga el catálogo (materiales, kits, torres) deslizando
  // hacia abajo — útil si el jefe de bodega acaba de cargar una planilla nueva
  // o creó un kit y el jefe de terreno quiere verlo sin salir de la pantalla.
  const onRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await cargarInicial();
    e.detail.complete();
  };

  // ── torre → departamentos ─────────────────────────────────────────────
  const ES_EXTERIORES = 'EXTERIORES';

  const handleTorreChange = async (id: string) => {
    setTorreId(id);
    setDeptosSeleccionados(new Set());
    setMostrarDeptos(false);
    if (!id || id === ES_EXTERIORES) { setDepartamentos([]); return; }
    const { data } = await supabase
      .from('departamentos')
      .select('id, numero, id_obra, frente_depto, piso')
      .eq('torre_id', id)
      .order('piso', { ascending: true })
      .order('numero', { ascending: true });
    if (data) setDepartamentos(data as Departamento[]);
  };

  const toggleDepto = (id: string) => {
    setDeptosSeleccionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Selecciona o deselecciona TODOS los departamentos de un frente de una vez.
  // Si ya están todos seleccionados, el clic los quita a todos (toggle);
  // si falta alguno, el clic completa el grupo. La selección individual de
  // cada departamento sigue disponible debajo, por si se necesita pedir
  // solo uno de los dos.
  const toggleFrenteCompleto = (deptosDelFrente: Departamento[]) => {
    const ids = deptosDelFrente.map(d => d.id);
    const todosSeleccionados = ids.every(id => deptosSeleccionados.has(id));
    setDeptosSeleccionados(prev => {
      const next = new Set(prev);
      ids.forEach(id => (todosSeleccionados ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  // Agrupa departamentos por frente_depto para el checklist
  const deptosPorFrente = useMemo(() => {
    const grupos = new Map<string, Departamento[]>();
    departamentos.forEach(d => {
      const key = d.frente_depto || 'Sin frente';
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(d);
    });
    return Array.from(grupos.entries());
  }, [departamentos]);

  // Chips colapsados: un chip por cada frente_depto distinto entre los deptos seleccionados
  const chipsFrentes = useMemo(() => {
    const frentes = new Set<string>();
    departamentos.forEach(d => { if (deptosSeleccionados.has(d.id)) frentes.add(d.frente_depto || 'Sin frente'); });
    return Array.from(frentes);
  }, [departamentos, deptosSeleccionados]);

  // ── filtro de actividades (multi-select tipo tag) ─────────────────────
  const sugerenciasActividad = useMemo(() => {
    if (!actividadInput.trim()) return [];
    const yaSeleccionadas = new Set(actividadesSeleccionadas.map(a => a.id));
    const q = actividadInput.toLowerCase();
    return actividades
      .filter(a => !yaSeleccionadas.has(a.id) && a.nombre.toLowerCase().includes(q))
      .slice(0, 8);
  }, [actividadInput, actividades, actividadesSeleccionadas]);

  const agregarActividad = (a: Actividad) => {
    setActividadesSeleccionadas(prev => [...prev, a]);
    setActividadInput('');
  };
  const quitarActividad = (id: string) => {
    setActividadesSeleccionadas(prev => prev.filter(a => a.id !== id));
  };

  // Sin filtro por actividad por ahora (ver comentarios en sección eliminada).
  // Filtro por cuadrilla: cadena cuadrilla → actividades → materiales.
  const filtrarPorCuadrilla = async (cuadrillaId: string) => {
    setCuadrillaSeleccionada(cuadrillaId);
    if (!cuadrillaId) { setMaterialesCuadrilla(null); return; }

    const { data: cuadActs } = await supabase
      .from('bodega_cuadrilla_actividades')
      .select('actividad_id')
      .eq('cuadrilla_id', cuadrillaId);
    const actIds = ((cuadActs as any[]) ?? []).map(r => r.actividad_id);
    if (actIds.length === 0) { setMaterialesCuadrilla(new Set()); return; }

    const { data: matActs } = await supabase
      .from('bodega_material_actividades')
      .select('material_id')
      .in('actividad_id', actIds);
    setMaterialesCuadrilla(new Set(((matActs as any[]) ?? []).map(r => r.material_id)));
  };

  const materialesDisponibles = useMemo(() => {
    if (!materialesCuadrilla) return materiales;
    return materiales.filter(m => materialesCuadrilla.has(m.id));
  }, [materiales, materialesCuadrilla]);

  const sugerenciasMaterial = useMemo(() => {
    if (!materialInput.trim()) return [];
    const q = materialInput.toLowerCase();
    return materialesDisponibles.filter(m => m.nombre.toLowerCase().includes(q)).slice(0, 8);
  }, [materialInput, materialesDisponibles]);

  const agregarMaterialCarrito = () => {
    if (!materialSeleccionado) return;
    const cantidad = parseFloat(cantidadInput);
    if (!cantidad || cantidad <= 0) {
      setToastColor('danger'); setToastMsg('Ingresa una cantidad válida'); return;
    }
    // Si la persona eligió pedir en unidad de compra (ej. "2 tambores"), se
    // convierte a la unidad granular ANTES de guardar — el stock y el
    // descuento siempre quedan en una sola unidad consistente, sin importar
    // cómo lo haya tecleado quien pidió el material.
    const enCompra = unidadElegida === 'compra' && materialSeleccionado.factor_conversion !== 1;
    const cantidadFinal = enCompra ? cantidad * materialSeleccionado.factor_conversion : cantidad;
    const sinStock = !materialSeleccionado.tieneStock;
    setCarrito(prev => [...prev, {
      material_id: materialSeleccionado.id,
      nombre: materialSeleccionado.nombre,
      unidad: materialSeleccionado.unidad_solicitud,
      cantidad: cantidadFinal,
      notaOriginal: enCompra ? `${cantidad} ${materialSeleccionado.unidad_compra}` : undefined,
      sinStock,
    }]);
    if (sinStock) {
      setToastColor('danger');
      setToastMsg(`"${materialSeleccionado.nombre}" no tiene stock disponible en bodega. Se agregó igual a la solicitud.`);
    }
    setMaterialSeleccionado(null);
    setMaterialInput('');
    setCantidadInput('1');
    setUnidadElegida('solicitud');
  };

  const quitarDelCarrito = (idx: number) => {
    setCarrito(prev => prev.filter((_, i) => i !== idx));
  };

  // Permite ajustar la cantidad de un ítem ya en el carrito (venga de un kit
  // o agregado a mano) sin tener que quitarlo y volver a agregarlo.
  const actualizarCantidadCarrito = (idx: number, valor: string) => {
    const cantidad = parseFloat(valor);
    setCarrito(prev => prev.map((item, i) => (i === idx ? { ...item, cantidad: isNaN(cantidad) ? 0 : cantidad, notaOriginal: undefined } : item)));
  };

  // ── usar kit: agrega todos sus materiales al carrito de una vez ────────
  // Si un material del kit ya estaba en el carrito, suma la cantidad en vez
  // de duplicar la línea. Las cantidades quedan editables como cualquier
  // ítem agregado a mano (quitar/editar sigue el mismo flujo de siempre).
  const usarKit = async (kit: Kit) => {
    setAplicandoKit(kit.id);
    const { data, error } = await supabase
      .from('bodega_kit_items')
      .select('material_id, cantidad, bodega_materiales ( nombre, unidad, unidad_solicitud )')
      .eq('kit_id', kit.id);
    setAplicandoKit(null);

    if (error || !data || data.length === 0) {
      setToastColor('danger');
      setToastMsg('Este kit no tiene materiales o no se pudo cargar');
      return;
    }

    setCarrito(prev => {
      const siguiente = [...prev];
      for (const fila of data as any[]) {
        const idxExistente = siguiente.findIndex(i => i.material_id === fila.material_id);
        if (idxExistente >= 0) {
          siguiente[idxExistente] = {
            ...siguiente[idxExistente],
            cantidad: siguiente[idxExistente].cantidad + Number(fila.cantidad),
          };
        } else {
          const materialInfo = materiales.find(m => m.id === fila.material_id);
          siguiente.push({
            material_id: fila.material_id,
            nombre: fila.bodega_materiales?.nombre ?? 'Material',
            unidad: fila.bodega_materiales?.unidad_solicitud ?? fila.bodega_materiales?.unidad ?? null,
            cantidad: Number(fila.cantidad),
            sinStock: materialInfo ? !materialInfo.tieneStock : undefined,
          });
        }
      }
      return siguiente;
    });

    setToastColor('success');
    setToastMsg(`Kit "${kit.nombre}" agregado a la solicitud`);
  };

  // ── emitir vale ────────────────────────────────────────────────────────
  const handleEmitir = async () => {
    if (!proyecto || !usuario) return;
    const esExterior = torreId === ES_EXTERIORES;
    if (!retiraNombre.trim()) { setToastColor('danger'); setToastMsg('Falta el nombre de quien retira'); return; }
    if (!torreId) { setToastColor('danger'); setToastMsg('Selecciona la torre'); return; }
    if (!esExterior && deptosSeleccionados.size === 0) { setToastColor('danger'); setToastMsg('Selecciona al menos un departamento'); return; }
    if (carrito.length === 0) { setToastColor('danger'); setToastMsg('Agrega al menos un material'); return; }
    if (carrito.some(item => !item.cantidad || item.cantidad <= 0)) {
      setToastColor('danger');
      setToastMsg('Hay materiales con cantidad 0 — corrígelos o quítalos antes de emitir');
      return;
    }

    setGuardando(true);
    try {
      const iniciales = obtenerIniciales(usuario.nombre);
      const { data: vale, error: errorVale } = await supabase.rpc('bodega_crear_vale', {
        p_proyecto_id: proyecto.id,
        p_torre_id: esExterior ? null : torreId,
        p_emitido_por: usuario.id,
        p_iniciales: iniciales,
        p_retira_nombre: retiraNombre.trim(),
        p_es_exterior: esExterior,
      });
      if (errorVale || !vale) throw errorVale || new Error('No se pudo crear el vale');

      const valeId = (vale as any).id;

      if (!esExterior) {
        const filasDeptos = Array.from(deptosSeleccionados).map(depto_id => ({
          vale_id: valeId, departamento_id: depto_id,
        }));
        const { error: errorDeptos } = await supabase.from('vales_bodega_deptos').insert(filasDeptos);
        if (errorDeptos) throw errorDeptos;
      }

      const filasItems = carrito.map(item => ({
        vale_id: valeId, material_id: item.material_id, cantidad_solicitada: item.cantidad,
      }));
      const { error: errorItems } = await supabase.from('vales_bodega_items').insert(filasItems);
      if (errorItems) throw errorItems;

      setToastColor('success');
      setToastMsg(`Vale ${(vale as any).codigo} emitido correctamente`);

      // reset del formulario
      setRetiraNombre('');
      setTorreId('');
      setDepartamentos([]);
      setDeptosSeleccionados(new Set());
      setActividadesSeleccionadas([]);
      setCarrito([]);
    } catch (e: any) {
      setToastColor('danger');
      setToastMsg('Error al emitir el vale: ' + (e?.message || 'desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  // ============================================================
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Nueva solicitud de material</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <IonRefresher slot="fixed" onIonRefresh={onRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div style={{ padding: 16, paddingBottom: 40 }}>

          {proyecto && (
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>
              Proyecto: <strong style={{ color: textPrimary }}>{proyecto.nombre}</strong>
            </div>
          )}

          {/* ── Retira ─────────────────────────────────────────── */}
          <div style={sCard}>
            <div style={sSecLabel}>Retira el material</div>
            <input
              style={sInput}
              placeholder="Nombre completo del maestro"
              value={retiraNombre}
              onChange={e => setRetiraNombre(e.target.value)}
            />
          </div>

          {/* ── Torre ──────────────────────────────────────────── */}
          <div style={sCard}>
            <div style={sSecLabel}>Torre</div>
            <select
              style={sInput}
              value={torreId}
              onChange={e => handleTorreChange(e.target.value)}
            >
              <option value="">Selecciona una torre</option>
              {torres.map(t => (
                <option key={t.id} value={t.id}>Torre {t.nombre} · frente {t.frente}</option>
              ))}
              <option value={ES_EXTERIORES}>Exteriores</option>
            </select>
          </div>

          {/* ── Departamentos ──────────────────────────────────── */}
          {torreId && torreId !== ES_EXTERIORES && (
            <div style={sCard}>
              <div style={sSecLabel}>Departamentos</div>
              {chipsFrentes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {chipsFrentes.map(f => <span key={f} style={chip}>{f}</span>)}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setMostrarDeptos(v => !v)}
                  style={{ ...sInput, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                >
                  <span style={{ color: deptosSeleccionados.size ? textPrimary : textMuted }}>
                    {deptosSeleccionados.size > 0 ? `${deptosSeleccionados.size} departamento(s) seleccionados` : 'Selecciona departamentos'}
                  </span>
                  <span style={{ color: textMuted, fontSize: 12 }}>{mostrarDeptos ? '▲' : '▼'}</span>
                </div>

                {mostrarDeptos && (
                  <div style={{ border: `0.5px solid ${border}`, borderRadius: 10, marginTop: 4, padding: 10, background: inputBg, position: 'absolute', zIndex: 10, width: '100%', maxHeight: 280, overflowY: 'auto', boxSizing: 'border-box' }}>
                    {deptosPorFrente.map(([frente, deptos]) => {
                      const idsGrupo = deptos.map(d => d.id);
                      const todosSeleccionados = idsGrupo.every(id => deptosSeleccionados.has(id));
                      const algunoSeleccionado = idsGrupo.some(id => deptosSeleccionados.has(id));
                      return (
                        <div
                          key={frente}
                          onClick={() => toggleFrenteCompleto(deptos)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 2px', borderBottom: `0.5px solid ${border}`, cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, color: textPrimary, flexShrink: 0 }}>
                            <input
                              type="checkbox"
                              checked={todosSeleccionados}
                              ref={el => { if (el) el.indeterminate = !todosSeleccionados && algunoSeleccionado; }}
                              onChange={() => toggleFrenteCompleto(deptos)}
                              onClick={e => e.stopPropagation()}
                              style={{ width: 18, height: 18, pointerEvents: 'auto' }}
                            />
                            {frente}
                          </div>

                          {/* Deptos individuales: acción secundaria, para pedir
                              solo uno del frente en vez del frente completo */}
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {deptos.map(d => {
                              const marcado = deptosSeleccionados.has(d.id);
                              const sufijo = d.id_obra.includes('.') ? d.id_obra.split('.').pop() : d.numero;
                              return (
                                <span
                                  key={d.id}
                                  onClick={e => { e.stopPropagation(); toggleDepto(d.id); }}
                                  title={`${d.id_obra} (depto ${d.numero})`}
                                  style={{
                                    fontSize: 11, padding: '3px 8px', borderRadius: 8, cursor: 'pointer',
                                    border: `0.5px solid ${marcado ? azul : border}`,
                                    background: marcado ? azulBg : 'transparent',
                                    color: marcado ? azul : textMuted,
                                  }}
                                >
                                  .{sufijo}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {departamentos.length === 0 && (
                      <div style={{ fontSize: 13, color: textMuted }}>Esta torre no tiene departamentos cargados.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Filtro por cuadrilla ──────────────────────────── */}
          {cuadrillas.length > 0 && (
            <div style={sCard}>
              <div style={sSecLabel}>Filtrar por cuadrilla</div>
              <select
                style={sInput}
                value={cuadrillaSeleccionada}
                onChange={e => filtrarPorCuadrilla(e.target.value)}
              >
                <option value="">Todas las cuadrillas</option>
                {cuadrillas.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              {materialesCuadrilla && (
                <div style={{ fontSize: 11, color: textMuted, marginTop: 6 }}>
                  {materialesCuadrilla.size} material{materialesCuadrilla.size !== 1 ? 'es' : ''} de esta cuadrilla
                </div>
              )}
            </div>
          )}

          {/* ── Kits de materiales ─────────────────────────────── */}
          {kits.length > 0 && (
            <div style={sCard}>
              <div style={sSecLabel}>Usar un kit</div>
              <select
                style={sInput}
                value=""
                disabled={!!aplicandoKit}
                onChange={e => {
                  const kit = kits.find(k => k.id === e.target.value);
                  if (kit) usarKit(kit);
                }}
              >
                <option value="" disabled>
                  {aplicandoKit ? 'Agregando...' : 'Selecciona un kit para agregarlo'}
                </option>
                {kits.map(kit => (
                  <option key={kit.id} value={kit.id}>{kit.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── Materiales ─────────────────────────────────────── */}
          <div style={sCard}>
            <div style={sSecLabel}>Agregar material</div>
            <div style={sRow2}>
              <div style={{ position: 'relative' }}>
                <input
                  style={sInputSmall}
                  placeholder="Buscar material..."
                  value={materialInput}
                  onChange={e => { setMaterialInput(e.target.value); setMaterialSeleccionado(null); }}
                />
                {sugerenciasMaterial.length > 0 && !materialSeleccionado && (
                  <div style={{ border: `0.5px solid ${border}`, borderRadius: 10, marginTop: 4, background: inputBg, position: 'absolute', zIndex: 10, width: '100%', overflow: 'hidden' }}>
                    {sugerenciasMaterial.map(m => (
                      <div
                        key={m.id}
                        onClick={() => { setMaterialSeleccionado(m); setMaterialInput(m.nombre); setUnidadElegida('solicitud'); }}
                        style={{ padding: '8px 12px', fontSize: 13, color: textPrimary, cursor: 'pointer', borderBottom: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                      >
                        <span>{m.nombre}{!m.unidad_solicitud && <span style={{ color: textMuted }}> (sin unidad)</span>}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                          color: m.tieneStock ? verde : rojo,
                          background: m.tieneStock ? verdeBg : rojoBg,
                          border: `0.5px solid ${m.tieneStock ? verdeBord : rojoBord}`,
                        }}>
                          {m.tieneStock ? `Stock: ${m.stockActual}${m.unidad_solicitud ? ` ${m.unidad_solicitud}` : ''}` : 'Sin stock'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {materialSeleccionado && (
                  <div style={{
                    marginTop: 6, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                    color: materialSeleccionado.tieneStock ? verde : rojo,
                  }}>
                    {materialSeleccionado.tieneStock
                      ? `✔ Stock disponible en bodega: ${materialSeleccionado.stockActual}${materialSeleccionado.unidad_solicitud ? ` ${materialSeleccionado.unidad_solicitud}` : ''}`
                      : '⚠ Sin stock en bodega para este material'}
                  </div>
                )}
              </div>
              <input
                style={sInputSmall}
                type="number"
                min="0"
                placeholder="Cant."
                value={cantidadInput}
                onChange={e => setCantidadInput(e.target.value)}
              />
            </div>

            {/* Elegir en qué unidad se está pidiendo, solo si el material tiene
                ambas (granular y de compra) y son distintas */}
            {materialSeleccionado && materialSeleccionado.factor_conversion !== 1 && materialSeleccionado.unidad_compra && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button
                  onClick={() => setUnidadElegida('solicitud')}
                  style={{
                    flex: 1, height: 34, borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    border: `0.5px solid ${unidadElegida === 'solicitud' ? azul : border}`,
                    background: unidadElegida === 'solicitud' ? azulBg : 'transparent',
                    color: unidadElegida === 'solicitud' ? azul : textSecondary,
                  }}
                >
                  Pedir en {materialSeleccionado.unidad_solicitud}
                </button>
                <button
                  onClick={() => setUnidadElegida('compra')}
                  style={{
                    flex: 1, height: 34, borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    border: `0.5px solid ${unidadElegida === 'compra' ? azul : border}`,
                    background: unidadElegida === 'compra' ? azulBg : 'transparent',
                    color: unidadElegida === 'compra' ? azul : textSecondary,
                  }}
                >
                  Pedir en {materialSeleccionado.unidad_compra}
                </button>
              </div>
            )}

            <button style={sBtnSecondary} onClick={agregarMaterialCarrito}>+ Agregar a la lista</button>
          </div>

          {/* ── Carrito / Materiales en esta solicitud ──────────── */}
          {carrito.length > 0 && (
            <div style={{
              ...sCard,
              border: `1px solid ${azul}40`,
              background: dark ? 'linear-gradient(135deg, #0d1a2e 0%, #162544 100%)' : 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: azul }}>
                  Materiales en esta solicitud
                </div>
                <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 10, background: azulBg, color: azul, border: `0.5px solid ${azul}40`, fontWeight: 600 }}>
                  {carrito.length}
                </span>
              </div>
              {carrito.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < carrito.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: textPrimary, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.nombre}
                      {item.sinStock && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999, whiteSpace: 'nowrap',
                          color: rojo, background: rojoBg, border: `0.5px solid ${rojoBord}`,
                        }}>
                          SIN STOCK
                        </span>
                      )}
                    </div>
                    {item.notaOriginal && (
                      <div style={{ fontSize: 11, color: textMuted }}>ingresado como {item.notaOriginal}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <input
                      type="number" min="0"
                      value={item.cantidad}
                      onChange={e => actualizarCantidadCarrito(idx, e.target.value)}
                      style={{ ...sInputSmall, width: 64, height: 32, padding: '4px 8px', textAlign: 'right' }}
                    />
                    {item.unidad && <span style={{ fontSize: 12, color: textSecondary }}>{item.unidad}</span>}
                    <span onClick={() => quitarDelCarrito(idx)} style={{ color: rojo, cursor: 'pointer', fontSize: 13 }}>Quitar</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button style={sBtnPrimary} disabled={guardando} onClick={handleEmitir}>
            {guardando ? 'Emitiendo...' : 'Emitir solicitud de material'}
          </button>

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

export default GenerarVale;
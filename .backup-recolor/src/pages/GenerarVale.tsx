import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle, IonToast } from '@ionic/react';
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

interface Material {
  id: string;
  nombre: string;
  unidad: string | null; // puede venir null hasta que el jefe de bodega la asigne
  actividad_id: string | null;
}

interface ItemCarrito {
  material_id: string;
  nombre: string;
  unidad: string | null;
  cantidad: number;
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
  const bg            = dark ? '#000000' : '#f0f4f8';
  const cardGrad       = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border         = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary    = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary  = dark ? '#6b7280'  : '#64748b';
  const textMuted      = dark ? '#444444'  : '#94a3b8';
  const toolbar        = dark ? '#000000'  : '#1e3a5f';
  const inputBg        = dark ? '#111111'  : '#ffffff';
  const inputBorder    = dark ? '#1e1e1e'  : '#cbd5e1';
  const sepLine         = dark
    ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';
  const azul      = dark ? '#60a5fa' : '#1d4ed8';
  const azulBg    = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const azulBord  = dark ? 'rgba(96,165,250,0.2)'  : '#bfdbfe';
  const rojo      = dark ? '#f87171' : '#b91c1c';

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
  const [materialInput, setMaterialInput] = useState('');
  const [materialSeleccionado, setMaterialSeleccionado] = useState<Material | null>(null);
  const [cantidadInput, setCantidadInput] = useState('1');
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
      .eq('proyecto_id', proy.id)
      .order('nombre');
    if (torresData) setTorres(torresData as Torre[]);

    const { data: actividadesData } = await supabase
      .from('bodega_actividades')
      .select('id, nombre')
      .order('nombre');
    if (actividadesData) setActividades(actividadesData as Actividad[]);

    const rolActual = usuarioRow?.rol ?? '';
    const especialidadActual = usuarioRow?.especialidad ?? null;
    const esAdmin = ['administrador', 'staff'].includes(rolActual);
    if (esAdmin || especialidadActual) {
      let query = supabase
        .from('bodega_materiales')
        .select('id, nombre, unidad, actividad_id')
        .eq('activo', true);
      if (!esAdmin && especialidadActual) query = query.eq('especialidad', especialidadActual);
      const { data: materialesData } = await query.order('nombre');
      if (materialesData) setMateriales(materialesData as Material[]);
    }
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

  // ── materiales disponibles (especialidad del usuario + actividades elegidas) ─
  const materialesDisponibles = useMemo(() => {
    if (actividadesSeleccionadas.length === 0) return materiales;
    const idsActividad = new Set(actividadesSeleccionadas.map(a => a.id));
    return materiales.filter(m => m.actividad_id && idsActividad.has(m.actividad_id));
  }, [materiales, actividadesSeleccionadas]);

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
    setCarrito(prev => [...prev, {
      material_id: materialSeleccionado.id,
      nombre: materialSeleccionado.nombre,
      unidad: materialSeleccionado.unidad,
      cantidad,
    }]);
    setMaterialSeleccionado(null);
    setMaterialInput('');
    setCantidadInput('1');
  };

  const quitarDelCarrito = (idx: number) => {
    setCarrito(prev => prev.filter((_, i) => i !== idx));
  };

  // ── emitir vale ────────────────────────────────────────────────────────
  const handleEmitir = async () => {
    if (!proyecto || !usuario) return;
    const esExterior = torreId === ES_EXTERIORES;
    if (!retiraNombre.trim()) { setToastColor('danger'); setToastMsg('Falta el nombre de quien retira'); return; }
    if (!torreId) { setToastColor('danger'); setToastMsg('Selecciona la torre'); return; }
    if (!esExterior && deptosSeleccionados.size === 0) { setToastColor('danger'); setToastMsg('Selecciona al menos un departamento'); return; }
    if (carrito.length === 0) { setToastColor('danger'); setToastMsg('Agrega al menos un material'); return; }

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
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Nueva solicitud de material</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
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
                    {deptosPorFrente.map(([frente, deptos]) => (
                      <div key={frente} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: textMuted, marginBottom: 4 }}>Frente {frente}</div>
                        {deptos.map(d => (
                          <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: textPrimary, padding: '4px 0' }}>
                            <input
                              type="checkbox"
                              checked={deptosSeleccionados.has(d.id)}
                              onChange={() => toggleDepto(d.id)}
                            />
                            {d.id_obra} <span style={{ color: textMuted, fontSize: 12 }}>(depto {d.numero})</span>
                          </label>
                        ))}
                      </div>
                    ))}
                    {departamentos.length === 0 && (
                      <div style={{ fontSize: 13, color: textMuted }}>Esta torre no tiene departamentos cargados.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Filtro de actividad ────────────────────────────── */}
          <div style={sCard}>
            <div style={sSecLabel}>Filtrar por actividad (opcional)</div>
            {actividadesSeleccionadas.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {actividadesSeleccionadas.map(a => (
                  <span key={a.id} style={chip}>
                    {a.nombre}
                    <span onClick={() => quitarActividad(a.id)} style={{ cursor: 'pointer', fontWeight: 700 }}> ×</span>
                  </span>
                ))}
              </div>
            )}
            <input
              style={sInput}
              placeholder="Buscar actividad..."
              value={actividadInput}
              onChange={e => setActividadInput(e.target.value)}
            />
            {sugerenciasActividad.length > 0 && (
              <div style={{ border: `0.5px solid ${border}`, borderRadius: 10, marginTop: 4, overflow: 'hidden' }}>
                {sugerenciasActividad.map(a => (
                  <div
                    key={a.id}
                    onClick={() => agregarActividad(a)}
                    style={{ padding: '8px 12px', fontSize: 13, color: textPrimary, cursor: 'pointer', borderBottom: `0.5px solid ${border}` }}
                  >
                    {a.nombre}
                  </div>
                ))}
              </div>
            )}
          </div>

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
                        onClick={() => { setMaterialSeleccionado(m); setMaterialInput(m.nombre); }}
                        style={{ padding: '8px 12px', fontSize: 13, color: textPrimary, cursor: 'pointer', borderBottom: `0.5px solid ${border}` }}
                      >
                        {m.nombre}{!m.unidad && <span style={{ color: textMuted }}> (sin unidad)</span>}
                      </div>
                    ))}
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
            <button style={sBtnSecondary} onClick={agregarMaterialCarrito}>+ Agregar a la lista</button>

            {carrito.length > 0 && (
              <>
                <div style={{ height: '0.5px', background: sepLine, margin: '14px 0' }} />
                <div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>Materiales en esta solicitud</div>
                {carrito.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < carrito.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                    <span style={{ fontSize: 14, color: textPrimary }}>{item.nombre}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, color: textSecondary }}>{item.cantidad}{item.unidad ? ` ${item.unidad}` : ''}</span>
                      <span onClick={() => quitarDelCarrito(idx)} style={{ color: rojo, cursor: 'pointer', fontSize: 13 }}>Quitar</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

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

import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonButton, IonSpinner
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import VisitasPostVenta from '../components/VisitasPostVenta';
import {
  Building2, CheckCircle2, FileText, Check, Eye, ClipboardList, Info, MoreVertical, Home, User, Phone, Calendar, Edit
} from 'lucide-react';

const DetalleDepto: React.FC = () => {
  const history = useHistory();
  const location = useLocation<any>();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  // Intentar leer de location.state primero
  let initialDepto = location.state?.depto;
  let initialTorre = location.state?.torre;
  let initialProyecto = location.state?.proyecto;

  // Si location.state está vacío, intentar recuperar de sessionStorage
  if (!initialDepto) {
    const cached = sessionStorage.getItem('detalleDeptoCache');
    if (cached) {
      try {
        const data = JSON.parse(cached);
        initialDepto = data.depto;
        initialTorre = data.torre;
        initialProyecto = data.proyecto;
      } catch (e) {}
    }
  }

  // TODOS los useState ANTES de cualquier validación
  const [depto, setDepto] = useState<any>(initialDepto || null);
  const [torre, setTorre] = useState<any>(initialTorre || null);
  const [proyecto, setProyecto] = useState<any>(initialProyecto || null);
  const [rolUsuario, setRolUsuario] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [propietarioNombre, setPropietarioNombre] = useState('');
  const [propietarioRut, setPropietarioRut] = useState('');
  const [propietarioTelefono, setPropietarioTelefono] = useState('');
  const [fechaPreEntrega, setFechaPreEntrega] = useState('');
  const [obsTotal, setObsTotal] = useState(0);
  const [obsPendientes, setObsPendientes] = useState(0);
  const [obsSolucionadas, setObsSolucionadas] = useState(0);
  const [obsPostVenta, setObsPostVenta] = useState(0);
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [datosOk, setDatosOk] = useState(false);
  const [editando, setEditando] = useState(false);
  // Copia de lo que vino de la BD, para saber si el formulario cambió
  const [datosOriginales, setDatosOriginales] = useState({ nombre: '', rut: '', telefono: '' });
  const [preentregaEstado, setPreentregaEstado] = useState(1);
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Sincronizar datos con location.state y guardar en sessionStorage
  useEffect(() => {
    if (location.state?.depto && location.state?.torre && location.state?.proyecto) {
      setDepto(location.state.depto);
      setTorre(location.state.torre);
      setProyecto(location.state.proyecto);
      // Cachear en sessionStorage
      sessionStorage.setItem('detalleDeptoCache', JSON.stringify({
        depto: location.state.depto,
        torre: location.state.torre,
        proyecto: location.state.proyecto
      }));
    }
  }, [location.state?.depto?.id]); // Solo reaccionar si el ID del depto cambia

  const esAdmin = rolUsuario === 'administrador';

  const bg            = dark ? '#0B1220' : '#f0f4f8';
  const card          = dark ? '#16233B'  : '#ffffff';
  const border        = dark ? '#243550'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#5D728F' : '#94a3b8';
  const toolbar       = dark ? '#0E1728' : '#1e3a5f';
  const inputBg       = dark ? '#1B2C48' : '#ffffff';
  const inputBorder   = dark ? '#243550' : '#cbd5e1';

  // Validación
  const tieneDatos = depto && torre && proyecto;

  useEffect(() => {
    if (!depto || !proyecto) {
      return;
    }
    setLoading(true);
    
    // Cargar usuario del auth
    const cargarUsuario = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: usuarioData } = await supabase
          .from('usuarios')
          .select('rol')
          .eq('id', user.id)
          .single();
        if (usuarioData?.rol) {
          setRolUsuario(usuarioData.rol);
        }
      }
    };

    // Cargar datos del depto
    const cargarDepto = async () => {
      try {
        const { data: deptoDB, error: deptErr } = await supabase
          .from('departamentos')
          .select('propietario_nombre, propietario_telefono, acta_propietario_rut, acta_fecha_promesa, preentrega_estado')
          .eq('id', depto.id)
          .single();

        if (deptoDB) {
          setPropietarioNombre(deptoDB.propietario_nombre || '');
          setPropietarioRut(deptoDB.acta_propietario_rut || '');
          setPropietarioTelefono(deptoDB.propietario_telefono || '');
          setFechaPreEntrega(deptoDB.acta_fecha_promesa || '');
          setPreentregaEstado(deptoDB.preentrega_estado || 1);
          setDatosOriginales({
            nombre:   deptoDB.propietario_nombre || '',
            rut:      deptoDB.acta_propietario_rut || '',
            telefono: deptoDB.propietario_telefono || '',
          });
        }
      } catch (err) {
        console.error('Error cargando depto:', err);
      }
    };

    // Cargar observaciones.
    // Se filtra por departamento_id, que es la clave real: depto_numero +
    // proyecto_id no distingue torres dentro del mismo proyecto.
    const cargarObservaciones = async () => {
      try {
        const { data: obs, error: obsErr } = await supabase
          .from('observacionesinformepv')
          .select('id, estado, tipo')
          .eq('departamento_id', depto.id);

        if (obsErr) console.error('Error cargando obs:', obsErr);

        const preE = obs?.filter(o => o.tipo === 'PRE-E') ?? [];

        setObsTotal(preE.length);
        setObsPendientes(preE.filter(o => o.estado === 'PENDIENTE').length);
        setObsSolucionadas(preE.filter(o => o.estado === 'SOLUCIONADO').length);
        setObsPostVenta(obs?.filter(o => o.tipo === 'PV').length ?? 0);
      } catch (err) {
        console.error('Error cargando obs:', err);
      }
    };

    Promise.all([cargarUsuario(), cargarDepto(), cargarObservaciones()]).finally(() => {
      setLoading(false);
    });
  }, [depto, proyecto]);

  // useEffect SEPARADO para recalcular estado después de que se cargó de la BD
  useEffect(() => {
    if (loading) return; // Esperar a que termine de cargar
    
    // SOLO recalcular si el estado está en 1-3 (no fue marcado manualmente)
    if (preentregaEstado <= 3) {
      let nuevoEstado = 1;
      if (obsTotal === 0) {
        nuevoEstado = 1; // Sin Pre-Entrega
      } else if (obsPendientes > 0) {
        nuevoEstado = 2; // Con Pre-Entrega (obs pendiente)
      } else if (obsSolucionadas === obsTotal && obsTotal > 0) {
        nuevoEstado = 3; // Listo para entregar a inmobiliaria
      }
      
      if (nuevoEstado !== preentregaEstado) {
        setPreentregaEstado(nuevoEstado);
        console.log('Estado recalculado:', nuevoEstado);
      }
    }
  }, [loading, obsTotal, obsPendientes, obsSolucionadas, preentregaEstado]);

  // El teléfono lo edita cualquiera: es un dato que se consigue después.
  // Nombre y RUT vienen del acta de pre-entrega y solo los toca un administrador.
  // Para el enlace tel: solo dígitos y el signo +
  const telefonoParaLlamar = propietarioTelefono.replace(/[^\d+]/g, '');

  const cambioTelefono = propietarioTelefono.trim() !== datosOriginales.telefono.trim();
  const hayCambios = esAdmin
    ? cambioTelefono
      || propietarioNombre.trim() !== datosOriginales.nombre.trim()
      || propietarioRut.trim()    !== datosOriginales.rut.trim()
    : cambioTelefono;

  const cancelarEdicion = () => {
    setPropietarioNombre(datosOriginales.nombre);
    setPropietarioRut(datosOriginales.rut);
    setPropietarioTelefono(datosOriginales.telefono);
    setEditando(false);
  };

  const guardarDatos = async () => {
    // Sin cambios no vale la pena ir a la BD: solo se sale del modo edición
    if (!hayCambios) { setEditando(false); return; }
    
    setGuardandoDatos(true);
    try {
      // Validar formato básico de teléfono (si se ingresa)
      if (propietarioTelefono.trim() && !/^[+]?[0-9\s()-]{9,}$/.test(propietarioTelefono.trim())) {
        console.warn('Formato de teléfono incorrecto:', propietarioTelefono);
      }

      // Un no-admin solo manda el teléfono, para no arriesgar los datos del acta
      const cambios: Record<string, any> = {
        propietario_telefono: propietarioTelefono.trim() || null,
      };
      if (esAdmin) {
        cambios.propietario_nombre = propietarioNombre.trim() || null;
        cambios.acta_propietario_rut = propietarioRut.trim() || null;
      }

      const { error } = await supabase
        .from('departamentos')
        .update(cambios)
        .eq('id', depto.id);

      if (error) {
        console.error('Error en Supabase:', error);
        throw error;
      }

      setDatosOriginales(prev => ({
        nombre:   esAdmin ? propietarioNombre.trim() : prev.nombre,
        rut:      esAdmin ? propietarioRut.trim()    : prev.rut,
        telefono: propietarioTelefono.trim(),
      }));
      setEditando(false);
      setDatosOk(true);
      setTimeout(() => setDatosOk(false), 2500);
    } catch (err) {
      console.error('❌ Error guardando datos:', err);
    }
    setGuardandoDatos(false);
  };

  const cambiarEstadoEntregado = async (nuevoEstado: 4 | 5) => {
    if (!esAdmin || (preentregaEstado !== 3 && preentregaEstado !== 4)) return;
    setGuardandoDatos(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuario no identificado');

      const columnaFecha = nuevoEstado === 4 ? 'preentrega_fecha_entregado_inmobiliaria' : 'preentrega_fecha_entregado_propietario';
      const columnaUsuario = nuevoEstado === 4 ? 'preentrega_usuario_id_entregado_inmobiliaria' : 'preentrega_usuario_id_entregado_propietario';

      const { error } = await supabase
        .from('departamentos')
        .update({
          preentrega_estado: nuevoEstado,
          [columnaFecha]: new Date().toISOString(),
          [columnaUsuario]: user.id,
        })
        .eq('id', depto.id);

      if (error) throw error;
      setPreentregaEstado(nuevoEstado);
      setMenuAbierto(false); // Cerrar menú después de cambiar estado
    } catch (err) {
      console.error('Error al cambiar estado:', err);
    }
    setGuardandoDatos(false);
  };

  const getEstadoInfo = () => {
    const estadoMap: Record<number, { label: string; color: string; step: number }> = {
      1: { label: 'Sin Pre Entrega', color: dark ? '#6b7280' : '#9ca3af', step: 0 },
      2: { label: 'Depto con Pre Entrega', color: dark ? '#f87171' : '#f87171', step: 1 },
      3: { label: 'Listo para entregar a inmobiliaria', color: dark ? '#4ade80' : '#22c55e', step: 2 },
      4: { label: 'Entregado a inmobiliaria', color: dark ? '#a78bfa' : '#8b5cf6', step: 3 },
      5: { label: 'Entregado al propietario', color: dark ? '#ec4899' : '#ec4899', step: 4 }
    };
    return estadoMap[preentregaEstado] || estadoMap[1];
  };

  const estadoInfo = getEstadoInfo();
  const inputStyle = { width: '100%', height: 44, borderRadius: 0, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };
  const labelStyle = { fontSize: 10, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1px', fontWeight: 600 };

  return (
    <IonPage id="main-content">
      {!tieneDatos || loading ? (
        <>
          <IonHeader>
            <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
              <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }} onClick={() => history.goBack()}>← Volver</IonButton>
              <IonTitle style={{ fontSize: 14 }}>Cargando...</IonTitle>
            </IonToolbar>
          </IonHeader>
          <IonContent style={{ '--background': bg }}>
            <div style={{ textAlign: 'center', marginTop: 100 }}><IonSpinner name="crescent" /></div>
          </IonContent>
        </>
      ) : (
        <>
          <IonHeader>
            <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
              <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }} onClick={() => history.goBack()}>← Volver</IonButton>
              <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Detalle Departamento</IonTitle>
              <IonButton slot="end" fill="clear" style={{ '--color': dark ? '#999' : 'rgba(255,255,255,0.8)' }}>⋮</IonButton>
            </IonToolbar>
          </IonHeader>

          <IonContent style={{ '--background': bg }}>
            <div style={{ padding: 16, paddingBottom: 80 }}>
          <div style={{ background: card, borderRadius: 14, padding: 16, marginBottom: 20, border: `0.5px solid ${border}` }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 60, height: 60, borderRadius: 12, background: dark ? 'linear-gradient(135deg, #1e3a5f, #2563eb)' : 'linear-gradient(135deg, #1e3a5f, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Home size={28} color="#fff" strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Torre {torre?.nombre}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: textPrimary, marginBottom: 6 }}>Departamento {depto?.numero}</div>
                {depto?.piso && (
                  <div style={{ fontSize: 11, color: textSecondary }}>Piso {depto.piso}</div>
                )}
              </div>
            </div>
          </div>

          {/* INFORMACIÓN DEL PROPIETARIO */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={18} strokeWidth={1.5} />
              Información del Propietario
            </div>

            <div style={{ background: card, borderRadius: 0, padding: 16, border: 'none' }}>
              {!esAdmin && !propietarioNombre && (
                <div style={{ background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb', border: dark ? '0.5px solid rgba(251,191,36,0.2)' : '0.5px solid #fde68a', borderRadius: 10, padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Info size={16} style={{ color: dark ? '#fbbf24' : '#92400e', flexShrink: 0 }} strokeWidth={2} />
                  <span style={{ fontSize: 11, color: dark ? '#fbbf24' : '#92400e' }}>Se actualizarán al generar la pre-entrega</span>
                </div>
              )}

              {/* Nombre Propietario */}
              <label style={labelStyle}>Nombre</label>
              <input
                value={propietarioNombre}
                onChange={e => setPropietarioNombre(e.target.value.toUpperCase())}
                placeholder={esAdmin ? 'Nombre del propietario' : 'Se actualizará al generar pre-entrega'}
                style={{ ...inputStyle, opacity: propietarioNombre ? 1 : 0.6 }}
                disabled={!editando || !esAdmin}
              />

              {/* RUT Propietario */}
              <label style={labelStyle}>RUT</label>
              <input
                value={propietarioRut}
                onChange={e => setPropietarioRut(e.target.value)}
                placeholder={esAdmin ? 'RUT (ej: 12.345.678-9)' : 'Se actualizará al generar pre-entrega'}
                style={{ ...inputStyle, opacity: propietarioRut ? 1 : 0.6 }}
                disabled={!editando || !esAdmin}
              />

              {/* Teléfono Propietario */}
              <label style={labelStyle}>Teléfono</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={propietarioTelefono}
                  onChange={e => setPropietarioTelefono(e.target.value)}
                  placeholder={editando ? '+56 9 1234 5678' : 'Sin teléfono registrado'}
                  style={{ ...inputStyle, marginBottom: 0, flex: 1, opacity: editando || propietarioTelefono ? 1 : 0.6 }}
                  disabled={!editando}
                  inputMode="tel"
                />
                {/* Se usa un <a href="tel:"> en vez de un onClick: es lo que el
                    WebView de Capacitor entrega al marcador del sistema. */}
                {!editando && telefonoParaLlamar && (
                  <a
                    href={`tel:${telefonoParaLlamar}`}
                    style={{
                      width: 96, height: 44, flexShrink: 0,
                      background: dark ? 'rgba(74,222,128,0.10)' : '#f0fdf4',
                      border: `0.5px solid ${dark ? 'rgba(74,222,128,0.30)' : '#bbf7d0'}`,
                      color: dark ? '#4ade80' : '#15803d',
                      fontSize: 13, fontWeight: 600, textDecoration: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Phone size={15} strokeWidth={2} />
                    Llamar
                  </a>
                )}
              </div>

              {/* Editar / Guardar */}
              {(
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {editando && (
                    <button
                      onClick={cancelarEdicion}
                      disabled={guardandoDatos}
                      style={{
                        flex: 1, height: 44, borderRadius: 0, background: 'transparent',
                        border: `0.5px solid ${inputBorder}`, color: textSecondary,
                        fontSize: 13, fontWeight: 600,
                        cursor: guardandoDatos ? 'default' : 'pointer',
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={() => (editando ? guardarDatos() : setEditando(true))}
                    disabled={guardandoDatos}
                    style={{
                      flex: 1, height: 44, borderRadius: 0,
                      background: editando && !guardandoDatos ? '#1e3a5f' : 'transparent',
                      border: `0.5px solid ${editando && !guardandoDatos ? '#1e3a5f' : inputBorder}`,
                      color: editando && !guardandoDatos ? '#fff' : (guardandoDatos ? textMuted : textPrimary),
                      fontSize: 13, fontWeight: 600,
                      cursor: guardandoDatos ? 'default' : 'pointer',
                    }}
                  >
                    {guardandoDatos
                      ? 'Guardando...'
                      : editando
                      ? 'Guardar'
                      : esAdmin
                      ? 'Editar Datos'
                      : 'Editar Número de teléfono'}
                  </button>
                </div>
              )}

              {datosOk && (
                <div style={{ fontSize: 11, color: dark ? '#4ade80' : '#15803d', marginBottom: 12 }}>
                  ✓ Datos guardados
                </div>
              )}

              {/* Fecha Pre Entrega (read-only) */}
              <label style={labelStyle}>Fecha Pre Entrega</label>
              <input
                value={fechaPreEntrega}
                onChange={e => setFechaPreEntrega(e.target.value)}
                placeholder="Se conoce al generar el acta"
                style={{ ...inputStyle, opacity: fechaPreEntrega ? 1 : 0.6 }}
                disabled
              />
            </div>
          </div>

          {/* ESTADO DEL DEPARTAMENTO */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, marginBottom: 14 }}>Estado del Departamento</div>

            {/* Timeline visual con líneas conectoras */}
            <div style={{ background: card, borderRadius: 14, padding: 20, border: `0.5px solid ${border}`, marginBottom: 12, position: 'relative' }}>
              {/* Botón de 3 puntos - visible si estado es 3 o 4 (sin restricción de admin) */}
              {(preentregaEstado === 3 || preentregaEstado === 4) && (
                <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
                  <button
                    onClick={() => setMenuAbierto(!menuAbierto)}
                    style={{
                      width: 32, height: 32, borderRadius: 0, background: 'transparent',
                      border: 'none', color: textMuted,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <MoreVertical size={20} strokeWidth={1.5} />
                  </button>

                  {/* Menú desplegable */}
                  {menuAbierto && (
                    <div style={{
                      position: 'absolute', top: 40, right: 0, zIndex: 20,
                      background: card, border: `0.5px solid ${border}`,
                      borderRadius: 10, overflow: 'hidden', boxShadow: `0 4px 12px rgba(0,0,0,0.15)`,
                      minWidth: 240
                    }}>
                      {/* Opción para cambiar a estado 4 - solo si está en estado 3 */}
                      {preentregaEstado === 3 && (
                        <button
                          onClick={() => {
                            cambiarEstadoEntregado(4);
                            setMenuAbierto(false);
                          }}
                          disabled={guardandoDatos}
                          style={{
                            width: '100%', textAlign: 'left', padding: '12px 16px',
                            background: 'transparent', border: 'none',
                            borderBottom: `0.5px solid ${border}`,
                            color: dark ? '#a78bfa' : '#7c3aed',
                            fontSize: 13, fontWeight: 500, cursor: guardandoDatos ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = dark ? 'rgba(167,139,250,0.1)' : 'rgba(124,58,237,0.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Building2 size={16} strokeWidth={1.5} />
                            Entregado a Inmobiliaria
                          </div>
                        </button>
                      )}

                      {/* Opción para cambiar a estado 5 - disponible en estado 3 y 4 */}
                      <button
                        onClick={() => {
                          cambiarEstadoEntregado(5);
                          setMenuAbierto(false);
                        }}
                        disabled={guardandoDatos}
                        style={{
                          width: '100%', textAlign: 'left', padding: '12px 16px',
                          background: 'transparent', border: 'none',
                          color: dark ? '#ec4899' : '#be185d',
                          fontSize: 13, fontWeight: 500, cursor: guardandoDatos ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex', alignItems: 'center', gap: 8
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = dark ? 'rgba(236,72,153,0.1)' : 'rgba(190,24,93,0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <CheckCircle2 size={16} strokeWidth={1.5} />
                        Entregado al Propietario
                      </button>
                    </div>
                  )}

                  {/* Cerrar menú al hacer click fuera */}
                  {menuAbierto && (
                    <div
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 15 }}
                      onClick={() => setMenuAbierto(false)}
                    />
                  )}
                </div>
              )}
              {/* Contenedor de círculos y líneas */}
              <div style={{ position: 'relative', marginBottom: 20 }}>
                {/* Línea de fondo gris */}
                <div style={{
                  position: 'absolute',
                  top: '19px',
                  left: '5%',
                  right: '5%',
                  height: '2px',
                  background: dark ? '#243550' : '#d1d5db',
                  zIndex: 0
                }} />

                {/* Línea de progreso (azul/color) */}
                <div style={{
                  position: 'absolute',
                  top: '19px',
                  left: '5%',
                  width: `${((preentregaEstado - 1) / 4) * 90}%`,
                  height: '2px',
                  background: estadoInfo.color,
                  zIndex: 1,
                  transition: 'width 0.3s ease'
                }} />

                {/* Círculos */}
                <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <div key={num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: preentregaEstado >= num ? estadoInfo.color : (dark ? '#6b7280' : '#d1d5db'),
                        color: '#fff',
                        fontSize: 14, fontWeight: 700,
                        boxShadow: preentregaEstado >= num ? `0 0 8px ${estadoInfo.color}40` : 'none',
                        transition: 'all 0.3s ease'
                      }}>
                        {num}
                      </div>
                      <div style={{ fontSize: 10, color: textMuted, textAlign: 'center', lineHeight: 1.3, width: '85px', fontWeight: 500 }}>
                        {num === 1 && 'Sin Pre Entrega'}
                        {num === 2 && 'Depto con Pre Entrega (Obs. Pendientes)'}
                        {num === 3 && 'Listo para entregar a inmobiliaria'}
                        {num === 4 && 'Entregado a inmobiliaria'}
                        {num === 5 && 'Entregado al Propietario'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mensaje informativo */}
              <div style={{
                padding: '14px 16px',
                borderRadius: 8,
                background: `${estadoInfo.color}14`,
                border: `0.5px solid ${estadoInfo.color}40`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <Info size={18} style={{ color: estadoInfo.color, flexShrink: 0, marginTop: 1 }} strokeWidth={2} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: estadoInfo.color, marginBottom: 3 }}>
                    {estadoInfo.label}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: textSecondary }}>
                    {preentregaEstado === 1
                      ? 'Sin observaciones registradas. Comienza con la pre-entrega.'
                      : preentregaEstado === 2
                      ? `Tiene ${obsPendientes} observación${obsPendientes !== 1 ? 'es' : ''} pendiente${obsPendientes !== 1 ? 's' : ''} de ${obsTotal}.`
                      : preentregaEstado === 3
                      ? `Las ${obsTotal} observaciones fueron solucionadas.`
                      : preentregaEstado === 4
                      ? 'Departamento entregado a la inmobiliaria.'
                      : 'Departamento entregado al propietario.'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ACCIONES */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, marginBottom: 12 }}>Acciones</div>

            <button
              onClick={() => history.push(`/pre-entrega/${depto.id}`, { depto, torre, proyecto })}
              style={{
                width: '100%', height: 56, borderRadius: 12,
                background: card, border: `0.5px solid ${border}`,
                color: dark ? '#60a5fa' : '#1e3a5f',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 16
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <FileText size={20} strokeWidth={1.5} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Pre Entrega</div>
                  <div style={{ fontSize: 10, color: textMuted }}>Generar / Editar Pre Entrega</div>
                </div>
              </div>
              <span style={{ fontSize: 18 }}>›</span>
            </button>

            <VisitasPostVenta
              proyecto={proyecto}
              torre={torre}
              depto={depto}
              dark={dark}
              obsCount={obsPostVenta}
            />

            <button
              onClick={() => {
                history.push(`/revision`, { deptoId: depto.id, torreId: torre.id, proyectoId: proyecto.id });
              }}
              style={{
                width: '100%', height: 56, borderRadius: 12,
                background: card, border: `0.5px solid ${border}`,
                color: dark ? '#a78bfa' : '#7c3aed',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 16
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Eye size={20} strokeWidth={1.5} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Ver Observaciones</div>
                  <div style={{ fontSize: 10, color: textMuted }}>Revisar todas las observaciones</div>
                </div>
              </div>
              <span style={{ fontSize: 18 }}>›</span>
            </button>
          </div>

        </div>
      </IonContent>
        </>
      )}
    </IonPage>
  );
};

export default DetalleDepto;
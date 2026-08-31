import React, { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { useTheme } from '../Context/ThemeContext';
import { IonIcon, IonModal } from '@ionic/react';
import { homeOutline, searchOutline, barChartOutline, calendarOutline, documentTextOutline, chevronDownOutline } from 'ionicons/icons';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabase';

interface BottomNavBarProps {
  activeTab: 'inicio' | 'buscar' | 'informes' | 'reportes' | 'calendario';
  proyecto?: any;
  torres?: any[];
  deptos?: any[];
  proyectoNombre?: string;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  proyecto,
  torres = [],
  deptos = [],
  proyectoNombre = ''
}) => {
  const history = useHistory();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg = dark ? '#0B1220' : '#f5f5f5';
  const card = dark ? '#16233B' : '#ffffff';
  const border = dark ? '#243550' : '#f0f0f0';
  const textPrimary = dark ? '#f9fafb' : '#0B1220';
  const textSecondary = dark ? '#6b7280' : '#666666';
  const textMuted = dark ? '#5D728F' : '#999999';

  // Estado del teclado — ocultar barra cuando el teclado está abierto
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const showListener = Keyboard.addListener('keyboardWillShow', () => {
      setKeyboardVisible(true);
    });
    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showListener.then(h => h.remove());
      hideListener.then(h => h.remove());
    };
  }, []);

  // Datos locales — se usan cuando los props vienen vacíos
  const [localProyecto, setLocalProyecto] = useState<any>(null);
  const [localTorres, setLocalTorres] = useState<any[]>([]);
  const [localDeptos, setLocalDeptos] = useState<any[]>([]);
  const [localProyectoNombre, setLocalProyectoNombre] = useState('');
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);

  // Lista de proyectos asignados al usuario (para cambiar desde el buscador)
  const [proyectosDisponibles, setProyectosDisponibles] = useState<any[]>([]);
  const [busquedaProyectoId, setBusquedaProyectoId] = useState<string>('');
  const [mostrarSelectorProyecto, setMostrarSelectorProyecto] = useState(false);

  // Datos efectivos: usa props si el proyecto del modal coincide con el de PreEntrega, sino los locales
  const usandoPropsDirectos = proyecto && torres.length > 0 && deptos.length > 0
    && (!busquedaProyectoId || busquedaProyectoId === proyecto?.id);
  const torresEfectivas = usandoPropsDirectos ? torres : localTorres;
  const deptosEfectivos = usandoPropsDirectos ? deptos : localDeptos;
  const proyectoEfectivo = usandoPropsDirectos ? proyecto : localProyecto;
  const nombreEfectivo = usandoPropsDirectos ? proyectoNombre : localProyectoNombre;

  // Cargar proyectos asignados al usuario
  const cargarProyectosDisponibles = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userEmail = session?.user?.email?.toLowerCase();
      if (!userEmail) return;

      const { data: usuarioData } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', userEmail)
        .maybeSingle();

      if (!usuarioData) return;

      const { data: asignaciones } = await supabase
        .from('usuario_proyectos')
        .select('proyecto_id, proyectos(id, nombre, codigo, etapa)')
        .eq('usuario_id', usuarioData.id);

      const proyectos = (asignaciones
        ?.map((a: any) => a.proyectos as any)
        .filter((p: any) => p !== null && p.etapa === 'pre_entrega_postventa')
        .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre)) || []) as any[];

      setProyectosDisponibles(proyectos);
    } catch (err) {
      console.error('[BottomNavBar] Error cargando proyectos:', err);
    }
  };

  // Cargar torres y deptos de un proyecto específico
  const cargarDatosDeProyecto = async (proyectoId: string) => {
    setCargandoBusqueda(true);
    try {
      const { data: proy } = await supabase
        .from('proyectos')
        .select('*')
        .eq('id', proyectoId)
        .maybeSingle();

      if (proy) {
        setLocalProyecto(proy);
        setLocalProyectoNombre(proy.nombre || '');
      }

      const { data: torresList } = await supabase
        .from('torres')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .order('nombre');

      setLocalTorres(torresList || []);

      if (torresList && torresList.length > 0) {
        const torreIds = torresList.map((t: any) => t.id);
        const { data: deptosData } = await supabase
          .from('departamentos')
          .select('id, numero, piso, torre_id, preentrega_estado')
          .in('torre_id', torreIds)
          .order('numero');

        setLocalDeptos(deptosData || []);
      } else {
        setLocalDeptos([]);
      }
    } catch (err) {
      console.error('[BottomNavBar] Error cargando datos de proyecto:', err);
    }
    setCargandoBusqueda(false);
  };

  // Cargar datos iniciales al abrir el modal
  const cargarDatosBusqueda = async () => {
    // Determinar el proyecto default: el de props o el de localStorage
    const defaultId = proyecto?.id || localStorage.getItem('preentrega_proyecto_id') || '';
    setBusquedaProyectoId(defaultId);

    // Cargar lista de proyectos disponibles
    await cargarProyectosDisponibles();

    // Si ya tiene datos por props y es el mismo proyecto, no hace falta cargar
    if (proyecto && torres.length > 0 && deptos.length > 0) return;

    if (defaultId) {
      await cargarDatosDeProyecto(defaultId);
    }
  };

  // Cambiar proyecto desde el selector del modal
  const cambiarProyectoBusqueda = async (nuevoProyectoId: string) => {
    setBusquedaProyectoId(nuevoProyectoId);
    setMostrarSelectorProyecto(false);
    setBusqueda('');
    setDeptosResultado([]);
    setTorreSelBusqueda(null);
    // NO toca localStorage — PreEntrega sigue siendo el default
    await cargarDatosDeProyecto(nuevoProyectoId);
  };

  // Estado del modal
  const [modalBusqueda, setModalBusqueda] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [torreSelBusqueda, setTorreSelBusqueda] = useState<any>(null);
  const [deptosResultado, setDeptosResultado] = useState<any[]>([]);

  // Manejo de búsqueda - IDÉNTICO a PreEntregaDashboard
  const manejarBusqueda = (texto: string) => {
    setBusqueda(texto);
    setTorreSelBusqueda(null);

    if (!texto.trim()) {
      setDeptosResultado([]);
      return;
    }

    const numBuscado = parseInt(texto, 10);
    if (!isNaN(numBuscado)) {
      const resultado = deptosEfectivos.filter(d => {
        const numDepto = typeof d.numero === 'string' ? parseInt(d.numero, 10) : d.numero;
        return numDepto === numBuscado;
      });
      setDeptosResultado(resultado);
    } else {
      setDeptosResultado([]);
    }
  };

  // Navegar a detalle depto - IDÉNTICO a PreEntregaDashboard
  const irADetalleDepto = (depto: any) => {
    const torre = torresEfectivas.find(t => t.id === depto.torre_id);
    if (!torre) return;
    
    history.push(`/detalle-depto/${depto.id}`, {
      depto,
      torre,
      proyecto: proyectoEfectivo
    });
    setModalBusqueda(false);
    setBusqueda('');
    setDeptosResultado([]);
  };

  // Abrir modal - IDÉNTICO a PreEntregaDashboard
  const abrirModalBusqueda = () => {
    setBusqueda('');
    setDeptosResultado([]);
    setTorreSelBusqueda(null);
    setMostrarSelectorProyecto(false);
    setModalBusqueda(true);
    cargarDatosBusqueda();
  };

  // Click en botón Reportes
  const handleClickReportes = () => {
    history.push('/pre-entrega-reportes');
  };

  const NavButton = ({ icon, label, isActive, onClick }: any) => (
    <button
      onClick={onClick}
      style={{
        width: 52,
        height: 52,
        borderRadius: isActive ? 26 : 12,
        background: isActive ? 'rgba(0, 0, 0, 0.25)' : 'transparent',
        border: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        cursor: 'pointer',
        // El fondo de la pastilla es un tinte muy sutil (15% opacidad) que
        // toma el color de lo que hay detrás — oscuro en modo oscuro, claro
        // en modo claro. Un ícono blanco fijo se pierde contra un fondo
        // claro; acá se invierte según el tema, igual que el resto de la
        // barra ya hace con `card`/`textPrimary` más arriba.
        color: isActive ? '#ffffff' : (dark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(15, 23, 42, 0.55)'),
        transition: 'all 0.3s ease',
        padding: 0
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = dark ? '#ffffff' : '#0f172a';
          e.currentTarget.style.background = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.08)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = dark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(15, 23, 42, 0.55)';
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <IonIcon icon={icon} style={{ fontSize: 24 }} />
      {isActive && <span style={{ fontSize: 8, fontWeight: 600, marginTop: 2 }}>{label}</span>}
    </button>
  );

  return (
    <>
      {/* BOTTOM NAVIGATION — pastilla flotante centrada.
          Se oculta cuando el teclado nativo está abierto. */}
      {!keyboardVisible && <div style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(20px + var(--ion-safe-area-bottom, env(safe-area-inset-bottom, 0px)))',
        transform: 'translateX(-50%)',
        width: 'fit-content',
        maxWidth: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
        background: 'rgba(15, 79, 92, 0.15)',
        backdropFilter: 'blur(4px)',
        borderRadius: 40,
        border: '1px solid rgba(255, 255, 255, 0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        zIndex: 100,
        padding: '9px 14px',
        boxShadow: '0 4px 16px 0 rgba(15, 79, 92, 0.15)'
      }}>
        <NavButton
          icon={homeOutline}
          label="Inicio"
          isActive={activeTab === 'inicio'}
          onClick={() => history.push('/pre-entrega')}
        />

        <NavButton
          icon={searchOutline}
          label="Buscar"
          isActive={activeTab === 'buscar'}
          onClick={abrirModalBusqueda}
        />

        <NavButton
          icon={barChartOutline}
          label="Informes"
          isActive={activeTab === 'informes'}
          onClick={() => history.push('/informe-pv', { proyecto: proyectoEfectivo || proyecto })}
        />

        <NavButton
          icon={documentTextOutline}
          label="Reportes"
          isActive={activeTab === 'reportes'}
          onClick={handleClickReportes}
        />

        <NavButton
          icon={calendarOutline}
          label="Calendario"
          isActive={activeTab === 'calendario'}
          onClick={() => history.push('/calendario-postventa')}
        />
      </div>}

      {/* MODAL BÚSQUEDA */}
      <IonModal 
        isOpen={modalBusqueda} 
        onDidDismiss={() => setModalBusqueda(false)} 
        initialBreakpoint={0.9} 
        breakpoints={[0, 0.9, 1]}
      >
        <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Buscar Departamento</div>

          {/* Selector de proyecto */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <button
              onClick={() => setMostrarSelectorProyecto(!mostrarSelectorProyecto)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 12,
                color: textSecondary
              }}
            >
              <span>Proyecto: <strong style={{ color: textPrimary }}>{nombreEfectivo || '...'}</strong></span>
              {proyectosDisponibles.length > 1 && (
                <IonIcon
                  icon={chevronDownOutline}
                  style={{
                    fontSize: 14,
                    color: textMuted,
                    transition: 'transform 0.2s',
                    transform: mostrarSelectorProyecto ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}
                />
              )}
            </button>

            {/* Dropdown de proyectos */}
            {mostrarSelectorProyecto && proyectosDisponibles.length > 1 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 6,
                background: dark ? '#1B2C48' : '#ffffff',
                border: `0.5px solid ${border}`,
                borderRadius: 12,
                boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 10,
                overflow: 'hidden',
                maxHeight: 200,
                overflowY: 'auto'
              }}>
                {proyectosDisponibles.map((proy, idx) => {
                  const isActive = proy.id === busquedaProyectoId;
                  return (
                    <button
                      key={proy.id}
                      onClick={() => cambiarProyectoBusqueda(proy.id)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: isActive
                          ? (dark ? 'rgba(37, 99, 235, 0.2)' : 'rgba(37, 99, 235, 0.08)')
                          : 'transparent',
                        border: 'none',
                        borderBottom: idx < proyectosDisponibles.length - 1 ? `0.5px solid ${border}` : 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'background 0.15s'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#2563eb' : textPrimary }}>
                          {proy.nombre}
                        </div>
                        {proy.codigo && (
                          <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{proy.codigo}</div>
                        )}
                      </div>
                      {isActive && (
                        <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700 }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Input búsqueda directa */}
          <input
            type="number"
            value={busqueda}
            onChange={(e) => manejarBusqueda(e.target.value)}
            placeholder="Ej: 101"
            style={{
              width: '100%',
              height: 48,
              borderRadius: 12,
              border: `0.5px solid ${border}`,
              padding: '0 12px',
              background: dark ? '#1B2C48' : '#f9f9f9',
              color: textPrimary,
              fontSize: 16,
              marginBottom: 20,
              boxSizing: 'border-box',
              fontWeight: 600
            }}
            autoFocus
          />

          {cargandoBusqueda && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: textMuted, fontSize: 13 }}>
              Cargando datos del proyecto...
            </div>
          )}

          {/* Resultados de búsqueda por número */}
          {busqueda && deptosResultado.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: textSecondary, marginBottom: 12 }}>
                Resultados: {deptosResultado.length} depto{deptosResultado.length !== 1 ? 's' : ''} encontrado{deptosResultado.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {deptosResultado.map(depto => {
                  const isCompleted = depto.preentrega_estado === 5;
                  const colorBg = isCompleted
                    ? (dark ? 'linear-gradient(135deg, #0a1a0e, #16233B)' : '#f0fdf4')
                    : (dark ? 'linear-gradient(135deg, #16233B, #1E2E4A)' : '#f8fafc');
                  const colorBorde = isCompleted
                    ? (dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0')
                    : border;
                  const colorText = isCompleted
                    ? (dark ? '#4ade80' : '#15803d')
                    : textPrimary;
                  const torre = torresEfectivas.find(t => t.id === depto.torre_id);

                  return (
                    <button
                      key={depto.id}
                      onClick={() => irADetalleDepto(depto)}
                      style={{
                        background: colorBg,
                        border: `0.5px solid ${colorBorde}`,
                        borderRadius: 12,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        minWidth: 72,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: colorText }}>
                        {depto.numero}
                      </div>
                      <div style={{ fontSize: 9, color: colorText, marginTop: 2 }}>
                        Torre {torre?.nombre}
                      </div>
                      {isCompleted && (
                        <div style={{ fontSize: 10, color: colorText, marginTop: 3 }}>✓</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {busqueda && deptosResultado.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: textMuted, fontSize: 13 }}>
              No encontrado. Intenta con otro número.
            </div>
          )}

          {busqueda && (
            <div style={{ height: '0.5px', background: border, margin: '20px 0' }} />
          )}

          {/* Letras de torres */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: textSecondary, marginBottom: 12 }}>
              O selecciona una torre:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {torresEfectivas.map(torre => {
                const deptosDelaTorre = deptosEfectivos.filter(d => d.torre_id === torre.id);
                const isSelected = torreSelBusqueda?.id === torre.id;

                return (
                  <button
                    key={torre.id}
                    onClick={() => {
                      if (isSelected) {
                        setTorreSelBusqueda(null);
                        setDeptosResultado([]);
                      } else {
                        setTorreSelBusqueda(torre);
                        setDeptosResultado(deptosDelaTorre);
                      }
                    }}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      border: `0.5px solid ${isSelected ? '#2563eb' : border}`,
                      background: isSelected
                        ? (dark ? 'linear-gradient(135deg, #1e3a5f, #2563eb)' : 'linear-gradient(135deg, #dbeafe, #3b82f6)')
                        : (dark ? '#1B2C48' : '#f9f9f9'),
                      color: isSelected ? '#fff' : textPrimary,
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = dark ? '#1E2E4A' : '#f0f0f0';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = dark ? '#1B2C48' : '#f9f9f9';
                      }
                    }}
                  >
                    {torre.nombre}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deptos de la torre seleccionada */}
          {torreSelBusqueda && deptosResultado.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: textSecondary, marginBottom: 12 }}>
                Torre {torreSelBusqueda.nombre}{torreSelBusqueda.frente ? ` (${torreSelBusqueda.frente})` : ''} - {deptosResultado.length} depto{deptosResultado.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {deptosResultado.map(depto => {
                  const isCompleted = depto.preentrega_estado === 5;
                  const colorBg = isCompleted
                    ? (dark ? 'linear-gradient(135deg, #0a1a0e, #16233B)' : '#f0fdf4')
                    : (dark ? 'linear-gradient(135deg, #16233B, #1E2E4A)' : '#f8fafc');
                  const colorBorde = isCompleted
                    ? (dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0')
                    : border;
                  const colorText = isCompleted
                    ? (dark ? '#4ade80' : '#15803d')
                    : textPrimary;

                  return (
                    <button
                      key={depto.id}
                      onClick={() => irADetalleDepto(depto)}
                      style={{
                        background: colorBg,
                        border: `0.5px solid ${colorBorde}`,
                        borderRadius: 12,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        minWidth: 72,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: colorText }}>
                        {depto.numero}
                      </div>
                      <div style={{ fontSize: 10, color: colorText, marginTop: 2 }}>
                        Piso {depto.piso || '-'}
                      </div>
                      {isCompleted && (
                        <div style={{ fontSize: 10, color: colorText, marginTop: 3 }}>✓</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setModalBusqueda(false);
              setBusqueda('');
              setDeptosResultado([]);
              setTorreSelBusqueda(null);
            }}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 12,
              background: 'transparent',
              border: `0.5px solid ${border}`,
              color: textSecondary,
              fontSize: 14,
              marginTop: 'auto',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Cerrar
          </button>
        </div>
      </IonModal>
    </>
  );
};

export default BottomNavBar;
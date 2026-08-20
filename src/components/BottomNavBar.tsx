import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useTheme } from '../Context/ThemeContext';
import { IonIcon, IonModal } from '@ionic/react';
import { homeOutline, searchOutline, barChartOutline, ellipsisHorizontalOutline, documentTextOutline } from 'ionicons/icons';

interface BottomNavBarProps {
  activeTab: 'inicio' | 'buscar' | 'informes' | 'reportes' | 'mas';
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
      const resultado = deptos.filter(d => {
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
    const torre = torres.find(t => t.id === depto.torre_id);
    if (!torre) return;
    
    history.push(`/detalle-depto/${depto.id}`, {
      depto,
      torre,
      proyecto
    });
    setModalBusqueda(false);
    setBusqueda('');
    setDeptosResultado([]);
  };

  // Abrir modal - IDÉNTICO a PreEntregaDashboard
  const abrirModalBusqueda = () => {
    setModalBusqueda(true);
    setBusqueda('');
    setDeptosResultado([]);
    setTorreSelBusqueda(null);
  };

  // Click en botón Reportes
  const handleClickReportes = () => {
    history.push('/pre-entrega-reportes');
  };

  const NavButton = ({ icon, label, isActive, onClick }: any) => (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        height: '100%',
        background: 'transparent',
        border: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        cursor: 'pointer',
        color: isActive ? '#3b82f6' : textSecondary,
        transition: 'all 0.2s',
        borderBottom: isActive ? '2px solid #3b82f6' : 'none'
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = '#3b82f6';
          e.currentTarget.style.background = dark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = textSecondary;
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <IonIcon icon={icon} style={{ fontSize: 22 }} />
      <span style={{ fontSize: 9, fontWeight: 600 }}>{label}</span>
    </button>
  );

  return (
    <>
      {/* BOTTOM NAVIGATION */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        boxSizing: 'border-box',
        height: 'calc(68px + var(--ion-safe-area-bottom, env(safe-area-inset-bottom, 0px)))',
        paddingBottom: 'var(--ion-safe-area-bottom, env(safe-area-inset-bottom, 0px))',
        background: card,
        borderTop: `0.5px solid ${border}`,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 100
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
          onClick={() => history.push('/informe-pv', { proyecto })}
        />

        <NavButton
          icon={documentTextOutline}
          label="Reportes"
          isActive={activeTab === 'reportes'}
          onClick={handleClickReportes}
        />

        <NavButton
          icon={ellipsisHorizontalOutline}
          label="Más"
          isActive={activeTab === 'mas'}
          onClick={() => {}}
        />
      </div>

      {/* MODAL BÚSQUEDA - IDÉNTICO A PREENTREGA */}
      <IonModal 
        isOpen={modalBusqueda} 
        onDidDismiss={() => setModalBusqueda(false)} 
        initialBreakpoint={0.9} 
        breakpoints={[0, 0.9, 1]}
      >
        <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Buscar Departamento</div>
          <div style={{ fontSize: 12, color: textSecondary, marginBottom: 16 }}>Proyecto: {proyectoNombre}</div>

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
                  const torre = torres.find(t => t.id === depto.torre_id);

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
              {torres.map(torre => {
                const deptosDelaTorre = deptos.filter(d => d.torre_id === torre.id);
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
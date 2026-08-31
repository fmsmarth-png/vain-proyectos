import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonSpinner, IonButton
} from '@ionic/react';
import { useEffect, useState, useCallback } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { chevronBack } from 'ionicons/icons';
import { IonIcon } from '@ionic/react';
import BottomNavBar from '../components/BottomNavBar';

interface FiltroState {
  tipo: string;
  proyectoId: string;
  proyectoNombre: string;
  filtroAntiguedad?: { min: number; max: number } | null; // Días min/max para filtrar obs
}

const DeptosFiltrados: React.FC = () => {
  const history = useHistory();
  const location = useLocation<FiltroState>();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg = dark ? '#0B1220' : '#f0f4f8';
  const card = dark ? '#16233B' : '#ffffff';
  const border = dark ? '#243550' : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted = dark ? '#5D728F' : '#94a3b8';
  const toolbar = dark ? '#0E1728' : '#1e3a5f';
  const successColor = dark ? '#4ade80' : '#15803d';

  const [torres, setTorres] = useState<any[]>([]);
  const [deptos, setDeptos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  let filtroData: FiltroState = {
    tipo: 'todos',
    proyectoId: '',
    proyectoNombre: ''
  };
  
  if (location.state) {
    filtroData = location.state;
  } else {
    const filtroSesion = sessionStorage.getItem('filtroDeptos');
    if (filtroSesion) {
      try {
        filtroData = JSON.parse(filtroSesion);
      } catch (e) {
        console.error('Error parsing sessionStorage:', e);
      }
    }
  }

  const { tipo = 'todos', proyectoId, proyectoNombre } = filtroData;

  const getTitulo = () => {
    switch (tipo) {
      case 'todos': return 'Todos los Departamentos';
      case 'sinPreE': return 'Sin Pre Entrega';
      case 'enProceso': return 'Con Trabajo';
      case 'listoEntregar': return 'Listo para Inmobiliaria';
      case 'entregadosInmob': return 'Entregados a Inmobiliaria';
      case 'entregadosProp': return 'Entregados a Propietario';
      case 'antiguedad_menos7': return 'Observaciones: Menos de 7 días';
      case 'antiguedad_8a14': return 'Observaciones: 8 a 14 días';
      case 'antiguedad_15a30': return 'Observaciones: 15 a 30 días';
      case 'antiguedad_mas30': return 'Observaciones: Más de 30 días';
      default: return 'Departamentos';
    }
  };

  const getColorEstado = (estado: number) => {
    switch (estado) {
      case 1: return dark ? '#6b7280' : '#d1d5db';
      case 2: return '#ef4444';
      case 3: return '#22c55e';
      case 4: return '#8b5cf6';
      case 5: return '#ec4899';
      default: return dark ? '#243550' : '#e5e7eb';
    }
  };

  const getColorBg = (estado: number, isCompleted: boolean) => {
    if (isCompleted) {
      return dark 
        ? 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, #0f2818 100%)' 
        : 'linear-gradient(135deg, #f0fdf4 0%, #f7fed3 100%)';
    }
    return dark 
      ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' 
      : 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)';
  };

  const getColorBorder = (estado: number, isCompleted: boolean) => {
    if (isCompleted) {
      return dark ? 'rgba(74,222,128,0.3)' : 'rgba(34,197,94,0.3)';
    }
    return border;
  };

  const getColorText = (estado: number, isCompleted: boolean) => {
    if (isCompleted) return successColor;
    return textPrimary;
  };

  const cargarDatos = useCallback(async () => {
    if (!proyectoId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const { data: torresList } = await supabase
        .from('torres')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .order('nombre');

      setTorres(torresList || []);

      if (torresList && torresList.length > 0) {
        const torreIds = torresList.map(t => t.id);
        
        let query = supabase
          .from('departamentos')
          .select('id, numero, piso, torre_id, preentrega_estado')
          .in('torre_id', torreIds);

        // Filtros por estado (existentes)
        if (tipo === 'sinPreE') {
          query = query.or('preentrega_estado.eq.1,preentrega_estado.is.null');
        } else if (tipo === 'enProceso') {
          query = query.eq('preentrega_estado', 2);
        } else if (tipo === 'listoEntregar') {
          query = query.eq('preentrega_estado', 3);
        } else if (tipo === 'entregadosInmob') {
          query = query.eq('preentrega_estado', 4);
        } else if (tipo === 'entregadosProp') {
          query = query.eq('preentrega_estado', 5);
        } 
        // Filtros por antigüedad (NUEVOS)
        else if (tipo.startsWith('antiguedad_')) {
          // Primero obtenemos todos los deptos del proyecto
          const { data: allDeptos } = await query.order('numero');
          if (allDeptos && allDeptos.length > 0) {
            // Ahora filtrar por antigüedad
            const hoy = new Date();
            let minDias = 0, maxDias = Infinity;

            if (tipo === 'antiguedad_menos7') {
              minDias = 0; maxDias = 7;
            } else if (tipo === 'antiguedad_8a14') {
              minDias = 8; maxDias = 14;
            } else if (tipo === 'antiguedad_15a30') {
              minDias = 15; maxDias = 30;
            } else if (tipo === 'antiguedad_mas30') {
              minDias = 31; maxDias = Infinity;
            }

            // Obtener TODAS las obs PRE-E PENDIENTES del proyecto, paginando para evitar
            // el límite de 1000 filas de Supabase. Mismo scope (proyecto_id) que PreEntrega.
            const obs: { departamento_id: string | null; fecha_creacion: string | null }[] = [];
            {
              const pageSize = 1000;
              let fromRow = 0;
              while (true) {
                const { data, error } = await supabase
                  .from('observacionesinformepv')
                  .select('departamento_id, fecha_creacion')
                  .eq('proyecto_id', proyectoId)
                  .eq('tipo', 'PRE-E')
                  .eq('estado', 'PENDIENTE')
                  .order('id', { ascending: true })
                  .range(fromRow, fromRow + pageSize - 1);
                if (error || !data || data.length === 0) break;
                obs.push(...data);
                if (data.length < pageSize) break;
                fromRow += pageSize;
              }
            }

            // Set de ids de deptos reales del proyecto
            const validDeptoIds = new Set(allDeptos.map(d => d.id));

            // Filtrar deptos que tienen obs en el rango de antigüedad
            const deptosConObsEnRango = new Set<string>();
            for (const o of obs) {
              if (!o.fecha_creacion || !o.departamento_id) continue;
              if (!validDeptoIds.has(o.departamento_id)) continue;
              const fechaCreacion = new Date(o.fecha_creacion);
              const diferencia = Math.floor((hoy.getTime() - fechaCreacion.getTime()) / (1000 * 60 * 60 * 24));
              if (diferencia >= minDias && diferencia <= maxDias) {
                deptosConObsEnRango.add(o.departamento_id);
              }
            }

            const filtrados = allDeptos.filter(d => deptosConObsEnRango.has(d.id));
            setDeptos(filtrados);
            setLoading(false);
            return;
          }
        }

        const { data: deptosData } = await query.order('numero');
        setDeptos(deptosData || []);
      }
    } catch (err) {
      console.error('Error:', err);
    }
    setLoading(false);
  }, [proyectoId, tipo]);

  useEffect(() => {
    if (!proyectoId) {
      setLoading(false);
      return;
    }
    
    cargarDatos();
  }, [cargarDatos]);

  const iniciarInspeccion = (depto: any) => {
    const torre = torres.find(t => t.id === depto.torre_id);
    if (!depto || !torre) return;
    
    history.push(`/detalle-depto/${depto.id}`, { 
      depto, 
      torre, 
      proyecto: { nombre: proyectoNombre, id: proyectoId } 
    });
  };

  const isTouch = screenWidth < 900;

  if (loading) {
    return (
      <IonPage style={{ '--background': bg } as any}>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#16233B' : 'transparent' }}>
            <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }} onClick={() => history.goBack()}>
              <IonIcon icon={chevronBack} slot="icon-only" />
            </IonButton>
            <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>{getTitulo()}</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <IonSpinner />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (!proyectoId) {
    return (
      <IonPage style={{ '--background': bg } as any}>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#16233B' : 'transparent' }}>
            <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }} onClick={() => history.goBack()}>
              <IonIcon icon={chevronBack} slot="icon-only" />
            </IonButton>
            <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Cargando...</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <IonSpinner />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage style={{ '--background': bg } as any}>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#16233B' : 'transparent' }}>
          <IonButton slot="start" fill="clear" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }} onClick={() => history.goBack()}>
            <IonIcon icon={chevronBack} slot="icon-only" />
          </IonButton>
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>{getTitulo()}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: '16px 16px 100px' }}>

          {/* BANNER PROYECTO */}
          <div
            style={{
              background: dark
                ? 'linear-gradient(135deg, #16233B 0%, #1E2E4A 50%, #16233B 100%)'
                : 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
              borderRadius: 16,
              padding: '20px 20px',
              marginBottom: 24,
              border: dark ? '0.5px solid #2E4468' : 'none',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 11, color: dark ? '#6E86A6' : 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
                {getTitulo()}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                {proyectoNombre}
              </div>
              <div style={{ fontSize: 12, color: dark ? '#8296B0' : 'rgba(255,255,255,0.7)' }}>
                {deptos.length} departamento{deptos.length !== 1 ? 's' : ''} encontrado{deptos.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* SEPARADOR */}
          <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #243550, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginBottom: 20 }} />

          {/* TORRES Y DEPTOS */}
          {torres.map((torre, idx) => {
            const deptosDelaTorre = deptos.filter(d => d.torre_id === torre.id);
            if (deptosDelaTorre.length === 0) return null;

            return (
              <div key={torre.id} style={{ marginBottom: 24 }}>
                {/* TÍTULO TORRE */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 14,
                    paddingLeft: 2
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 24,
                      borderRadius: 4,
                      background: dark
                        ? 'linear-gradient(180deg, #3b82f6, #2563eb)'
                        : 'linear-gradient(180deg, #2563eb, #1e40af)',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>
                      Torre {torre.nombre}
                    </div>
                    {torre.frente && (
                      <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>
                        {torre.frente}
                      </div>
                    )}
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <div style={{ fontSize: 10, color: textMuted, fontWeight: 600, background: dark ? '#16233B' : '#f8fafc', padding: '4px 10px', borderRadius: 8, border: `0.5px solid ${border}` }}>
                      {deptosDelaTorre.length} depto{deptosDelaTorre.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {/* GRID DEPTOS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 10 }}>
                  {deptosDelaTorre.map(depto => {
                    const isCompleted = depto.preentrega_estado === 5;
                    const colorText = getColorText(depto.preentrega_estado || 1, isCompleted);
                    const colorBg = getColorBg(depto.preentrega_estado || 1, isCompleted);
                    const colorBorde = getColorBorder(depto.preentrega_estado || 1, isCompleted);

                    return (
                      <button
                        key={depto.id}
                        onClick={() => iniciarInspeccion(depto)}
                        style={{
                          background: colorBg,
                          border: `0.5px solid ${colorBorde}`,
                          borderRadius: 14,
                          padding: '14px 10px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          minHeight: 70,
                          boxShadow: 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (!isTouch) {
                            (e.currentTarget as any).style.transform = 'translateY(-4px)';
                            (e.currentTarget as any).style.boxShadow = dark 
                              ? '0 8px 16px rgba(0,0,0,0.3)' 
                              : '0 8px 16px rgba(0,0,0,0.1)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isTouch) {
                            (e.currentTarget as any).style.transform = 'translateY(0)';
                            (e.currentTarget as any).style.boxShadow = 'none';
                          }
                        }}
                        onTouchStart={(e) => {
                          (e.currentTarget as any).style.opacity = '0.8';
                        }}
                        onTouchEnd={(e) => {
                          (e.currentTarget as any).style.opacity = '1';
                        }}
                      >
                        <div style={{ fontSize: 16, fontWeight: 800, color: colorText, lineHeight: 1 }}>
                          {depto.numero}
                        </div>
                        {isCompleted && (
                          <div style={{ fontSize: 12, color: colorText, lineHeight: 1 }}>✓</div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* SEPARADOR ENTRE TORRES */}
                {idx < torres.length - 1 && (
                  <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #243550, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginTop: 24 }} />
                )}
              </div>
            );
          })}

          {/* ESTADO VACÍO */}
          {deptos.length === 0 && (
            <div
              style={{
                background: dark
                  ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)'
                  : 'linear-gradient(135deg, #ffffff, #f8fafc)',
                border: `0.5px solid ${border}`,
                borderRadius: 16,
                padding: 32,
                textAlign: 'center',
                marginTop: 20
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>No hay departamentos</div>
              <div style={{ fontSize: 12, color: textMuted }}>con este filtro</div>
            </div>
          )}
          
          <div style={{ height: 20 }} />
        </div>
      </IonContent>

      <BottomNavBar
        activeTab="inicio"
        proyecto={{ id: proyectoId, nombre: proyectoNombre }}
        torres={torres}
        deptos={deptos}
        proyectoNombre={proyectoNombre}
      />
    </IonPage>
  );
};

export default DeptosFiltrados;
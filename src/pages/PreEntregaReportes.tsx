import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonLoading, IonIcon, useIonViewDidEnter,
} from '@ionic/react';
import { chevronBack, arrowForward, document, barChart } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { generarReporteCompleto, generarReporteITLS } from '../helpers/reportesPreEntrega';
import BottomNavBar from '../components/BottomNavBar';

interface Proyecto { id: string; nombre: string; codigo: string; etapa: string; }
interface Torre { id: string; nombre: string; proyecto_id: string; }
interface Depto { id: string; numero: string; torre_id: string; }

export const PreEntregaReportes: React.FC = () => {
  const history = useHistory();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg = dark ? '#000000' : '#f8f8f8';
  const card = dark ? '#111111' : '#ffffff';
  const cardBg = dark ? '#0a0a0a' : '#f9f9f9';
  const border = dark ? '#222222' : '#e8e8e8';
  const textPrimary = dark ? '#ffffff' : '#1f2937';
  const textSecondary = dark ? '#a0a0a0' : '#6b7280';
  const textMuted = dark ? '#555555' : '#9ca3af';

  const [cargando, setCargando] = useState(true);
  const [generandoReporte, setGenerandoReporte] = useState(false);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [torres, setTorres] = useState<Torre[]>([]);
  const [deptos, setDeptos] = useState<Depto[]>([]);

  const [proyectoSel, setProyectoSel] = useState<string>('');
  const [torreSel, setTorreSel] = useState<string>('');
  const [deptoSel, setDeptoSel] = useState<string>('');
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');

  useIonViewDidEnter(() => { cargarDatos(); }, []);

  // Pre-seleccionar proyecto desde sessionStorage cuando se cargan los proyectos
  useEffect(() => {
    if (proyectos.length > 0) {
      const sessionData = sessionStorage.getItem('og_seleccion');
      if (sessionData) {
        try {
          const parsed = JSON.parse(sessionData);
          if (parsed.proyectoId && proyectos.find(p => p.id === parsed.proyectoId)) {
            setProyectoSel(parsed.proyectoId);
          }
        } catch (e) {
          console.error('Error parsing session:', e);
        }
      }
    }
  }, [proyectos]);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) { 
        history.push('/login'); 
        return; 
      }

      const userEmail = session.user.email?.toLowerCase();
      if (!userEmail) {
        setCargando(false);
        return;
      }

      // Obtener usuario_id desde email
      const { data: usuarioData, error: errUsuario } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', userEmail)
        .maybeSingle();

      if (errUsuario || !usuarioData) {
        console.error('Error obteniendo usuario:', errUsuario);
        setProyectos([]);
        setCargando(false);
        return;
      }

      const usuarioId = usuarioData.id;

      const { data: userProyectos } = await supabase
        .from('usuario_proyectos')
        .select('proyecto_id')
        .eq('usuario_id', usuarioId);

      if (!userProyectos || userProyectos.length === 0) { 
        setProyectos([]); 
        setCargando(false); 
        return; 
      }

      const proyectosIds = userProyectos.map((up: any) => up.proyecto_id);
      const { data: proy } = await supabase
        .from('proyectos')
        .select('id, nombre, codigo, etapa')
        .in('id', proyectosIds)
        .eq('etapa', 'pre_entrega_postventa')
        .order('nombre');

      setProyectos(proy || []);
      setCargando(false);
    } catch (error) {
      console.error('Error:', error);
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!proyectoSel) { setTorres([]); setDeptos([]); return; }
    const cargarTorres = async () => {
      try {
        const { data } = await supabase
          .from('torres')
          .select('id, nombre, proyecto_id')
          .eq('proyecto_id', proyectoSel)
          .order('nombre');
        setTorres(data || []);
        setTorreSel('');
        setDeptoSel('');
        setDeptos([]);
      } catch (error) { console.error('Error:', error); }
    };
    cargarTorres();
  }, [proyectoSel]);

  useEffect(() => {
    if (!torreSel) { setDeptos([]); setDeptoSel(''); return; }
    const cargarDeptos = async () => {
      try {
        const { data } = await supabase
          .from('departamentos')
          .select('id, numero, torre_id')
          .eq('torre_id', torreSel)
          .order('numero');
        setDeptos(data || []);
        setDeptoSel('');
      } catch (error) { console.error('Error:', error); }
    };
    cargarDeptos();
  }, [torreSel]);

  const descargarReporteCompleto = async () => {
    if (!proyectoSel) { alert('Por favor selecciona un proyecto'); return; }
    try {
      setGenerandoReporte(true);
      await generarReporteCompleto({
        proyectoId: proyectoSel,
        torreId: torreSel || undefined,
        deptoId: deptoSel || undefined,
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
      });
    } catch (error) {
      console.error('Error:', error);
      alert('Error al generar el reporte');
    } finally {
      setGenerandoReporte(false);
    }
  };

  const descargarReporteITLS = async () => {
    if (!proyectoSel) { alert('Por favor selecciona un proyecto'); return; }
    try {
      setGenerandoReporte(true);
      await generarReporteITLS({
        proyectoId: proyectoSel,
        torreId: torreSel || undefined,
        deptoId: deptoSel || undefined,
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
      });
    } catch (error) {
      console.error('Error:', error);
      alert('Error al generar el reporte ITLS');
    } finally {
      setGenerandoReporte(false);
    }
  };

  const proyectoSelData = proyectos.find((p) => p.id === proyectoSel);

  return (
    <IonPage>
      <IonHeader style={{ borderBottom: 'none' }}>
        <IonToolbar style={{ backgroundColor: '#1e3a5f', '--background': '#1e3a5f' } as any}>
          <IonButton slot="start" fill="clear" onClick={() => history.push('/pre-entrega')}>
            <IonIcon icon={chevronBack} style={{ color: '#fff', fontSize: '24px' }} />
          </IonButton>
          <IonTitle style={{ color: '#fff', fontWeight: '600' }}>Reportes Pre Entrega</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ backgroundColor: bg }}>
        <IonLoading isOpen={cargando} message="Cargando..." />
        <IonLoading isOpen={generandoReporte} message="Generando reporte..." />

        <div style={{ padding: '16px 16px 100px' }}>
          {/* BANNER PROYECTO - SIMPLE */}
          {proyectoSelData && (
            <div
              style={{
                background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                borderRadius: '16px',
                marginBottom: '20px',
                color: '#fff',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ padding: '20px', position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.7, marginBottom: '6px' }}>
                  Proyecto Seleccionado
                </div>
                <div style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px' }}>
                  {proyectoSelData.nombre}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.85 }}>
                  Pre Entrega - Post Venta
                </div>
              </div>
            </div>
          )}

          {/* SECCIÓN FILTROS */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', color: textMuted, letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: '600', marginBottom: '10px' }}>
              Filtros
            </div>

            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
              {/* PROYECTO */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: textPrimary, display: 'block', marginBottom: '6px' }}>
                  Proyecto
                </label>
                <select
                  value={proyectoSel}
                  onChange={(e) => setProyectoSel(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 12px',
                    background: cardBg,
                    border: `1px solid ${border}`,
                    borderRadius: '8px',
                    color: textPrimary,
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Selecciona proyecto...</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              {/* TORRE + DEPTO */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: textPrimary, display: 'block', marginBottom: '6px' }}>
                    Torre
                  </label>
                  <select
                    value={torreSel}
                    onChange={(e) => setTorreSel(e.target.value)}
                    disabled={!proyectoSel}
                    style={{
                      width: '100%',
                      height: '40px',
                      padding: '0 12px',
                      background: cardBg,
                      border: `1px solid ${border}`,
                      borderRadius: '8px',
                      color: textPrimary,
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: proyectoSel ? 'pointer' : 'not-allowed',
                      opacity: proyectoSel ? 1 : 0.5,
                    }}
                  >
                    <option value="">Todas</option>
                    {torres.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: textPrimary, display: 'block', marginBottom: '6px' }}>
                    Departamento
                  </label>
                  <select
                    value={deptoSel}
                    onChange={(e) => setDeptoSel(e.target.value)}
                    disabled={!torreSel}
                    style={{
                      width: '100%',
                      height: '40px',
                      padding: '0 12px',
                      background: cardBg,
                      border: `1px solid ${border}`,
                      borderRadius: '8px',
                      color: textPrimary,
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: torreSel ? 'pointer' : 'not-allowed',
                      opacity: torreSel ? 1 : 0.5,
                    }}
                  >
                    <option value="">Todos</option>
                    {deptos.map((d) => (
                      <option key={d.id} value={d.id}>Depto. {d.numero}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* RANGO DE FECHAS */}
              <div>
                <label style={{ fontSize: '10px', color: textMuted, letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px', display: 'block' }}>
                  Rango de fechas
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    style={{
                      height: '40px',
                      padding: '0 12px',
                      background: cardBg,
                      border: `1px solid ${border}`,
                      borderRadius: '8px',
                      color: textPrimary,
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  />
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    style={{
                      height: '40px',
                      padding: '0 12px',
                      background: cardBg,
                      border: `1px solid ${border}`,
                      borderRadius: '8px',
                      color: textPrimary,
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN GENERAR REPORTE */}
          <div>
            <div style={{ fontSize: '10px', color: textMuted, letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: '600', marginBottom: '10px' }}>
              Generar Reporte
            </div>

            {/* REPORTE COMPLETO */}
            <div
              onClick={proyectoSel ? descargarReporteCompleto : undefined}
              style={{
                background: card,
                border: `1px solid ${border}`,
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: proyectoSel ? 'pointer' : 'not-allowed',
                opacity: proyectoSel ? 1 : 0.6,
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  background: '#10b981',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <IonIcon icon={document} style={{ color: '#fff', fontSize: '22px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: textPrimary }}>
                  Reporte Completo
                </div>
                <div style={{ fontSize: '12px', color: textSecondary, marginTop: '2px' }}>
                  Descarga completa en Excel
                </div>
              </div>
              <IonIcon icon={arrowForward} style={{ color: textMuted, fontSize: '18px' }} />
            </div>

            {/* REPORTE ITLS */}
            <div
              onClick={proyectoSel ? descargarReporteITLS : undefined}
              style={{
                background: card,
                border: `1px solid ${border}`,
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: proyectoSel ? 'pointer' : 'not-allowed',
                opacity: proyectoSel ? 1 : 0.6,
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  background: '#3b82f6',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <IonIcon icon={barChart} style={{ color: '#fff', fontSize: '22px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: textPrimary }}>
                  Reporte ITLS
                </div>
                <div style={{ fontSize: '12px', color: textSecondary, marginTop: '2px' }}>
                  Formato para plataforma ITLS
                </div>
              </div>
              <IonIcon icon={arrowForward} style={{ color: textMuted, fontSize: '18px' }} />
            </div>
          </div>
        </div>
      </IonContent>

      {/* BOTTOM NAV BAR */}
      <BottomNavBar 
        activeTab="reportes"
        proyecto={proyectoSelData}
        torres={torres}
        deptos={deptos}
        proyectoNombre={proyectoSelData?.nombre || ''}
      />
    </IonPage>
  );
};

export default PreEntregaReportes;
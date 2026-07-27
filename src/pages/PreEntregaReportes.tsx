import React, { useEffect, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardContent,
  IonButton,
  IonLoading,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonLabel,
  IonItem,
  useIonViewDidEnter,
} from '@ionic/react';
import { chevronBack, download } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { generarReporteCompleto, generarReporteITLS } from '../helpers/reportesPreEntrega';

interface Proyecto {
  id: string;
  nombre: string;
  codigo: string;
  etapa: string;
}

interface Torre {
  id: string;
  nombre: string;
  proyecto_id: string;
}

interface Depto {
  id: string;
  numero: string;
  torre_id: string;
}

export const PreEntregaReportes: React.FC = () => {
  const history = useHistory();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Estado general
  const [cargando, setCargando] = useState(true);
  const [generandoReporte, setGenerandoReporte] = useState(false);

  // Datos
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [torres, setTorres] = useState<Torre[]>([]);
  const [deptos, setDeptos] = useState<Depto[]>([]);

  // Filtros
  const [proyectoSel, setProyectoSel] = useState<string>('');
  const [torreSel, setTorreSel] = useState<string>('');
  const [deptoSel, setDeptoSel] = useState<string>('');
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');

  // Colores tema
  const colors = {
    bg: isDark ? '#000000' : '#f0f4f8',
    card: isDark ? '#0e0e0e' : '#ffffff',
    border: isDark ? '#1e1e1e' : '#e2e8f0',
    textPrimary: isDark ? '#f9fafb' : '#0f172a',
    textSecondary: isDark ? '#6b7280' : '#64748b',
    textMuted: isDark ? '#444444' : '#94a3b8',
    toolbar: isDark ? '#000000' : '#1e3a5f',
    primary: '#3b82f6',
  };

  useIonViewDidEnter(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setCargando(true);

      // Obtener usuario actual
      const { data } = await supabase.auth.getSession();
      const sesion = data?.session;
      
      if (!sesion?.user) {
        history.push('/login');
        return;
      }

      // Obtener proyectos asignados al usuario (solo pre_entrega_postventa)
      const { data: userProyectos } = await supabase
        .from('usuario_proyectos')
        .select('proyecto_id')
        .eq('usuario_id', sesion.user.id);

      if (!userProyectos || userProyectos.length === 0) {
        setProyectos([]);
        setCargando(false);
        return;
      }

      const proyectosIds = userProyectos.map((up: any) => up.proyecto_id);

      // Obtener proyectos con etapa pre_entrega_postventa
      const { data: proy } = await supabase
        .from('proyectos')
        .select('id, nombre, codigo, etapa')
        .in('id', proyectosIds)
        .eq('etapa', 'pre_entrega_postventa')
        .order('nombre');

      setProyectos(proy || []);
      setCargando(false);
    } catch (error) {
      console.error('Error cargando datos:', error);
      setCargando(false);
    }
  };

  // Cargar torres cuando cambia proyecto
  useEffect(() => {
    if (!proyectoSel) {
      setTorres([]);
      setDeptos([]);
      return;
    }

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
      } catch (error) {
        console.error('Error cargando torres:', error);
      }
    };

    cargarTorres();
  }, [proyectoSel]);

  // Cargar deptos cuando cambia torre
  useEffect(() => {
    if (!torreSel) {
      setDeptos([]);
      setDeptoSel('');
      return;
    }

    const cargarDeptos = async () => {
      try {
        const { data } = await supabase
          .from('departamentos')
          .select('id, numero, torre_id')
          .eq('torre_id', torreSel)
          .order('numero');

        setDeptos(data || []);
        setDeptoSel('');
      } catch (error) {
        console.error('Error cargando deptos:', error);
      }
    };

    cargarDeptos();
  }, [torreSel]);

  const descargarReporteCompleto = async () => {
    if (!proyectoSel) {
      alert('Por favor selecciona un proyecto');
      return;
    }

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
      console.error('Error generando reporte completo:', error);
      alert('Error al generar el reporte');
    } finally {
      setGenerandoReporte(false);
    }
  };

  const descargarReporteITLS = async () => {
    if (!proyectoSel) {
      alert('Por favor selecciona un proyecto');
      return;
    }

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
      console.error('Error generando reporte ITLS:', error);
      alert('Error al generar el reporte ITLS');
    } finally {
      setGenerandoReporte(false);
    }
  };

  const proyectoSelNombre = proyectos.find((p) => p.id === proyectoSel)?.nombre || 'Proyecto';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ backgroundColor: colors.toolbar }}>
          <IonButton slot="start" fill="clear" onClick={() => history.push('/pre-entrega')}>
            <IonIcon icon={chevronBack} />
          </IonButton>
          <IonTitle style={{ color: '#fff', fontWeight: '600' }}>Reportes Pre Entrega</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ backgroundColor: colors.bg }}>
        <IonLoading isOpen={cargando} message="Cargando..." />
        <IonLoading isOpen={generandoReporte} message="Generando reporte..." />

        <div style={{ padding: '16px', paddingBottom: '100px' }}>
          {/* TARJETA PROYECTO BANNER */}
          <IonCard
            style={{
              background: `linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)`,
              borderRadius: '16px',
              marginBottom: '24px',
              overflow: 'hidden',
              position: 'relative',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)',
                top: '-40px',
                right: '-40px',
                overflow: 'hidden',
              }}
            />
            <IonCardContent
              style={{
                padding: '24px',
                position: 'relative',
                zIndex: 1,
              }}
            >
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                Descargar Observaciones
              </div>
              <div style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>
                {proyectoSelNombre}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>
                Selecciona los filtros y descarga el reporte
              </div>
            </IonCardContent>
          </IonCard>

          {/* FILTROS */}
          <IonCard style={{ backgroundColor: colors.card, borderRadius: '16px', marginBottom: '16px', border: `0.5px solid ${colors.border}` }}>
            <IonCardContent style={{ padding: '16px' }}>
              <div style={{ marginBottom: '16px' }}>
                <IonItem
                  lines="none"
                  style={{
                    backgroundColor: 'transparent',
                    paddingLeft: 0,
                    paddingRight: 0,
                  }}
                >
                  <IonLabel style={{ color: colors.textPrimary, fontWeight: '600', marginRight: '12px', minWidth: '100px' }}>
                    Proyecto *
                  </IonLabel>
                  <IonSelect
                    value={proyectoSel}
                    onIonChange={(e) => setProyectoSel(e.detail.value)}
                    placeholder="Selecciona..."
                    style={{ color: colors.textPrimary }}
                  >
                    {proyectos.map((p) => (
                      <IonSelectOption key={p.id} value={p.id}>
                        {p.nombre} ({p.codigo})
                      </IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <IonItem
                  lines="none"
                  style={{
                    backgroundColor: 'transparent',
                    paddingLeft: 0,
                    paddingRight: 0,
                  }}
                >
                  <IonLabel style={{ color: colors.textPrimary, fontWeight: '600', marginRight: '12px', minWidth: '100px' }}>
                    Torre
                  </IonLabel>
                  <IonSelect
                    value={torreSel}
                    onIonChange={(e) => setTorreSel(e.detail.value)}
                    placeholder="Todas"
                    disabled={!proyectoSel}
                    style={{ color: colors.textPrimary }}
                  >
                    <IonSelectOption value="">Todas las torres</IonSelectOption>
                    {torres.map((t) => (
                      <IonSelectOption key={t.id} value={t.id}>
                        {t.nombre}
                      </IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <IonItem
                  lines="none"
                  style={{
                    backgroundColor: 'transparent',
                    paddingLeft: 0,
                    paddingRight: 0,
                  }}
                >
                  <IonLabel style={{ color: colors.textPrimary, fontWeight: '600', marginRight: '12px', minWidth: '100px' }}>
                    Depto
                  </IonLabel>
                  <IonSelect
                    value={deptoSel}
                    onIonChange={(e) => setDeptoSel(e.detail.value)}
                    placeholder="Todos"
                    disabled={!torreSel}
                    style={{ color: colors.textPrimary }}
                  >
                    <IonSelectOption value="">Todos los deptos</IonSelectOption>
                    {deptos.map((d) => (
                      <IonSelectOption key={d.id} value={d.id}>
                        {d.numero}
                      </IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <IonLabel style={{ color: colors.textPrimary, fontWeight: '600', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                  Fecha de observación (desde)
                </IonLabel>
                <IonInput
                  type="date"
                  value={fechaDesde}
                  onIonChange={(e) => setFechaDesde(e.detail.value || '')}
                  style={{
                    backgroundColor: colors.border,
                    borderRadius: '8px',
                    padding: '12px',
                    color: colors.textPrimary,
                  }}
                  disabled={!proyectoSel}
                />
              </div>

              <div>
                <IonLabel style={{ color: colors.textPrimary, fontWeight: '600', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                  Fecha de observación (hasta)
                </IonLabel>
                <IonInput
                  type="date"
                  value={fechaHasta}
                  onIonChange={(e) => setFechaHasta(e.detail.value || '')}
                  style={{
                    backgroundColor: colors.border,
                    borderRadius: '8px',
                    padding: '12px',
                    color: colors.textPrimary,
                  }}
                  disabled={!proyectoSel}
                />
              </div>
            </IonCardContent>
          </IonCard>

          {/* BOTONES REPORTE */}
          <IonGrid style={{ padding: 0 }}>
            <IonRow>
              <IonCol>
                <IonButton
                  expand="block"
                  color="primary"
                  onClick={descargarReporteCompleto}
                  disabled={!proyectoSel || generandoReporte}
                  style={{
                    borderRadius: '12px',
                    height: '48px',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  <IonIcon icon={download} slot="start" />
                  Reporte Completo
                </IonButton>
              </IonCol>
            </IonRow>
            <IonRow style={{ marginTop: '12px' }}>
              <IonCol>
                <IonButton
                  expand="block"
                  color="secondary"
                  onClick={descargarReporteITLS}
                  disabled={!proyectoSel || generandoReporte}
                  style={{
                    borderRadius: '12px',
                    height: '48px',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  <IonIcon icon={download} slot="start" />
                  Reporte ITLS
                </IonButton>
              </IonCol>
            </IonRow>
          </IonGrid>

          {/* INFO */}
          <IonCard style={{ backgroundColor: colors.border, borderRadius: '12px', marginTop: '24px', border: `1px solid ${colors.border}` }}>
            <IonCardContent style={{ padding: '12px' }}>
              <div style={{ fontSize: '12px', color: colors.textMuted, lineHeight: '1.6' }}>
                <strong>Reporte Completo:</strong> Incluye todas las columnas de observaciones (ambiente, partida, causa, etc.)
                <br />
                <br />
                <strong>Reporte ITLS:</strong> Columnas específicas para subir a plataforma ITLS (Proyecto, Fecha, Torre, Depto, N° Obs, Observación)
              </div>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PreEntregaReportes;
import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonSpinner, IonMenuButton, IonIcon, IonRefresher, IonRefresherContent,
  IonModal, IonButton
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { 
  square, alert, checkmark, folder, person, build
} from 'ionicons/icons';
import BottomNavBar from '../components/BottomNavBar';

const PreEntregaDashboard: React.FC = () => {
  const history = useHistory();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg = dark ? '#000000' : '#f0f4f8';
  const card = dark ? '#0e0e0e' : '#ffffff';
  const border = dark ? '#1e1e1e' : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted = dark ? '#444444' : '#94a3b8';
  const toolbar = dark ? '#000000' : '#1e3a5f';

  const tablaSemanas = [
    { num: 1, mes: 'ENERO', semana: 1, lunes: '2025-12-15', viernes: '2025-12-19' },
    { num: 2, mes: 'VACACIONES', semana: null, lunes: '2025-12-22', viernes: '2025-12-26' },
    { num: 3, mes: 'VACACIONES', semana: null, lunes: '2025-12-29', viernes: '2026-01-02' },
    { num: 4, mes: 'ENERO', semana: 2, lunes: '2026-01-05', viernes: '2026-01-09' },
    { num: 5, mes: 'ENERO', semana: 3, lunes: '2026-01-12', viernes: '2026-01-16' },
    { num: 6, mes: 'ENERO', semana: 4, lunes: '2026-01-19', viernes: '2026-01-23' },
    { num: 7, mes: 'FEBRERO', semana: 1, lunes: '2026-01-26', viernes: '2026-01-30' },
    { num: 8, mes: 'FEBRERO', semana: 2, lunes: '2026-02-02', viernes: '2026-02-06' },
    { num: 9, mes: 'FEBRERO', semana: 3, lunes: '2026-02-09', viernes: '2026-02-13' },
    { num: 10, mes: 'FEBRERO', semana: 4, lunes: '2026-02-16', viernes: '2026-02-20' },
    { num: 11, mes: 'MARZO', semana: 1, lunes: '2026-02-23', viernes: '2026-02-27' },
    { num: 12, mes: 'MARZO', semana: 2, lunes: '2026-03-02', viernes: '2026-03-06' },
    { num: 13, mes: 'MARZO', semana: 3, lunes: '2026-03-09', viernes: '2026-03-13' },
    { num: 14, mes: 'MARZO', semana: 4, lunes: '2026-03-16', viernes: '2026-03-20' },
    { num: 15, mes: 'ABRIL', semana: 1, lunes: '2026-03-23', viernes: '2026-03-27' },
    { num: 16, mes: 'ABRIL', semana: 2, lunes: '2026-03-30', viernes: '2026-04-03' },
    { num: 17, mes: 'ABRIL', semana: 3, lunes: '2026-04-06', viernes: '2026-04-10' },
    { num: 18, mes: 'ABRIL', semana: 4, lunes: '2026-04-13', viernes: '2026-04-17' },
    { num: 19, mes: 'MAYO', semana: 1, lunes: '2026-04-20', viernes: '2026-04-24' },
    { num: 20, mes: 'MAYO', semana: 2, lunes: '2026-04-27', viernes: '2026-05-01' },
    { num: 21, mes: 'MAYO', semana: 3, lunes: '2026-05-04', viernes: '2026-05-08' },
    { num: 22, mes: 'MAYO', semana: 4, lunes: '2026-05-11', viernes: '2026-05-15' },
    { num: 23, mes: 'JUNIO', semana: 1, lunes: '2026-05-18', viernes: '2026-05-22' },
    { num: 24, mes: 'JUNIO', semana: 2, lunes: '2026-05-25', viernes: '2026-05-29' },
    { num: 25, mes: 'JUNIO', semana: 3, lunes: '2026-06-01', viernes: '2026-06-05' },
    { num: 26, mes: 'JUNIO', semana: 4, lunes: '2026-06-08', viernes: '2026-06-12' },
    { num: 27, mes: 'JUNIO', semana: 5, lunes: '2026-06-15', viernes: '2026-06-19' },
    { num: 28, mes: 'JULIO', semana: 1, lunes: '2026-06-22', viernes: '2026-06-26' },
    { num: 29, mes: 'JULIO', semana: 2, lunes: '2026-06-29', viernes: '2026-07-03' },
    { num: 30, mes: 'JULIO', semana: 3, lunes: '2026-07-06', viernes: '2026-07-10' },
    { num: 31, mes: 'JULIO', semana: 4, lunes: '2026-07-13', viernes: '2026-07-17' },
    { num: 32, mes: 'AGOSTO', semana: 1, lunes: '2026-07-20', viernes: '2026-07-24' },
    { num: 33, mes: 'AGOSTO', semana: 2, lunes: '2026-07-27', viernes: '2026-07-31' },
    { num: 34, mes: 'AGOSTO', semana: 3, lunes: '2026-08-03', viernes: '2026-08-07' },
    { num: 35, mes: 'AGOSTO', semana: 4, lunes: '2026-08-10', viernes: '2026-08-14' },
    { num: 36, mes: 'SEPTIEMBRE', semana: 1, lunes: '2026-08-17', viernes: '2026-08-21' },
    { num: 37, mes: 'SEPTIEMBRE', semana: 2, lunes: '2026-08-24', viernes: '2026-08-28' },
    { num: 38, mes: 'SEPTIEMBRE', semana: 3, lunes: '2026-08-31', viernes: '2026-09-04' },
    { num: 39, mes: 'SEPTIEMBRE', semana: 4, lunes: '2026-09-07', viernes: '2026-09-11' },
    { num: 40, mes: 'OCTUBRE', semana: 1, lunes: '2026-09-14', viernes: '2026-09-18' },
    { num: 41, mes: 'OCTUBRE', semana: 2, lunes: '2026-09-21', viernes: '2026-09-25' },
    { num: 42, mes: 'OCTUBRE', semana: 3, lunes: '2026-09-28', viernes: '2026-10-02' },
    { num: 43, mes: 'OCTUBRE', semana: 4, lunes: '2026-10-05', viernes: '2026-10-09' },
    { num: 44, mes: 'OCTUBRE', semana: 5, lunes: '2026-10-12', viernes: '2026-10-16' },
    { num: 45, mes: 'NOVIEMBRE', semana: 1, lunes: '2026-10-19', viernes: '2026-10-23' },
    { num: 46, mes: 'NOVIEMBRE', semana: 2, lunes: '2026-10-26', viernes: '2026-10-30' },
    { num: 47, mes: 'NOVIEMBRE', semana: 3, lunes: '2026-11-02', viernes: '2026-11-06' },
    { num: 48, mes: 'NOVIEMBRE', semana: 4, lunes: '2026-11-09', viernes: '2026-11-13' },
    { num: 49, mes: 'DICIEMBRE', semana: 1, lunes: '2026-11-16', viernes: '2026-11-20' },
    { num: 50, mes: 'DICIEMBRE', semana: 2, lunes: '2026-11-23', viernes: '2026-11-27' },
    { num: 51, mes: 'DICIEMBRE', semana: 3, lunes: '2026-11-30', viernes: '2026-12-04' },
    { num: 52, mes: 'DICIEMBRE', semana: 4, lunes: '2026-12-07', viernes: '2026-12-11' },
  ];

  const identificarSemanaActual = () => {
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${año}-${mes}-${dia}`;

    const semanaEncontrada = tablaSemanas.find(s => {
      const fechaLunes = new Date(s.lunes + 'T00:00:00');
      const fechaViernes = new Date(s.viernes + 'T23:59:59');
      const fechaHoyObj = new Date(fechaHoy + 'T00:00:00');
      
      return fechaHoyObj >= fechaLunes && fechaHoyObj <= fechaViernes;
    });

    return semanaEncontrada || tablaSemanas[32];
  };

  const [proyectos, setProyectos] = useState<any[]>([]);
  const [proyectoId, setProyectoId] = useState('');
  const [proyectoSel, setProyectoSel] = useState<any>(null);
  const [torres, setTorres] = useState<any[]>([]);
  const [deptos, setDeptos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [kpis, setKpis] = useState({
    totalDeptos: 0,
    sinPreE: 0,
    enProceso: 0,
    conObs: 0,
    obsResueltas: 0,
    entregadosInmobiliaria: 0,
    entregadosPropietario: 0,
    promedioObs: 0,
    antiguedad: {
      hasta7: 0,
      entre8y14: 0,
      entre15y30: 0,
      mas30: 0
    }
  });

  const [semanaActual, setSemanaActual] = useState({ 
    lunes: '', 
    viernes: '', 
    semana: 0 as number | null,
    año: 0,
    nombreMes: ''
  });

  const [modalProyecto, setModalProyecto] = useState(false);

  // ← NUEVA: Calcular deptos por antigüedad
  const [deptosPorAntiguedad, setDeptosPorAntiguedad] = useState({
    menos7: 0,
    entre8y14: 0,
    entre15y30: 0,
    mas30: 0
  });

  const calcularDeptosPorAntiguedad = async (deptosData: any[]) => {
    const hoy = new Date();
    const contadores = { menos7: 0, entre8y14: 0, entre15y30: 0, mas30: 0 };
    
    try {
      // Obtener observaciones PRE-E de estos deptos
      const deptosIds = deptosData.map(d => d.id);
      const { data: obs } = await supabase
        .from('observacionesinformepv')
        .select('departamento_id, fecha_creacion')
        .in('departamento_id', deptosIds)
        .eq('tipo', 'PRE-E');

      // Agrupar deptos por rango de antigüedad de sus observaciones
      const deptosPorRango = new Map<string, number>();
      if (obs) {
        for (const o of obs) {
          if (!o.fecha_creacion) continue;
          const fechaCreacion = new Date(o.fecha_creacion);
          const diferencia = Math.floor((hoy.getTime() - fechaCreacion.getTime()) / (1000 * 60 * 60 * 24));
          
          if (!deptosPorRango.has(o.departamento_id)) {
            // Asignar al rango MAYOR (más antiguo) si tiene obs en múltiples rangos
            if (diferencia <= 7) deptosPorRango.set(o.departamento_id, 1);
            else if (diferencia <= 14) deptosPorRango.set(o.departamento_id, 2);
            else if (diferencia <= 30) deptosPorRango.set(o.departamento_id, 3);
            else deptosPorRango.set(o.departamento_id, 4);
          }
        }
      }

      // Contar deptos únicos por rango
      for (const rango of deptosPorRango.values()) {
        if (rango === 1) contadores.menos7++;
        else if (rango === 2) contadores.entre8y14++;
        else if (rango === 3) contadores.entre15y30++;
        else if (rango === 4) contadores.mas30++;
      }

      setDeptosPorAntiguedad(contadores);
    } catch (e) {
      console.error('Error calculando deptos por antigüedad:', e);
    }
  };

  useEffect(() => {
    const cargarProyectos = async () => {
      try {
        const { data } = await supabase
          .from('proyectos')
          .select('id, nombre, codigo, etapa')
          .eq('etapa', 'pre_entrega_postventa')
          .order('nombre');
        
        setProyectos(data || []);
        
        const proyectoGuardado = sessionStorage.getItem('preentrega_proyecto_id');
        
        if (proyectoGuardado && data?.some(p => p.id === proyectoGuardado)) {
          setProyectoId(proyectoGuardado);
        } else if (data && data.length > 0) {
          setProyectoId(data[0].id);
          sessionStorage.setItem('preentrega_proyecto_id', data[0].id);
        }
      } catch (err) {
        console.error('Error:', err);
      }
    };
    cargarProyectos();
  }, []);

  useEffect(() => {
    if (proyectoId) {
      sessionStorage.setItem('preentrega_proyecto_id', proyectoId);
    }
  }, [proyectoId]);

  useEffect(() => {
    const semanaActualData = identificarSemanaActual();
    
    const [lunesAño, lunesMes, lunesDia] = semanaActualData.lunes.split('-').map(Number);
    const [viernesAño, viernesMes, viernesDia] = semanaActualData.viernes.split('-').map(Number);
    
    const fechaLunes = new Date(lunesAño, lunesMes - 1, lunesDia);
    const fechaViernes = new Date(viernesAño, viernesMes - 1, viernesDia);
    
    const lunesFormato = fechaLunes.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
    const viernesFormato = fechaViernes.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    
    setSemanaActual({
      lunes: lunesFormato,
      viernes: viernesFormato,
      semana: semanaActualData.semana,
      año: 2026,
      nombreMes: semanaActualData.mes
    });
  }, []);

  useEffect(() => {
    if (!proyectoId) return;
    cargarDatos();
  }, [proyectoId]);

  // REALTIME: Escuchar cambios en departamentos y recalcular KPIs
  useEffect(() => {
    if (!proyectoId) return;

    const channel = supabase
      .channel(`departamentos:proyecto_id=eq.${proyectoId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'departamentos',
          filter: `proyecto_id=eq.${proyectoId}`
        },
        async (payload) => {
          console.log('🔄 Cambio detectado en departamentos:', payload);
          // Recargar datos cuando hay cambios
          await cargarDatos();
        }
      )
      .subscribe();

    // Limpiar suscripción al desmontar
    return () => {
      supabase.removeChannel(channel);
    };
  }, [proyectoId]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data: proy } = await supabase
        .from('proyectos')
        .select('*')
        .eq('id', proyectoId)
        .maybeSingle();
      setProyectoSel(proy);

      const { data: torresList } = await supabase
        .from('torres')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .order('nombre');
      
      setTorres(torresList || []);

      let deptosList: any[] = [];
      
      if (torresList && torresList.length > 0) {
        const torreIds = torresList.map(t => t.id);
        
        const { data: deptosData } = await supabase
          .from('departamentos')
          .select('id, numero, piso, torre_id, preentrega_estado')
          .in('torre_id', torreIds)
          .order('numero');

        deptosList = deptosData || [];
      }

      setDeptos(deptosList);
      await calcularKpis(deptosList, proyectoId);
      await calcularDeptosPorAntiguedad(deptosList); // ← NUEVA: Calcular deptos por antigüedad
    } catch (err) {
      console.error('Error cargarDatos:', err);
    }
    setLoading(false);
  };

  const calcularKpis = async (deptosList: any[], pId: string) => {
    try {
      const totalDeptos = deptosList.length;
      const sinPreE = deptosList.filter(d => !d.preentrega_estado || d.preentrega_estado === 1).length;
      const enProceso = deptosList.filter(d => d.preentrega_estado === 2).length;
      const listoEntregar = deptosList.filter(d => d.preentrega_estado === 3).length;
      const entregadosInmob = deptosList.filter(d => d.preentrega_estado === 4).length;
      const entregadosProp = deptosList.filter(d => d.preentrega_estado === 5).length;

      const deptosConPreE = enProceso + listoEntregar + entregadosInmob + entregadosProp;

      const { data: obsPreE } = await supabase
        .from('observacionesinformepv')
        .select('id, estado, fecha_creacion')
        .eq('proyecto_id', pId)
        .eq('tipo', 'PRE-E');

      const totalObs = obsPreE?.length || 0;
      const obsResueltas = obsPreE?.filter(o => o.estado === 'SOLUCIONADO').length || 0;
      const promedioObs = deptosConPreE > 0 ? parseFloat((totalObs / deptosConPreE).toFixed(1)) : 0;

      const hoy = new Date();
      let hasta7 = 0, entre8y14 = 0, entre15y30 = 0, mas30 = 0;

      obsPreE?.forEach(obs => {
        const fechaCreacion = new Date(obs.fecha_creacion);
        const diasTranscurridos = Math.floor((hoy.getTime() - fechaCreacion.getTime()) / (1000 * 60 * 60 * 24));

        if (diasTranscurridos <= 7) hasta7++;
        else if (diasTranscurridos <= 14) entre8y14++;
        else if (diasTranscurridos <= 30) entre15y30++;
        else mas30++;
      });

      setKpis({
        totalDeptos,
        sinPreE,
        enProceso,
        conObs: promedioObs,
        obsResueltas: listoEntregar,
        entregadosInmobiliaria: entregadosInmob,
        entregadosPropietario: entregadosProp,
        promedioObs,
        antiguedad: {
          hasta7,
          entre8y14,
          entre15y30,
          mas30
        }
      });
    } catch (err) {
      console.error('Error calculando KPIs:', err);
    }
  };

  const KPICard = ({ icon, label, value, percentage, color, onClick }: any) => (
    <div
      onClick={onClick}
      style={{
        background: dark
          ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)'
          : 'linear-gradient(135deg, #ffffff, #f8fafc)',
        border: `0.5px solid ${border}`,
        borderRadius: 16,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.2s, box-shadow 0.2s'
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLElement).style.boxShadow = dark ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      <div style={{ position: 'absolute', bottom: -8, right: -8, width: 50, height: 50, borderRadius: '50%', background: dark ? `radial-gradient(circle, ${color}08 0%, transparent 70%)` : `radial-gradient(circle, ${color}14 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <IonIcon icon={icon} style={{ fontSize: 24, color, minWidth: 24 }} />
        <div style={{ fontSize: 9, color: textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {label}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 32, fontWeight: 800, color: textPrimary, lineHeight: 1, marginBottom: 4 }}>
          {value}
        </div>
        {percentage > 0 && (
          <div style={{ fontSize: 10, color: textMuted }}>
            {percentage}% del total
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <IonPage style={{ '--background': bg } as any}>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#111' : 'transparent' }}>
            <IonMenuButton slot="start" />
            <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Pre Entrega / Post Venta</IonTitle>
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
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#111' : 'transparent' }}>
          <IonMenuButton slot="start" />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Pre Entrega / Post Venta</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg, paddingBottom: '88px' }}>
        <IonRefresher slot="fixed" onIonRefresh={async (e: any) => { await cargarDatos(); e.detail.complete(); }}>
          <IonRefresherContent />
        </IonRefresher>

        <div style={{ padding: '16px 16px 100px' }}>
          
          {/* BANNER PROYECTO - PROTAGONISMO - CLICKEABLE */}
          {proyectoSel && (
            <div
              onClick={() => setModalProyecto(true)}
              style={{
                background: dark
                  ? 'linear-gradient(135deg, #111 0%, #1a1a1a 50%, #111 100%)'
                  : 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                borderRadius: 16,
                padding: '24px 20px',
                marginBottom: 20,
                border: dark ? '0.5px solid #2a2a2a' : 'none',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 11, color: dark ? '#555' : 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
                  Proyecto Actual • Click para cambiar
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  {proyectoSel.nombre}
                </div>
                <div style={{ fontSize: 12, color: dark ? '#777' : 'rgba(255,255,255,0.7)' }}>
                  Código: {proyectoSel.codigo || '—'}
                </div>
              </div>
            </div>
          )}

          {/* SEMANA - MENOR PROTAGONISMO */}
          <div
            style={{
              background: card,
              border: `0.5px solid ${border}`,
              borderRadius: 12,
              padding: '12px 16px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}
          >
            <div>
              <div style={{ fontSize: 9, color: textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Semana Actual</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
                {semanaActual.semana ? `${semanaActual.nombreMes} ${semanaActual.semana}` : 'VACACIONES'}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 10, color: textMuted }}>
              {semanaActual.lunes} — {semanaActual.viernes}
            </div>
          </div>

          {/* SEPARADOR VISUAL */}
          <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginBottom: 20 }} />

          {/* KPI GRID 2x3 + 1 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>Estado de Deptos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <KPICard
                icon={square}
                color="#3b82f6"
                label="Deptos. Totales"
                value={kpis.totalDeptos}
                percentage={100}
                onClick={() => {
                  if (!proyectoId) return;
                  history.push('/deptos-filtrados', { tipo: 'todos', proyectoId, proyectoNombre: proyectoSel?.nombre });
                }}
              />
              <KPICard
                icon={alert}
                color="#ef4444"
                label="Sin Pre Entrega"
                value={kpis.sinPreE}
                percentage={kpis.totalDeptos > 0 ? Math.round((kpis.sinPreE / kpis.totalDeptos) * 100) : 0}
                onClick={() => {
                  if (!proyectoId) return;
                  history.push('/deptos-filtrados', { tipo: 'sinPreE', proyectoId, proyectoNombre: proyectoSel?.nombre });
                }}
              />
              <KPICard
                icon={build}
                color="#f59e0b"
                label="En Proceso"
                value={kpis.enProceso}
                percentage={kpis.totalDeptos > 0 ? Math.round((kpis.enProceso / kpis.totalDeptos) * 100) : 0}
                onClick={() => {
                  if (!proyectoId) return;
                  history.push('/deptos-filtrados', { tipo: 'enProceso', proyectoId, proyectoNombre: proyectoSel?.nombre });
                }}
              />
              <KPICard
                icon={alert}
                color="#8b5cf6"
                label="Obs. Promedio"
                value={kpis.conObs}
                percentage={0}
                onClick={() => {}}
              />
              <KPICard
                icon={checkmark}
                color="#22c55e"
                label="Listo Para Entregar"
                value={kpis.obsResueltas}
                percentage={kpis.totalDeptos > 0 ? Math.round((kpis.obsResueltas / kpis.totalDeptos) * 100) : 0}
                onClick={() => {
                  if (!proyectoId) return;
                  history.push('/deptos-filtrados', { tipo: 'listoEntregar', proyectoId, proyectoNombre: proyectoSel?.nombre });
                }}
              />
              <KPICard
                icon={folder}
                color="#06b6d4"
                label="Entregados Inmob."
                value={kpis.entregadosInmobiliaria}
                percentage={kpis.totalDeptos > 0 ? Math.round((kpis.entregadosInmobiliaria / kpis.totalDeptos) * 100) : 0}
                onClick={() => {
                  if (!proyectoId) return;
                  history.push('/deptos-filtrados', { tipo: 'entregadosInmob', proyectoId, proyectoNombre: proyectoSel?.nombre });
                }}
              />
            </div>

            {/* Séptimo KPI - Full width */}
            <KPICard
              icon={person}
              color="#ec4899"
              label="Entregados a Propietario"
              value={kpis.entregadosPropietario}
              percentage={kpis.totalDeptos > 0 ? Math.round((kpis.entregadosPropietario / kpis.totalDeptos) * 100) : 0}
              onClick={() => {
                if (!proyectoId) return;
                history.push('/deptos-filtrados', { tipo: 'entregadosProp', proyectoId, proyectoNombre: proyectoSel?.nombre })
              }}
            />
          </div>

          {/* SEPARADOR VISUAL */}
          <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginBottom: 20 }} />

          {/* SEPARADOR VISUAL */}
          <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginBottom: 20 }} />

          {/* ANTIGÜEDAD PRE ENTREGA - TÍTULO ARRIBA */}
          <div style={{ fontSize: 9, color: textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>Observaciones Pre Entrega por Antigüedad</div>

          {/* ANTIGÜEDAD PRE ENTREGA */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : 'linear-gradient(135deg, #ffffff, #f8fafc)', border: `0.5px solid ${border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Menos de 7 días', obs: kpis.antiguedad.hasta7, deptos: deptosPorAntiguedad.menos7, color: '#ef4444', textColor: '#f87171', tipo: 'antiguedad_menos7' },
                  { label: '8 a 14 días', obs: kpis.antiguedad.entre8y14, deptos: deptosPorAntiguedad.entre8y14, color: '#f59e0b', textColor: '#fbbf24', tipo: 'antiguedad_8a14' },
                  { label: '15 a 30 días', obs: kpis.antiguedad.entre15y30, deptos: deptosPorAntiguedad.entre15y30, color: '#8b5cf6', textColor: '#a78bfa', tipo: 'antiguedad_15a30' },
                  { label: 'Más de 30 días', obs: kpis.antiguedad.mas30, deptos: deptosPorAntiguedad.mas30, color: '#dc2626', textColor: '#ef4444', tipo: 'antiguedad_mas30' }
                ].map((item, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => {
                      if (!proyectoId) return;
                      history.push('/deptos-filtrados', { tipo: item.tipo, proyectoId, proyectoNombre: proyectoSel?.nombre });
                    }}
                    style={{ 
                      background: dark ? '#111' : '#f8fafc', 
                      borderRadius: 12, 
                      padding: 12, 
                      textAlign: 'center', 
                      border: `0.5px solid ${border}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      transform: 'scale(1)'
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)';
                      (e.currentTarget as HTMLElement).style.borderColor = item.color;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                      (e.currentTarget as HTMLElement).style.borderColor = border;
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: item.textColor, marginBottom: 12, lineHeight: 1.3 }}>{item.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: item.textColor, marginBottom: 4, lineHeight: 1 }}>
                      {item.obs}
                    </div>
                    <div style={{ fontSize: 8, color: item.textColor, fontWeight: 500, lineHeight: 1.2 }}>obs.</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: item.textColor, marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${border}` }}>
                      {item.deptos} deptos
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SEPARADOR VISUAL */}
          <div style={{ height: '0.5px', background: dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', marginBottom: 20 }} />

          {/* ANTIGÜEDAD POST VENTA */}
          <div>
            <div style={{ fontSize: 9, color: textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>Observaciones Post Venta por Antigüedad</div>
            <div style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : 'linear-gradient(135deg, #ffffff, #f8fafc)', border: `0.5px solid ${border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Menos de 7 días', count: 0, color: '#ef4444' },
                  { label: '8 a 14 días', count: 0, color: '#f59e0b' },
                  { label: '15 a 30 días', count: 0, color: '#8b5cf6' },
                  { label: 'Más de 30 días', count: 0, color: '#6b7280' }
                ].map((item, idx) => (
                  <div key={idx} style={{ background: dark ? '#111' : '#f8fafc', borderRadius: 12, padding: 12, textAlign: 'center', border: `0.5px solid ${border}` }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: item.color, marginBottom: 8, lineHeight: 1 }}>
                      {item.count}
                    </div>
                    <div style={{ fontSize: 9, color: textMuted, fontWeight: 500, lineHeight: 1.3 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </IonContent>

      {/* MODAL CAMBIAR PROYECTO */}
      <IonModal isOpen={modalProyecto} onDidDismiss={() => setModalProyecto(false)}>
        <IonHeader>
          <IonToolbar style={{ backgroundColor: toolbar }}>
            <IonTitle style={{ color: '#fff' }}>Cambiar Proyecto</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg } as any}>
          <div style={{ padding: '16px' }}>
            <div style={{ marginBottom: '12px' }}>
              {proyectos.map(proy => (
                <div
                  key={proy.id}
                  onClick={() => {
                    setProyectoId(proy.id);
                    setModalProyecto(false);
                  }}
                  style={{
                    background: proy.id === proyectoId 
                      ? (dark ? 'linear-gradient(135deg, #1e3a5f, #2563eb)' : 'linear-gradient(135deg, #dbeafe, #3b82f6)')
                      : card,
                    border: proy.id === proyectoId ? '0.5px solid #2563eb' : `0.5px solid ${border}`,
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    color: proy.id === proyectoId ? '#fff' : textPrimary
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>
                    {proy.nombre}
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    Código: {proy.codigo || '—'}
                  </div>
                  {proy.id === proyectoId && (
                    <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: '600' }}>
                      ✓ Seleccionado
                    </div>
                  )}
                </div>
              ))}
            </div>
            <IonButton
              expand="block"
              fill="clear"
              onClick={() => setModalProyecto(false)}
              style={{ marginTop: '16px' }}
            >
              Cerrar
            </IonButton>
          </div>
        </IonContent>
      </IonModal>

      {/* BOTTOM NAV BAR */}
      <BottomNavBar 
        activeTab="inicio"
        proyecto={proyectoSel}
        torres={torres}
        deptos={deptos}
        proyectoNombre={proyectoSel?.nombre || ''}
      />
    </IonPage>
  );
};

export default PreEntregaDashboard;
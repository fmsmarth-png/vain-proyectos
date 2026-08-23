import React, { useState, useMemo, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonSpinner, IonMenuButton, IonIcon
} from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabase';
import { barChart } from 'ionicons/icons';
import { calcularIndicador } from '../helpers/informeCalculos';
import BottomNavBar from '../components/BottomNavBar';

interface InputsIndicador {
  preE_maestros: number;
  preE_diasTrab: number;
  preE_obsSubsanadas: number;
  preE_obsOptimas: number;

  pv_maestros: number;
  pv_diasTrab: number;
  pv_obsSubsanadas: number;
  pv_obsOptimas: number;
}

interface Semana {
  num: number;
  mes: string;
  semana: number | null;
  lunes: string;
  viernes: string;
}

const tablaSemanas: Semana[] = [
  { num: 1, mes: 'ENERO', semana: 1, lunes: '2025-12-15', viernes: '2025-12-19' },
  { num: 28, mes: 'JULIO', semana: 1, lunes: '2026-06-22', viernes: '2026-06-26' },
  { num: 29, mes: 'JULIO', semana: 2, lunes: '2026-06-29', viernes: '2026-07-03' },
  { num: 30, mes: 'JULIO', semana: 3, lunes: '2026-07-06', viernes: '2026-07-10' },
  { num: 31, mes: 'JULIO', semana: 4, lunes: '2026-07-13', viernes: '2026-07-17' },
  { num: 32, mes: 'AGOSTO', semana: 1, lunes: '2026-07-20', viernes: '2026-07-24' },
  { num: 33, mes: 'AGOSTO', semana: 2, lunes: '2026-07-27', viernes: '2026-07-31' },
];

const identificarSemanaActual = (): Semana => {
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

  return semanaEncontrada || tablaSemanas[4];
};

const formatearFecha = (fechaStr: string): string => {
  const [año, mes, dia] = fechaStr.split('-').map(Number);
  const fecha = new Date(año, mes - 1, dia);
  return fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const InformePV: React.FC = () => {
  const { theme } = useTheme();
  const location = useLocation<any>();
  const dark = theme === 'dark';

  const bg = dark ? '#000000' : '#f5f5f5';
  const card = dark ? '#0e0e0e' : '#ffffff';
  const border = dark ? '#1e1e1e' : '#f0f0f0';
  const textPrimary = dark ? '#f9fafb' : '#000000';
  const textSecondary = dark ? '#6b7280' : '#666666';
  const textMuted = dark ? '#444444' : '#999999';
  const toolbar = dark ? '#1e3a5f' : '#1e3a5f';

  const proyectoInicial = location.state?.proyecto || null;
  const [proyectoSel, setProyectoSel] = useState<any>(proyectoInicial);
  const [torres, setTorres] = useState<any[]>([]);
  const [deptos, setDeptos] = useState<any[]>([]);
  const [loading, setLoading] = useState(!proyectoInicial);
  const [loadingObs, setLoadingObs] = useState(false);

  const [semanaSeleccionada, setSemanaSeleccionada] = useState<Semana>(identificarSemanaActual());
  const [obsData, setObsData] = useState<any[]>([]);

  const [inputs, setInputs] = useState<InputsIndicador>({
    preE_maestros: 2,
    preE_diasTrab: 5,
    preE_obsSubsanadas: 0,
    preE_obsOptimas: 10,
    pv_maestros: 1,
    pv_diasTrab: 1,
    pv_obsSubsanadas: 0,
    pv_obsOptimas: 4,
  });

  // Cargar proyecto si viene de PreEntrega
  useEffect(() => {
    if (proyectoInicial) {
      setLoading(false);
      return;
    }

    const cargarProyectoGuardado = async () => {
      try {
        const proyectoId = sessionStorage.getItem('informe_pv_proyecto_id');
        if (proyectoId) {
          const { data } = await supabase
            .from('proyectos')
            .select('*')
            .eq('id', proyectoId)
            .maybeSingle();
          if (data) setProyectoSel(data);
        }
      } catch (err) {
        console.error('Error cargando proyecto guardado:', err);
      } finally {
        setLoading(false);
      }
    };

    cargarProyectoGuardado();
  }, [proyectoInicial]);

  // Cargar torres y deptos cuando cambia el proyecto
  useEffect(() => {
    if (!proyectoSel?.id) return;
    cargarTorresYDeptos();
  }, [proyectoSel?.id]);

  const cargarTorresYDeptos = async () => {
    try {
      const { data: torresList } = await supabase
        .from('torres')
        .select('*')
        .eq('proyecto_id', proyectoSel.id)
        .order('nombre');
      
      console.log('✅ Torres cargadas en InformePV:', torresList?.length);
      setTorres(torresList || []);

      let deptosList: any[] = [];
      
      if (torresList && torresList.length > 0) {
        const torreIds = torresList.map(t => t.id);
        
        const { data: deptosData } = await supabase
          .from('departamentos')
          .select('*')
          .in('torre_id', torreIds)
          .order('numero');

        console.log('✅ Departamentos cargados en InformePV:', deptosData?.length);
        deptosList = deptosData || [];
      }

      setDeptos(deptosList);
    } catch (err) {
      console.error('❌ Error cargando torres y deptos:', err);
    }
  };

  // Cargar observaciones subsanadas
  useEffect(() => {
    if (!proyectoSel?.id) return;
    cargarObsSubsanadas();
  }, [proyectoSel?.id, semanaSeleccionada]);

  const cargarObsSubsanadas = async () => {
    if (!proyectoSel?.id) return;
    setLoadingObs(true);
    try {
      const semanaLabel = semanaSeleccionada.semana 
        ? `${semanaSeleccionada.mes} ${semanaSeleccionada.semana}` 
        : 'VACACIONES';

      const { data } = await supabase
        .from('observacionesinformepv')
        .select('*')
        .eq('proyecto_id', proyectoSel.id)
        .eq('tipo', 'PRE-E')
        .eq('estado', 'SOLUCIONADO')
        .eq('semana_creacion', semanaLabel);

      setObsData(data || []);

      const obsCount = (data || []).length;
      setInputs(prev => ({
        ...prev,
        preE_obsSubsanadas: obsCount,
      }));
    } catch (err) {
      console.error('Error cargando obs:', err);
    } finally {
      setLoadingObs(false);
    }
  };

  const indicador = useMemo(
    () => calcularIndicador(inputs),
    [inputs]
  );

  const handleSemanaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const numSemana = parseInt(e.target.value, 10);
    const semana = tablaSemanas.find(s => s.num === numSemana);
    if (semana) setSemanaSeleccionada(semana);
  };

  const semanaActualLabel = semanaSeleccionada.semana
    ? `${semanaSeleccionada.mes} ${semanaSeleccionada.semana}`
    : 'VACACIONES';

  const fechaLunesFormato = formatearFecha(semanaSeleccionada.lunes);
  const fechaViernesFormato = formatearFecha(semanaSeleccionada.viernes);

  // Log de debugging
  console.log('%c🎯 INFORME BOTTOMNAVBAR PROPS:', 'color: #9333ea; font-weight: bold; font-size: 14px;', {
    proyecto: proyectoSel ? `${proyectoSel.nombre} (${proyectoSel.id})` : 'NULL',
    torres_cantidad: torres.length,
    deptos_cantidad: deptos.length
  });

  if (loading) {
    return (
      <IonPage style={{ '--background': bg } as any}>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb' }}>
            <IonMenuButton slot="start" />
            <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Informes</IonTitle>
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
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonMenuButton slot="start" />
          <IonTitle style={{ fontSize: 14, fontWeight: 600 }}>Informes · Indicador</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg, paddingBottom: '88px' }}>
        <div style={{ padding: '14px' }}>
          
          {/* TARJETA DEL PROYECTO */}
          {proyectoSel && (
            <div
              style={{
                background: dark 
                  ? 'linear-gradient(135deg, #0e0e0e 0%, #161616 100%)' 
                  : 'linear-gradient(135deg, #f0f4f8, #ffffff)',
                border: `0.5px solid ${border}`,
                borderRadius: 14,
                padding: 16,
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  flexShrink: 0,
                }}
              >
                <IonIcon icon={barChart} style={{ color: '#fff' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: '#2563eb', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>
                  Proyecto
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 3 }}>
                  {proyectoSel.nombre}
                </div>
                <div style={{ fontSize: 11, color: textMuted }}>
                  Código: {proyectoSel.codigo || '—'}
                </div>
              </div>
            </div>
          )}

          {/* SELECTOR DE SEMANA */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
              Cambiar semana
            </label>
            <select
              value={semanaSeleccionada.num}
              onChange={handleSemanaChange}
              style={{
                width: '100%',
                height: 40,
                padding: '8px 12px',
                background: card,
                border: `1px solid ${border}`,
                borderRadius: 10,
                color: textPrimary,
                fontSize: 13,
                fontWeight: 600,
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${textPrimary}' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '20px',
                paddingRight: '36px',
              }}
            >
              {tablaSemanas.map(s => (
                <option key={s.num} value={s.num}>
                  {s.semana ? `${s.mes} ${s.semana}` : s.mes}
                </option>
              ))}
            </select>
          </div>

          {/* INFO SEMANA SELECCIONADA */}
          <div
            style={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 12,
              padding: 12,
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 9, color: textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
              Semana Seleccionada
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary, marginBottom: 6 }}>
              {semanaActualLabel}
            </div>
            <div style={{ fontSize: 11, color: textSecondary, marginBottom: 8 }}>
              del {fechaLunesFormato} al {fechaViernesFormato}
            </div>
            <div style={{ fontSize: 10, color: textMuted }}>
              {loadingObs ? 'Cargando...' : `${obsData.length} observaciones subsanadas`}
            </div>
          </div>

          {/* INPUTS: MAESTROS Y DÍAS TRABAJADOS */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 10, fontWeight: 700, color: textPrimary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              Indicar cantidad de maestros y días trabajados
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* PRE-E */}
              <div style={{
                background: card,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: 12,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3880ff', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  PRE-ENTREGA
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 9, color: textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    Maestros
                  </label>
                  <input
                    type="number"
                    value={inputs.preE_maestros}
                    onChange={(e) => setInputs(prev => ({ ...prev, preE_maestros: Number(e.target.value) || 0 }))}
                    style={{
                      width: '100%',
                      height: 36,
                      borderRadius: 8,
                      border: `0.5px solid ${border}`,
                      padding: '0 10px',
                      background: dark ? '#111111' : '#f9f9f9',
                      color: textPrimary,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                    min="0"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 9, color: textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    Días trabajados
                  </label>
                  <input
                    type="number"
                    value={inputs.preE_diasTrab}
                    onChange={(e) => setInputs(prev => ({ ...prev, preE_diasTrab: Number(e.target.value) || 0 }))}
                    style={{
                      width: '100%',
                      height: 36,
                      borderRadius: 8,
                      border: `0.5px solid ${border}`,
                      padding: '0 10px',
                      background: dark ? '#111111' : '#f9f9f9',
                      color: textPrimary,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                    min="0"
                  />
                </div>
              </div>

              {/* PV */}
              <div style={{
                background: card,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: 12,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9333ea', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  POST-VENTA
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 9, color: textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    Maestros
                  </label>
                  <input
                    type="number"
                    value={inputs.pv_maestros}
                    onChange={(e) => setInputs(prev => ({ ...prev, pv_maestros: Number(e.target.value) || 0 }))}
                    style={{
                      width: '100%',
                      height: 36,
                      borderRadius: 8,
                      border: `0.5px solid ${border}`,
                      padding: '0 10px',
                      background: dark ? '#111111' : '#f9f9f9',
                      color: textPrimary,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                    min="0"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 9, color: textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    Días trabajados
                  </label>
                  <input
                    type="number"
                    value={inputs.pv_diasTrab}
                    onChange={(e) => setInputs(prev => ({ ...prev, pv_diasTrab: Number(e.target.value) || 0 }))}
                    style={{
                      width: '100%',
                      height: 36,
                      borderRadius: 8,
                      border: `0.5px solid ${border}`,
                      padding: '0 10px',
                      background: dark ? '#111111' : '#f9f9f9',
                      color: textPrimary,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                    min="0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TABLA DE INDICADOR */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 10, fontWeight: 700, color: textPrimary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              📊 Indicador de Producción
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  minWidth: 500,
                  borderCollapse: 'collapse',
                  background: card,
                  border: `1px solid ${border}`,
                  borderRadius: 8,
                  fontSize: '0.85rem',
                }}
              >
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #3880ff 0%, #2e63d4 100%)', color: 'white' }}>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>ETAPA</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>MAESTROS</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>DÍAS</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>OBS SUBSANADAS</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>PRODUCTIVIDAD</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>PONDERACIÓN</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600, color: '#3880ff', fontSize: '0.85rem' }}>PRE-E</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: textPrimary }}>{indicador.preE.maestros}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: textPrimary }}>{indicador.preE.diasTrab}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: textPrimary }}>{indicador.preE.obsSubsanadas}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: '#0066cc', fontWeight: 500, fontSize: '0.85rem' }}>{indicador.preE.productividad}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: '#0066cc', fontWeight: 500, fontSize: '0.85rem' }}>{indicador.preE.ponderacion}</td>
                  </tr>

                  <tr style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600, color: '#9333ea', fontSize: '0.85rem' }}>PV</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: textPrimary }}>{indicador.pv.maestros}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: textPrimary }}>{indicador.pv.diasTrab}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: textPrimary }}>{indicador.pv.obsSubsanadas}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: '#0066cc', fontWeight: 500, fontSize: '0.85rem' }}>{indicador.pv.productividad}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: '#0066cc', fontWeight: 500, fontSize: '0.85rem' }}>{indicador.pv.ponderacion}</td>
                  </tr>

                  <tr style={{ background: dark ? '#1a3a52' : '#e7f3ff', fontWeight: 600 }}>
                    <td style={{ padding: '8px 6px', textAlign: 'left', color: dark ? '#90caf9' : '#1565c0', fontSize: '0.85rem' }}>ÓPTIMO</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.maestros}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.diasTrab}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.obsSubsanadas.toFixed(1)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0', fontSize: '0.85rem' }}>{indicador.optimo.productividad}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0', fontSize: '0.85rem' }}>{indicador.optimo.ponderacion}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* MÉTRICA PRODUCTIVIDAD PROMEDIO */}
          <div
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              padding: 20,
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.9, marginBottom: 10 }}>
              Productividad Promedio Diaria
            </div>
            <div style={{ fontSize: 48, fontWeight: 900, fontFamily: 'system-ui, -apple-system, sans-serif', letterSpacing: '2px', lineHeight: 1 }}>
              {indicador.productividadPromedioDiaria}
            </div>
          </div>

        </div>
      </IonContent>

      {/* BOTTOM NAV BAR - COMPONENTE EXTERNO */}
      <BottomNavBar 
        activeTab="informes"
        proyecto={proyectoSel}
        torres={torres}
        deptos={deptos}
        proyectoNombre={proyectoSel?.nombre || ''}
      />
    </IonPage>
  );
};

export default InformePV;
import React, { useState, useMemo, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonSpinner, IonMenuButton, IonIcon
} from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';
import { barChart } from 'ionicons/icons';
import { calcularIndicador, IndicadorCalculos } from '../helpers/informeCalculos';

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
  { num: 2, mes: 'VACACIONES', semana: null, lunes: '2025-12-22', viernes: '2025-12-26' },
  { num: 3, mes: 'VACACIONES', semana: null, lunes: '2025-12-29', viernes: '2026-01-02' },
  { num: 4, mes: 'ENERO', semana: 2, lunes: '2026-01-05', viernes: '2026-01-09' },
  { num: 5, mes: 'ENERO', semana: 3, lunes: '2026-01-12', viernes: '2026-01-16' },
  { num: 6, mes: 'ENERO', semana: 4, lunes: '2026-01-19', viernes: '2026-01-23' },
  { num: 7, mes: 'FEBRERO', semana: 1, lunes: '2026-01-26', viernes: '2026-01-30' },
  { num: 8, mes: 'FEBRERO', semana: 2, lunes: '2026-02-02', viernes: '2026-02-06' },
  { num: 9, mes: 'FEBRERO', semana: 3, lunes: '2026-02-09', viernes: '2026-02-13' },
  { num: 10, mes: 'FEBRERO', semana: 4, lunes: '2026-02-16', viernes: '2026-02-20' },
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

  return semanaEncontrada || tablaSemanas[14];
};

export const InformePV: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg = dark ? '#000000' : '#f5f5f5';
  const card = dark ? '#0e0e0e' : '#ffffff';
  const border = dark ? '#1e1e1e' : '#f0f0f0';
  const textPrimary = dark ? '#f9fafb' : '#000000';
  const textSecondary = dark ? '#6b7280' : '#666666';
  const textMuted = dark ? '#444444' : '#999999';
  const toolbar = dark ? '#1e3a5f' : '#1e3a5f';

  const [proyectos, setProyectos] = useState<any[]>([]);
  const [proyectoId, setProyectoId] = useState('');
  const [proyectoSel, setProyectoSel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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

  // Cargar proyectos
  useEffect(() => {
    const cargarProyectos = async () => {
      try {
        const { data } = await supabase
          .from('proyectos')
          .select('id, nombre, codigo, etapa')
          .eq('etapa', 'pre_entrega_postventa')
          .order('nombre');

        setProyectos(data || []);

        const proyectoGuardado = sessionStorage.getItem('informe_pv_proyecto_id');
        if (proyectoGuardado && data?.some(p => p.id === proyectoGuardado)) {
          setProyectoId(proyectoGuardado);
        } else if (data && data.length > 0) {
          setProyectoId(data[0].id);
          sessionStorage.setItem('informe_pv_proyecto_id', data[0].id);
        }
      } catch (err) {
        console.error('Error cargando proyectos:', err);
      } finally {
        setLoading(false);
      }
    };
    cargarProyectos();
  }, []);

  // Cargar detalles del proyecto
  useEffect(() => {
    if (!proyectoId) return;
    const cargarProyecto = async () => {
      try {
        const { data } = await supabase
          .from('proyectos')
          .select('*')
          .eq('id', proyectoId)
          .maybeSingle();
        setProyectoSel(data);
        sessionStorage.setItem('informe_pv_proyecto_id', proyectoId);
      } catch (err) {
        console.error('Error cargando proyecto:', err);
      }
    };
    cargarProyecto();
  }, [proyectoId]);

  // Cargar observaciones subsanadas de la semana
  useEffect(() => {
    if (!proyectoId) return;
    cargarObsSubsanadas();
  }, [proyectoId, semanaSeleccionada]);

  const cargarObsSubsanadas = async () => {
    if (!proyectoId) return;
    setLoadingObs(true);
    try {
      const semanaLabel = semanaSeleccionada.semana 
        ? `${semanaSeleccionada.mes} ${semanaSeleccionada.semana}` 
        : 'VACACIONES';

      const { data } = await supabase
        .from('observacionesinformepv')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .eq('tipo', 'PRE-E')
        .eq('estado', 'SOLUCIONADO')
        .eq('semana_creacion', semanaLabel);

      setObsData(data || []);

      // Actualizar inputs con datos reales
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
          <IonTitle style={{ fontSize: 14, fontWeight: 600 }}>Informes · Indicador PV</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg, paddingBottom: '20px' }}>
        <div style={{ padding: '14px' }}>
          
          {/* SELECTOR DE PROYECTO */}
          <div style={{ marginBottom: '16px' }}>
            <select
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value)}
              style={{
                width: '100%',
                height: 40,
                padding: '8px 12px',
                background: card,
                border: `1px solid ${border}`,
                borderRadius: 8,
                color: textPrimary,
                fontSize: 13,
                fontWeight: 500,
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${textPrimary}' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '20px',
                paddingRight: '36px',
              }}
            >
              {proyectos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

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
                  width: 50,
                  height: 50,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  flexShrink: 0,
                }}
              >
                <IonIcon icon={barChart} style={{ color: '#fff' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: '#2563eb', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
                  Proyecto
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary, marginBottom: 2 }}>
                  {proyectoSel.nombre}
                </div>
                <div style={{ fontSize: 11, color: textMuted }}>
                  Código: {proyectoSel.codigo || '—'}
                </div>
              </div>
            </div>
          )}

          {/* SELECTOR DE SEMANA */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
              Selecciona semana
            </label>
            <select
              value={semanaSeleccionada.num}
              onChange={handleSemanaChange}
              style={{
                width: '100%',
                height: 42,
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
                  {s.semana ? `${s.mes} ${s.semana}` : s.mes} ({s.lunes} a {s.viernes})
                </option>
              ))}
            </select>
          </div>

          {/* INFO DE SEMANA SELECCIONADA */}
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
            <div style={{ fontSize: 10, color: textMuted, marginBottom: 4 }}>Semana Seleccionada</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>
              {semanaActualLabel}
            </div>
            <div style={{ fontSize: 11, color: textSecondary }}>
              {semanaSeleccionada.lunes} a {semanaSeleccionada.viernes}
            </div>
            <div style={{ fontSize: 10, color: textMuted, marginTop: 8 }}>
              {loadingObs ? 'Cargando...' : `${obsData.length} observaciones subsanadas`}
            </div>
          </div>

          {/* TABLA DE INDICADOR */}
          <div style={{ overflow: 'auto', marginBottom: 20 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, color: textPrimary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              📊 Indicador de Producción
            </h3>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                background: card,
                border: `1px solid ${border}`,
                borderRadius: 8,
                overflow: 'hidden',
                fontSize: '0.9rem',
              }}
            >
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #3880ff 0%, #2e63d4 100%)', color: 'white' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    TRABAJOS
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    MAESTROS
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    DÍAS TRAB
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    DÍA × MAESTRO
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    OBS SUBSANADAS
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    OBS/DÍA
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    PRODUCTIVIDAD
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    PONDERACIÓN
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    PROMEDIO
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* PRE-E */}
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  <td style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#3880ff' }}>PRE-E</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.preE.maestros}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.preE.diasTrab}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.preE.diaXMaestro}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.preE.obsSubsanadas}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.preE.obsDiaXMaestro.toFixed(2)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: '#0066cc', fontWeight: 500 }}>{indicador.preE.productividad}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: '#0066cc', fontWeight: 500 }}>{indicador.preE.ponderacion}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: '#0066cc', fontWeight: 500 }}>{indicador.preE.promedioPonderado}</td>
                </tr>

                {/* PV */}
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  <td style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#3880ff' }}>PV</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.pv.maestros}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.pv.diasTrab}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.pv.diaXMaestro}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.pv.obsSubsanadas}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: textPrimary }}>{indicador.pv.obsDiaXMaestro.toFixed(2)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: '#0066cc', fontWeight: 500 }}>{indicador.pv.productividad}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: '#0066cc', fontWeight: 500 }}>{indicador.pv.ponderacion}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: '#0066cc', fontWeight: 500 }}>{indicador.pv.promedioPonderado}</td>
                </tr>

                {/* ÓPTIMO */}
                <tr style={{ background: dark ? '#1a3a52' : '#e7f3ff', fontWeight: 600 }}>
                  <td style={{ padding: '10px 8px', textAlign: 'left', color: dark ? '#90caf9' : '#1565c0' }}>ÓPTIMO</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.maestros}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.diasTrab}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.diaXMaestro}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.obsSubsanadas.toFixed(1)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.obsDiaXMaestro.toFixed(2)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.productividad}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.ponderacion}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: dark ? '#90caf9' : '#1565c0' }}>{indicador.optimo.promedioPonderado}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* MÉTRICA DE PRODUCTIVIDAD PROMEDIO DIARIA */}
          <div
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              padding: 20,
              borderRadius: 14,
              textAlign: 'center',
              marginBottom: 20,
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.95, marginBottom: 8 }}>
              Productividad Promedio Diaria
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Courier New', monospace", letterSpacing: '1px' }}>
              {indicador.productividadPromedioDiaria}
            </div>
          </div>

          {/* INPUTS PARA TESTING */}
          <div
            style={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <h4 style={{ fontSize: 11, fontWeight: 700, color: textPrimary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              ⚙️ Parámetros (Testing)
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 10, color: textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  PRE-E Maestros
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
                    padding: '0 8px',
                    background: dark ? '#111111' : '#f9f9f9',
                    color: textPrimary,
                    fontSize: 13,
                  }}
                  min="0"
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  PRE-E Días
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
                    padding: '0 8px',
                    background: dark ? '#111111' : '#f9f9f9',
                    color: textPrimary,
                    fontSize: 13,
                  }}
                  min="0"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, color: textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  PV Maestros
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
                    padding: '0 8px',
                    background: dark ? '#111111' : '#f9f9f9',
                    color: textPrimary,
                    fontSize: 13,
                  }}
                  min="0"
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  PV Días
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
                    padding: '0 8px',
                    background: dark ? '#111111' : '#f9f9f9',
                    color: textPrimary,
                    fontSize: 13,
                  }}
                  min="0"
                />
              </div>
            </div>
          </div>

        </div>
      </IonContent>
    </IonPage>
  );
};

export default InformePV;
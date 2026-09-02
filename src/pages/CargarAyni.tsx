import { IonContent, IonHeader, IonMenuButton, IonPage, IonToolbar, IonTitle, IonToast, IonSpinner } from '@ionic/react';
import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';
import { parsearAyni, type ResultadoParseo } from '../utils/parsearAyni';

interface Proyecto { id: string; nombre: string; codigo: string; }

const CargarAyni: React.FC = () => {
  const { theme, palette: p } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);
  const location = useLocation<{ proyecto?: Proyecto }>();
  const fileInput = useRef<HTMLInputElement>(null);

  const bg           = p.bg;
  const cardGrad     = p.card;
  const border       = p.line;
  const textPrimary  = p.textPrimary;
  const textSecondary= p.textSecondary;
  const textMuted    = p.textMuted;
  const toolbar      = dark ? p.panel : '#1e3a5f';
  const azul         = p.kpiBlue;
  const verde        = p.kpiGreen;
  const amarillo     = p.kpiAmber;

  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`,
    padding: '16px', marginBottom: 12,
  };

  const [proyecto, setProyecto] = useState<Proyecto | null>(location.state?.proyecto ?? null);
  const [resultado, setResultado] = useState<ResultadoParseo | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargarProyecto(); }
  });

  const cargarProyecto = async () => {
    if (proyecto) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;
    const { data: up } = await supabase
      .from('usuario_proyectos')
      .select('proyecto_id, proyectos ( id, nombre, codigo )')
      .eq('usuario_id', authData.user.id)
      .eq('es_principal', true)
      .maybeSingle();
    if (up?.proyectos) setProyecto(up.proyectos as unknown as Proyecto);
  };

  const seleccionarArchivo = () => fileInput.current?.click();

  const onArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNombreArchivo(file.name);
    setProcesando(true);
    setResultado(null);
    try {
      const res = await parsearAyni(file);
      setResultado(res);
    } catch (err: any) {
      setToastColor('danger');
      setToastMsg('No se pudo leer el Excel: ' + (err?.message ?? 'formato inesperado'));
    }
    setProcesando(false);
    if (fileInput.current) fileInput.current.value = ''; // permite re-subir el mismo archivo
  };

  const confirmar = async () => {
    if (!proyecto || !resultado) return;
    setGuardando(true);
    const { data, error } = await supabase.rpc('bodega_procesar_carga_ayni', {
      p_proyecto_id: proyecto.id,
      p_nombre_archivo: nombreArchivo,
      p_materiales: resultado.materiales,
      p_lineas: resultado.lineas,
    });
    setGuardando(false);
    if (error) {
      setToastColor('danger');
      setToastMsg('Error al guardar: ' + error.message);
    } else {
      setToastColor('success');
      setToastMsg(`Planilla cargada: ${resultado.resumen.materialesUnicos} materiales actualizados`);
      setResultado(null);
      setNombreArchivo('');
    }
  };

  const Stat = ({ valor, label, color }: { valor: number; label: string; color?: string }) => (
    <div style={{ flex: 1, textAlign: 'center', padding: '10px 6px' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: color ?? textPrimary }}>{valor}</div>
      <div style={{ fontSize: 10, color: textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  );

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Cargar planilla AYNI</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16, paddingBottom: 40 }}>

          {proyecto && (
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>{proyecto.nombre}</div>
          )}

          {/* Instrucciones + botón de carga */}
          <div style={sCard}>
            <div style={{ fontSize: 14, color: textPrimary, marginBottom: 6 }}>Sube el Excel tal cual sale de AYNI</div>
            <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.5, marginBottom: 14 }}>
              La app calcula el recibido (comprado − por recepcionar), filtra servicios y agrupa por material.
              La última planilla reemplaza el recibido anterior; los vales entregados no se tocan.
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12"
              onChange={onArchivo}
              style={{ display: 'none' }}
            />
            <button onClick={seleccionarArchivo} disabled={procesando} style={{ width: '100%', height: 46, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {procesando ? 'Procesando...' : '📄 Seleccionar planilla'}
            </button>
            {nombreArchivo && !procesando && (
              <div style={{ fontSize: 11, color: textMuted, marginTop: 8, textAlign: 'center' }}>{nombreArchivo}</div>
            )}
          </div>

          {procesando && (
            <div style={{ textAlign: 'center', padding: 30 }}><IonSpinner name="crescent" /></div>
          )}

          {/* Preview antes de confirmar */}
          {resultado && !procesando && (
            <>
              <div style={sCard}>
                <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 6 }}>Previsualización</div>
                <div style={{ display: 'flex', borderBottom: `0.5px solid ${border}`, marginBottom: 4 }}>
                  <Stat valor={resultado.resumen.materialesUnicos} label="Materiales" color={azul} />
                  <Stat valor={resultado.resumen.conStock} label="Con stock" color={verde} />
                </div>
                <div style={{ display: 'flex', borderBottom: `0.5px solid ${border}`, marginBottom: 4 }}>
                  <Stat valor={resultado.resumen.servicios} label="Servicios ignorados" color={amarillo} />
                  <Stat valor={resultado.resumen.noComprados} label="No comprados" color={textMuted} />
                </div>
                {resultado.resumen.conConversionUnidad > 0 && (
                  <div style={{ display: 'flex' }}>
                    <Stat valor={resultado.resumen.conConversionUnidad} label="Con conversión de unidad" color={amarillo} />
                  </div>
                )}
                <div style={{ fontSize: 11, color: textMuted, textAlign: 'center', marginTop: 8 }}>
                  {resultado.resumen.total} líneas leídas en total
                </div>
              </div>

              {/* Muestra de materiales con stock */}
              <div style={sCard}>
                <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 10 }}>
                  Materiales con stock (muestra)
                </div>
                {resultado.materiales.filter(m => m.recibido > 0).slice(0, 12).map((m, i, arr) => (
                  <div key={m.nombre + m.unidad} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < arr.length - 1 ? `0.5px solid ${border}` : 'none' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nombre}</div>
                      <div style={{ fontSize: 10, color: textMuted }}>
                        {m.familia}{m.n_lineas_oc > 1 ? ` · ${m.n_lineas_oc} OC` : ''}
                        {m.factor_conversion !== 1 && (
                          <span style={{ color: amarillo }}> · 1 {m.unidad} = {m.factor_conversion} {m.unidad_solicitud}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: textPrimary, fontWeight: 500, marginLeft: 8, whiteSpace: 'nowrap' }}>
                      {Math.round(m.recibido * m.factor_conversion * 100) / 100} <span style={{ fontSize: 10, color: textMuted }}>{m.unidad_solicitud}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={confirmar} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: verde, border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {guardando ? 'Guardando...' : 'Confirmar carga'}
              </button>
              <button onClick={() => { setResultado(null); setNombreArchivo(''); }} disabled={guardando} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>
                Cancelar
              </button>
            </>
          )}

        </div>
      </IonContent>

      <IonToast isOpen={!!toastMsg} message={toastMsg} duration={3000} color={toastColor} onDidDismiss={() => setToastMsg('')} />
    </IonPage>
  );
};

export default CargarAyni;
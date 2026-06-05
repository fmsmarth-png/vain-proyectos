import {
  IonContent, IonPage, IonHeader, IonToolbar, IonTitle,
  IonSpinner, IonModal, IonSelect, IonSelectOption
} from '@ionic/react';
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { lineaConfig, lineas } from '../utils/lineas';
import { useTheme } from '../Context/ThemeContext';
import {
  Actividad, calcularPosiciones, posicionesPorTorre,
  actividadTeoricaDepto, normalizarFrente, parsearFrentesTorre,
  agruparPorCuadrilla
} from '../utils/programaCalc';

const VisitaObra: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg            = dark ? '#000000' : '#f0f4f8';
  const card          = dark ? '#0e0e0e'  : '#ffffff';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#444444' : '#94a3b8';
  const toolbar       = dark ? '#000000' : '#1e3a5f';
  const inputBg       = dark ? '#1a1a1a' : '#f8fafc';

  const [visita, setVisita]                         = useState<any>(null);
  const [loading, setLoading]                       = useState(false);
  const [proyectos, setProyectos]                   = useState<any[]>([]);
  const [proyectoSel, setProyectoSel]               = useState<any>(null);
  const [torres, setTorres]                         = useState<any[]>([]);
  const [torreSel, setTorreSel]                     = useState<any>(null);
  const [deptos, setDeptos]                         = useState<any[]>([]);
  const [deptoSel, setDeptoSel]                     = useState<any>(null);
  const [actividades, setActividades]               = useState<Actividad[]>([]);
  const [frenteMoldaje, setFrenteMoldaje]           = useState('');
  const [resultadoCalculo, setResultadoCalculo]     = useState<any>(null);
  const [obsProyecto, setObsProyecto]               = useState('');
  const [obsTorre, setObsTorre]                     = useState('');
  const [obsDepto, setObsDepto]                     = useState('');
  const [cuadrillaReal, setCuadrillaReal]           = useState('');
  const [pantalla, setPantalla]                     = useState<'inicio'|'proyecto'|'torres'|'torre'|'depto'>('inicio');
  const [showAlertTerminar, setShowAlertTerminar]   = useState(false);
  const [usuario, setUsuario]                       = useState<any>(null);
  const [lineaSel, setLineaSel] = useState<string>('');
  useEffect(() => { cargarInicial(); }, []);

  const cargarInicial = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: perfil } = await supabase.from('usuarios').select('*').eq('id', user.id).single();
    setUsuario(perfil);

    let proy: any[] = [];
    if (perfil?.rol === 'administrador') {
      const { data } = await supabase.from('proyectos').select('*').eq('estado', 'activo').order('nombre');
      proy = data ?? [];
    } else {
      const { data: asignados } = await supabase.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user.id);
      const ids = asignados?.map((a: any) => a.proyecto_id) ?? [];
      if (ids.length > 0) {
        const { data } = await supabase.from('proyectos').select('*').eq('estado', 'activo').in('id', ids).order('nombre');
        proy = data ?? [];
      }
    }
    setProyectos(proy);
    await cargarActividades();
  };

  const cargarActividades = async () => {
    const { data: programa } = await supabase
      .from('programas_obra').select('id').eq('activo', true).single();
    if (!programa) return;
    const { data } = await supabase
      .from('programa_actividades')
      .select('*').eq('programa_id', programa.id).eq('activo', true).order('orden');
    setActividades(data || []);
  };

  const iniciarVisita = async () => {
    if (!proyectoSel) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from('visitas_obra').insert({
      proyecto_id: proyectoSel.id,
      creado_por: user?.id,
      estado: 'activa'
    }).select().single();
    setVisita(data);
    const { data: t } = await supabase.from('torres').select('*').eq('proyecto_id', proyectoSel.id).order('nombre');
    setTorres(t || []);
    setLoading(false);
    setPantalla('proyecto');
  };

  const guardarObs = async (nivel: string, extra: any = {}) => {
    if (!visita) return;
    await supabase.from('visita_observaciones').insert({
      visita_id: visita.id, nivel, ...extra
    });
  };

  const aplicarMoldaje = () => {
    if (!frenteMoldaje || actividades.length === 0) return;
    const f = normalizarFrente(frenteMoldaje);
    const resultado = calcularPosiciones(f, actividades);
    setResultadoCalculo(resultado);
    if (resultado && visita) {
      supabase.from('visitas_obra').update({ frente_moldaje: f }).eq('id', visita.id);
    }
  };

  const seleccionarTorre = async (torre: any) => {
    setTorreSel(torre);
    const { data } = await supabase.from('departamentos').select('*').eq('torre_id', torre.id).order('numero');
    setDeptos(data || []);
    setPantalla('torre');
  };

  const terminarVisita = async () => {
    if (!visita) return;
    await supabase.from('visitas_obra')
      .update({ estado: 'terminada', terminada_en: new Date().toISOString() })
      .eq('id', visita.id);
    setVisita(null); setPantalla('inicio'); setProyectoSel(null);
    setTorreSel(null); setDeptoSel(null); setFrenteMoldaje(''); setResultadoCalculo(null);
  };

  const cuadrillasEnTorre = () => {
    if (!resultadoCalculo || !torreSel) return [];
    const nums = parsearFrentesTorre(torreSel.frente || '');
    return posicionesPorTorre(resultadoCalculo.posiciones, nums);
  };

  const infoDepto = () => {
    if (!resultadoCalculo || !deptoSel?.frente_depto) return null;
    return actividadTeoricaDepto(deptoSel.frente_depto, actividades, resultadoCalculo.diaObra);
  };

  const cuadrillasAgrupadas = agruparPorCuadrilla(actividades);
   const proyectosFiltrados = lineaSel ? proyectos.filter(p => p.linea === lineaSel) : [];
  const guardarObsDepto = async () => {
    const info = infoDepto();
    let actTeorica: any = null;
    let desfase = null;
    if (info?.actual) {
      actTeorica = info.actual;
      if (cuadrillaReal) {
        const actReal = actividades.find(a => a.cuadrilla === cuadrillaReal);
        const actTeoricaObj = actividades.find(a => a.actividad === actTeorica.actividad);
        if (actReal && actTeoricaObj) desfase = actTeoricaObj.dia_inicio - actReal.dia_inicio;
      }
    }
    await guardarObs('departamento', {
      torre_id: torreSel?.id,
      departamento_id: deptoSel?.id,
      observacion: obsDepto || null,
      frente_depto: deptoSel?.frente_depto,
      actividad_teorica: actTeorica?.actividad ?? null,
      cuadrilla_teorica: actTeorica?.cuadrilla ?? null,
      actividad_real: cuadrillaReal || null,
      desfase_dias: desfase
    });
    setObsDepto(''); setCuadrillaReal(''); setPantalla('torre');
  };

  // ─── BANNER ───────────────────────────────────────────
  const Banner = () => visita ? (
    <div style={{
      background: '#1e3a5f', borderRadius: 12, padding: '10px 14px',
      marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10
    }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ color: '#f9fafb', fontSize: 13, fontWeight: 600 }}>
          Visita activa · {proyectoSel?.nombre}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
          {new Date(visita.iniciada_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          {resultadoCalculo ? ` · Moldaje: ${normalizarFrente(frenteMoldaje)}` : ''}
        </div>
      </div>
      <button
        onClick={() => setShowAlertTerminar(true)}
        style={{ background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 10px', color: '#f9fafb', fontSize: 12, cursor: 'pointer' }}
      >Terminar</button>
    </div>
  ) : null;

  // ─── MODAL TERMINAR ───────────────────────────────────
  const ModalTerminar = () => (
    <IonModal isOpen={showAlertTerminar} onDidDismiss={() => setShowAlertTerminar(false)} initialBreakpoint={0.35} breakpoints={[0, 0.35]}>
      <div style={{ padding: 24, background: card }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: textPrimary, marginBottom: 6 }}>¿Terminar visita?</div>
        <div style={{ fontSize: 13, color: textSecondary, marginBottom: 24 }}>Se cerrará la visita y no podrás agregar más observaciones.</div>
        <button onClick={terminarVisita} style={{ width: '100%', height: 48, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>
          Terminar visita
        </button>
        <button onClick={() => setShowAlertTerminar(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </IonModal>
  );

  // ─── PANTALLA: INICIO ─────────────────────────────────
  if (pantalla === 'inicio') return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#111' : 'transparent' }}>
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Registrar Visita</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: '16px 16px 100px' }}>
          {!visita ? (
            <div style={{ background: card, borderRadius: 16, border: `0.5px solid ${border}`, padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>📋</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 6 }}>Iniciar visita de obra</div>
              <div style={{ fontSize: 13, color: textSecondary, marginBottom: 24 }}>
                Todas las observaciones quedarán agrupadas en un reporte
              </div>
              {/* Selector línea */}
<div style={{ textAlign: 'left', marginBottom: 12 }}>
  <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Línea de producción</div>
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {lineas.map(linea => {
      const lc = lineaConfig[linea];
      const seleccionada = lineaSel === linea;
      return (
        <button
          key={linea}
          onClick={() => { setLineaSel(linea); setProyectoSel(null); }}
          style={{
            background: seleccionada ? `${lc.color}18` : 'transparent',
            border: `0.5px solid ${seleccionada ? lc.color : border}`,
            borderRadius: 20,
            padding: '6px 12px',
            display: 'flex', alignItems: 'center', gap: 6,
            cursor: 'pointer'
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: lc.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: seleccionada ? lc.color : textSecondary, fontWeight: seleccionada ? 600 : 400 }}>{lc.label}</span>
        </button>
      );
    })}
  </div>
</div>

{/* Selector proyecto filtrado por línea */}
{lineaSel && (
  <div style={{ textAlign: 'left', marginBottom: 16 }}>
    <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Proyecto</div>
    <IonSelect
      placeholder="— Seleccionar proyecto —"
      onIonChange={e => setProyectoSel(proyectosFiltrados.find((p: any) => p.id === e.detail.value))}
      style={{ background: inputBg, borderRadius: 10, border: `0.5px solid ${border}`, padding: '10px 12px', color: textPrimary, width: '100%' }}
    >
      {proyectosFiltrados.map((p: any) => (
        <IonSelectOption key={p.id} value={p.id}>{p.nombre}</IonSelectOption>
      ))}
    </IonSelect>
  </div>
)}
              <button
                onClick={iniciarVisita}
                disabled={!proyectoSel || loading}
                style={{ width: '100%', height: 50, borderRadius: 12, background: proyectoSel ? '#1e3a5f' : (dark ? '#1a1a1a' : '#e2e8f0'), border: 'none', color: proyectoSel ? '#fff' : textMuted, fontSize: 15, fontWeight: 600, cursor: proyectoSel ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {loading ? <IonSpinner name="crescent" style={{ color: '#fff' }} /> : '+ Iniciar visita'}
              </button>
            </div>
          ) : (
            <>
              <Banner />
              <div style={{ background: card, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Observación general del proyecto</div>
                <textarea
                  value={obsProyecto}
                  onChange={e => setObsProyecto(e.target.value)}
                  placeholder="Escribe una observación libre..."
                  rows={3}
                  style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '10px 12px', color: textPrimary, fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
                />
                <button
                  onClick={async () => { await guardarObs('proyecto', { observacion: obsProyecto }); setObsProyecto(''); }}
                  disabled={!obsProyecto.trim()}
                  style={{ width: '100%', height: 44, borderRadius: 10, background: obsProyecto.trim() ? 'rgba(59,130,246,0.08)' : 'transparent', border: `0.5px solid ${obsProyecto.trim() ? 'rgba(59,130,246,0.3)' : border}`, color: obsProyecto.trim() ? '#3b82f6' : textMuted, fontSize: 14, fontWeight: 500, cursor: obsProyecto.trim() ? 'pointer' : 'default', marginTop: 10 }}
                >
                  ✓ Guardar observación
                </button>
              </div>
              <button
                onClick={() => setPantalla('torres')}
                style={{ width: '100%', height: 52, borderRadius: 14, background: '#1e3a5f', border: 'none', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
              >
                🏢 Ir a torres →
              </button>
            </>
          )}
        </div>
        <ModalTerminar />
      </IonContent>
    </IonPage>
  );

  // ─── PANTALLA: TORRES ─────────────────────────────────
  if (pantalla === 'torres') return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#111' : 'transparent' }}>
          <button slot="start" onClick={() => setPantalla('inicio')} style={{ background: 'transparent', border: 'none', color: dark ? '#555' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>‹</button>
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Torres · {proyectoSel?.nombre}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: '16px 16px 100px' }}>
          <Banner />

          {/* Calibrador */}
          <div style={{ background: card, borderRadius: 16, border: `1px solid #1e3a5f`, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#4a7ab5', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 6 }}>
              Calibrador de programa
            </div>
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>
              ¿En qué frente está <span style={{ color: textPrimary, fontWeight: 600 }}>Moldaje Monolítico</span> hoy?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={frenteMoldaje}
                onChange={e => setFrenteMoldaje(e.target.value)}
                placeholder="Ej: 2F14 o 2f14"
                style={{ flex: 1, background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '10px 12px', color: textPrimary, fontSize: 14 }}
              />
              <button
                onClick={aplicarMoldaje}
                disabled={!frenteMoldaje.trim()}
                style={{ background: '#1e3a5f', border: 'none', borderRadius: 10, padding: '0 18px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >OK</button>
            </div>
            {resultadoCalculo && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✓</span> Día de obra {resultadoCalculo.diaObra} · Programa calculado
              </div>
            )}
            <div style={{ fontSize: 11, color: textMuted, marginTop: 6 }}>Acepta mayúsculas y minúsculas · opcional</div>
          </div>

          {/* Torres */}
          <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Seleccionar torre</div>
          {torres.map(torre => (
            <div
              key={torre.id}
              onClick={() => seleccionarTorre(torre)}
              style={{ background: card, borderRadius: 14, border: `0.5px solid ${border}`, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : '#eff6ff', border: dark ? '0.5px solid #2a2a2a' : '0.5px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: dark ? '#666' : '#1e3a5f', flexShrink: 0 }}>
                {torre.nombre?.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{torre.nombre}</div>
                <div style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>{torre.frente} · {torre.pisos} pisos</div>
              </div>
              <div style={{ fontSize: 20, color: dark ? '#2a2a2a' : '#bfdbfe' }}>›</div>
            </div>
          ))}
        </div>
        <ModalTerminar />
      </IonContent>
    </IonPage>
  );

  // ─── PANTALLA: TORRE ──────────────────────────────────
  if (pantalla === 'torre') return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#111' : 'transparent' }}>
          <button slot="start" onClick={() => setPantalla('torres')} style={{ background: 'transparent', border: 'none', color: dark ? '#555' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>‹</button>
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>{torreSel?.nombre}</IonTitle>
          {resultadoCalculo && (
            <div slot="end" style={{ marginRight: 14, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#f9fafb' }}>
              {normalizarFrente(frenteMoldaje)}
            </div>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: '12px 12px 100px' }}>
          <Banner />

          {/* Cuadrillas activas */}
          {resultadoCalculo && (
            <div style={{ background: card, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>Cuadrillas activas según programa</div>
              <div style={{ fontSize: 11, color: textSecondary, marginBottom: 12 }}>
                Moldaje en {normalizarFrente(frenteMoldaje)} · Día {resultadoCalculo.diaObra}
              </div>
              {cuadrillasEnTorre().length === 0
                ? <div style={{ fontSize: 13, color: textMuted }}>Sin actividad programada en esta torre</div>
                : cuadrillasEnTorre().map((pos, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: idx < cuadrillasEnTorre().length - 1 ? `0.5px solid ${border}` : 'none' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{pos.cuadrilla}</div>
                      <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>{pos.actividad} · {pos.frente}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {/* Deptos */}
          <div style={{ background: card, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>Departamentos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {deptos.map(depto => (
                <div
                  key={depto.id}
                  onClick={() => { setDeptoSel(depto); setPantalla('depto'); }}
                  style={{ background: dark ? '#1a1a1a' : '#f8fafc', border: `0.5px solid ${border}`, borderRadius: 8, padding: '7px 11px', fontSize: 12, color: textPrimary, cursor: 'pointer', fontWeight: 500 }}
                >
                  {depto.numero || depto.id_obra}
                </div>
              ))}
            </div>
          </div>

          {/* Obs torre */}
          <div style={{ background: card, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Observación de torre</div>
            <textarea
              value={obsTorre}
              onChange={e => setObsTorre(e.target.value)}
              placeholder="Observación libre de la torre..."
              rows={3}
              style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '10px 12px', color: textPrimary, fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
            />
            <button
              onClick={async () => { await guardarObs('torre', { torre_id: torreSel?.id, observacion: obsTorre }); setObsTorre(''); }}
              disabled={!obsTorre.trim()}
              style={{ width: '100%', height: 44, borderRadius: 10, background: obsTorre.trim() ? 'rgba(59,130,246,0.08)' : 'transparent', border: `0.5px solid ${obsTorre.trim() ? 'rgba(59,130,246,0.3)' : border}`, color: obsTorre.trim() ? '#3b82f6' : textMuted, fontSize: 14, fontWeight: 500, cursor: obsTorre.trim() ? 'pointer' : 'default', marginTop: 10 }}
            >
              ✓ Guardar observación
            </button>
          </div>
        </div>
        <ModalTerminar />
      </IonContent>
    </IonPage>
  );

  // ─── PANTALLA: DEPTO ──────────────────────────────────
  if (pantalla === 'depto') {
    const info = infoDepto();
    const cuadrillaRealObj = actividades.find(a => a.cuadrilla === cuadrillaReal);
    const actTeoricaObj = actividades.find(a => a.actividad === info?.actual?.actividad);
    const desfase = cuadrillaRealObj && actTeoricaObj ? actTeoricaObj.dia_inicio - cuadrillaRealObj.dia_inicio : null;
    const coincide = cuadrillaReal && info?.actual && cuadrillaReal === info.actual.cuadrilla;

    return (
      <IonPage>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#111' : 'transparent' }}>
            <button slot="start" onClick={() => setPantalla('torre')} style={{ background: 'transparent', border: 'none', color: dark ? '#555' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>‹</button>
            <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>
              {deptoSel?.id_obra || deptoSel?.numero} · {torreSel?.nombre}
            </IonTitle>
            <div slot="end" style={{ marginRight: 14, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#f9fafb' }}>
              Piso {deptoSel?.piso}
            </div>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg }}>
          <div style={{ padding: '12px 12px 100px' }}>
            <Banner />

            {/* Info depto */}
            <div style={{ background: card, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { label: 'Frente', value: deptoSel?.frente_depto },
                  { label: 'Piso', value: deptoSel?.piso },
                  { label: 'Id obra', value: deptoSel?.id_obra },
                ].map(item => (
                  <div key={item.label} style={{ flex: 1, background: dark ? '#1a1a1a' : '#f8fafc', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: textMuted, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>{item.value ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actividad teórica */}
            {info?.actual && (
              <div style={{ background: card, borderRadius: 16, border: `1px solid #1e3a5f`, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#4a7ab5', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 10 }}>
                  Actividad teórica según programa
                </div>
                {/* Actual */}
                <div style={{ background: '#1e3a5f', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>Actividad actual · hoy</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{info.actual.actividad}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{info.actual.cuadrilla}</div>
                </div>
                {/* Antes */}
                {info.antes.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    {info.antes.map((a, i) => (
                      <div key={i} style={{ flex: 1, background: dark ? 'rgba(30,58,95,0.15)' : 'rgba(30,58,95,0.06)', borderRadius: 10, padding: '8px 10px', border: `0.5px solid rgba(30,58,95,0.2)` }}>
                        <div style={{ fontSize: 9, color: '#4a7ab5', marginBottom: 3 }}>Hace {info.antes.length - i} día{info.antes.length - i > 1 ? 's' : ''}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>{a.actividad}</div>
                        <div style={{ fontSize: 10, color: textSecondary, marginTop: 1 }}>{a.cuadrilla}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Después */}
                {info.despues.length > 0 && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {info.despues.map((a, i) => (
                      <div key={i} style={{ flex: 1, background: 'transparent', borderRadius: 10, padding: '8px 10px', border: `0.5px dashed rgba(30,58,95,0.25)` }}>
                        <div style={{ fontSize: 9, color: '#4a7ab5', marginBottom: 3 }}>En {i + 1} día{i > 0 ? 's' : ''}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>{a.actividad}</div>
                        <div style={{ fontSize: 10, color: textSecondary, marginTop: 1 }}>{a.cuadrilla}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cuadrilla real */}
            <div style={{ background: card, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
                ¿Qué cuadrilla está realmente aquí?
              </div>
              <IonSelect
                placeholder="— Seleccionar cuadrilla —"
                value={cuadrillaReal}
                onIonChange={e => setCuadrillaReal(e.detail.value)}
                style={{ background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '10px 12px', color: textPrimary, width: '100%', marginBottom: 10 }}
              >
                {Object.entries(cuadrillasAgrupadas).map(([cuadrilla, acts]) => (
                  <IonSelectOption key={cuadrilla} value={cuadrilla}>
                    {cuadrilla} ({(acts as any[]).length} act.)
                  </IonSelectOption>
                ))}
              </IonSelect>

              {cuadrillaReal && info?.actual && (
                coincide ? (
                  <div style={{ background: dark ? 'rgba(74,222,128,0.08)' : 'rgba(34,197,94,0.06)', border: '0.5px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: dark ? '#4ade80' : '#16a34a' }}>Coincide con el programa</div>
                      <div style={{ fontSize: 11, color: dark ? '#4ade80' : '#16a34a', opacity: 0.7 }}>Sin atraso ni adelanto</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: dark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444' }}>
                        {desfase !== null
                          ? desfase < 0
                            ? `Atraso de ${Math.abs(desfase)} día${Math.abs(desfase) > 1 ? 's' : ''}`
                            : `Adelanto de ${desfase} día${desfase > 1 ? 's' : ''}`
                          : 'Diferencia detectada'}
                      </div>
                      <div style={{ fontSize: 11, color: '#ef4444', opacity: 0.7 }}>
                        Real: {cuadrillaReal} · Teórico: {info.actual.cuadrilla}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Obs depto */}
            <div style={{ background: card, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Observaciones del departamento</div>
              <textarea
                value={obsDepto}
                onChange={e => setObsDepto(e.target.value)}
                placeholder="Observación libre..."
                rows={3}
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${border}`, borderRadius: 10, padding: '10px 12px', color: textPrimary, fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
              />
              <button
                onClick={guardarObsDepto}
                style={{ width: '100%', height: 44, borderRadius: 10, background: 'rgba(59,130,246,0.08)', border: '0.5px solid rgba(59,130,246,0.3)', color: '#3b82f6', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 10 }}
              >
                ✓ Guardar y volver
              </button>
            </div>
          </div>
          <ModalTerminar />
        </IonContent>
      </IonPage>
    );
  }

  return null;
};

export default VisitaObra;
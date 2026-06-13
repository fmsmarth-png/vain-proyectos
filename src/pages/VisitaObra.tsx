import {
  IonContent, IonPage, IonHeader, IonToolbar, IonTitle,
  IonSpinner, IonModal, IonSelect, IonSelectOption
} from '@ionic/react';
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { generarPDFVisita } from '../utils/pdfVisita';
import { lineaConfig, lineas } from '../utils/lineas';
import { useTheme } from '../Context/ThemeContext';
import {
  Actividad, calcularPosiciones, posicionesPorTorre,
  actividadTeoricaDepto, normalizarFrente, parsearFrentesTorre,
  agruparPorCuadrilla, PosicionConContexto
} from '../utils/programaCalc';

// ─── Helpers de orden ─────────────────────────────────────────────────────────

const primerNumeroFrente = (frente: string): number => {
  const match = frente?.match(/\d+/);
  return match ? parseInt(match[0]) : Infinity;
};
const sortTorresPorFrente = (arr: any[]) =>
  [...arr].sort((a, b) => primerNumeroFrente(a.frente) - primerNumeroFrente(b.frente));
const sortTorresPorNombre = (arr: any[]) =>
  [...arr].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
const sortDeptosPorIdObra = (arr: any[]) =>
  [...arr].sort((a, b) => (a.id_obra ?? '').localeCompare(b.id_obra ?? '', 'es', { numeric: true }));
const sortDeptosPorNumero = (arr: any[]) =>
  [...arr].sort((a, b) => (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0));

// ─── Helper de programa ───────────────────────────────────────────────────────

const encontrarDiaEnFrente = (
  mapaDias: Record<string, string> | undefined,
  frenteDepto: string
): number | null => {
  if (!mapaDias) return null;
  const frenteNorm = normalizarFrente(frenteDepto);
  for (const [dia, frente] of Object.entries(mapaDias)) {
    if (normalizarFrente(String(frente)) === frenteNorm) return parseInt(dia);
  }
  return null;
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FotoLocal {
  file: File;
  preview: string;
  subida?: boolean;
  url?: string;
}

type TipoBadge = 'coincide' | 'atraso' | 'adelanto' | 'sin_teorico';
interface InfoBadge {
  tipo: TipoBadge;
  titulo: string;
  subtitulo: string;
  desfaseDias: number | null;
}

// ─── Hook useFotos ────────────────────────────────────────────────────────────

const useFotos = () => {
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  const agregarFoto = useCallback((file: File) => {
    setFotos(prev => [...prev, { file, preview: URL.createObjectURL(file), subida: false }]);
  }, []);

  const eliminarFoto = useCallback((idx: number) => {
    setFotos(prev => { URL.revokeObjectURL(prev[idx].preview); return prev.filter((_, i) => i !== idx); });
  }, []);

  const subirFotos = useCallback(async (visitaId: string, nivel: string): Promise<string[]> => {
    if (fotos.length === 0) return [];
    setSubiendo(true);
    const urls: string[] = [];
    for (let i = 0; i < fotos.length; i++) {
      const f = fotos[i];
      if (f.subida && f.url) { urls.push(f.url); continue; }
      const ext = f.file.name.split('.').pop() ?? 'jpg';
      const nombre = `visitas/${visitaId}/${nivel}_${Date.now()}_${i}.${ext}`;
      const { error } = await supabase.storage.from('fotos-registros').upload(nombre, f.file, { upsert: true });
      if (!error) {
        const { data: pub } = supabase.storage.from('fotos-registros').getPublicUrl(nombre);
        if (pub?.publicUrl) {
          urls.push(pub.publicUrl);
          setFotos(prev => prev.map((pf, idx) => idx === i ? { ...pf, subida: true, url: pub.publicUrl } : pf));
        }
      }
    }
    setSubiendo(false);
    return urls;
  }, [fotos]);

  const resetFotos = useCallback(() => {
    setFotos(prev => { prev.forEach(f => URL.revokeObjectURL(f.preview)); return []; });
  }, []);

  return { fotos, agregarFoto, eliminarFoto, subirFotos, subiendo, resetFotos };
};

// ─── Componente FotosPreview ──────────────────────────────────────────────────

interface FotosPreviewProps {
  fotos: FotoLocal[];
  onAgregar: (file: File) => void;
  onEliminar: (idx: number) => void;
  subiendo?: boolean;
  dark: boolean;
  border: string;
  textMuted: string;
}

const FotosPreview: React.FC<FotosPreviewProps> = ({ fotos, onAgregar, onEliminar, subiendo, dark, border, textMuted }) => {
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div style={{ marginTop: 10 }}>
      {fotos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 10, scrollbarWidth: 'none' }}>
          {fotos.map((f, idx) => (
            <div key={idx} style={{ position: 'relative', flexShrink: 0, width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: `0.5px solid ${border}`, cursor: 'pointer' }}>
              <img src={f.preview} alt={`Foto ${idx + 1}`} onClick={() => setFotoAmpliada(f.preview)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {!f.subida && subiendo && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IonSpinner name="crescent" style={{ color: '#fff', width: 20, height: 20 }} />
                </div>
              )}
              {f.subida && (
                <div style={{ position: 'absolute', bottom: 3, right: 3, background: '#4ade80', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#000', fontWeight: 700 }}>✓</div>
              )}
              <button onClick={e => { e.stopPropagation(); onEliminar(idx); }} style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 20, height: 20, color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        onChange={e => { const file = e.target.files?.[0]; if (file) onAgregar(file); if (inputRef.current) inputRef.current.value = ''; }}
        style={{ display: 'none' }} />
      <label onClick={() => inputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 40, borderRadius: 10, background: 'transparent', border: `0.5px dashed ${dark ? '#2a2a2a' : '#cbd5e1'}`, color: textMuted, fontSize: 13, cursor: 'pointer' }}>
        <span style={{ fontSize: 16 }}>📷</span>
        {fotos.length === 0 ? 'Agregar foto' : `Agregar otra foto (${fotos.length})`}
      </label>
      <IonModal isOpen={!!fotoAmpliada} onDidDismiss={() => setFotoAmpliada(null)}>
        <div onClick={() => setFotoAmpliada(null)} style={{ background: '#000', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {fotoAmpliada && <img src={fotoAmpliada} alt="Vista ampliada" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
          <button onClick={() => setFotoAmpliada(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20, color: '#fff', fontSize: 16, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      </IonModal>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const VisitaObra: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  // ── Tokens de diseño — idénticos al resto de la app ──────────────────────
  const bg            = dark ? '#000000' : '#f0f4f8';
  const card          = dark ? '#0e0e0e'  : '#ffffff';
  const cardGrad      = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#444444' : '#94a3b8';
  const toolbar       = dark ? '#000000' : '#1e3a5f';
  const inputBg       = dark ? '#111111' : '#ffffff';
  const inputBorder   = dark ? '#1e1e1e' : '#cbd5e1';
  const sepLine       = dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';

  const labelStyle = { fontSize: 9, color: textMuted, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };

  const [visita, setVisita]                     = useState<any>(null);
  const [loading, setLoading]                   = useState(false);
  const [proyectos, setProyectos]               = useState<any[]>([]);
  const [proyectoSel, setProyectoSel]           = useState<any>(null);
  const [torres, setTorres]                     = useState<any[]>([]);
  const [torreSel, setTorreSel]                 = useState<any>(null);
  const [deptos, setDeptos]                     = useState<any[]>([]);
  const [deptoSel, setDeptoSel]                 = useState<any>(null);
  const [actividades, setActividades]           = useState<Actividad[]>([]);
  const [frenteMoldaje, setFrenteMoldaje]       = useState('');
  const [resultadoCalculo, setResultadoCalculo] = useState<any>(null);
  const [obsProyecto, setObsProyecto]           = useState('');
  const [obsTorre, setObsTorre]                 = useState('');
  const [obsDepto, setObsDepto]                 = useState('');
  const [actividadReal, setActividadReal]       = useState('');
  const [pantalla, setPantalla]                 = useState<'inicio'|'torres'|'torre'|'depto'>('inicio');
  const [showAlertTerminar, setShowAlertTerminar] = useState(false);
  const [generandoPDF, setGenerandoPDF]         = useState(false);
  const [showActividadSheet, setShowActividadSheet] = useState(false);
  const [usuario, setUsuario]                   = useState<any>(null);
  const [lineaSel, setLineaSel]                 = useState<string>('');
  const [ordenTorres, setOrdenTorres]           = useState<'nombre'|'frente'>('frente');

  const fotosProyecto = useFotos();
  const fotosTorre    = useFotos();
  const fotosDepto    = useFotos();

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
    const { data: programa } = await supabase.from('programas_obra').select('id').eq('activo', true).maybeSingle();
    if (!programa) return;
    const { data } = await supabase.from('programa_actividades').select('*').eq('programa_id', programa.id).eq('activo', true).order('orden');
    setActividades(data || []);
  };

  const iniciarVisita = async () => {
    if (!proyectoSel) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from('visitas_obra').insert({ proyecto_id: proyectoSel.id, creado_por: user?.id, estado: 'activa' }).select().single();
    setVisita(data);
    const { data: t } = await supabase.from('torres').select('*').eq('proyecto_id', proyectoSel.id).order('nombre');
    setTorres(t || []);
    setLoading(false);
    setPantalla('inicio');
  };

  const guardarObs = async (nivel: string, extra: any = {}) => {
    if (!visita) return;
    await supabase.from('visita_observaciones').insert({ visita_id: visita.id, nivel, ...extra });
  };

  const aplicarMoldaje = () => {
    if (!frenteMoldaje || actividades.length === 0) return;
    const f = normalizarFrente(frenteMoldaje);
    const resultado = calcularPosiciones(f, actividades);
    setResultadoCalculo(resultado);
    if (resultado && visita) supabase.from('visitas_obra').update({ frente_moldaje: f }).eq('id', visita.id);
  };

  const seleccionarTorre = async (torre: any) => {
    setTorreSel(torre);
    const { data } = await supabase.from('departamentos').select('*').eq('torre_id', torre.id).order('id_obra');
    setDeptos(data || []);
    setPantalla('torre');
  };

  const terminarVisita = async () => {
    if (!visita) return;
    setShowAlertTerminar(false);
    setGenerandoPDF(true);
    await supabase.from('visitas_obra').update({ estado: 'terminada', terminada_en: new Date().toISOString() }).eq('id', visita.id);
    try {
      await generarPDFVisita(visita.id, proyectoSel?.nombre ?? 'Proyecto', resultadoCalculo ? frenteMoldaje : undefined);
    } catch (e) { console.error('Error generando PDF:', e); }
    setGenerandoPDF(false);
    setVisita(null); setPantalla('inicio'); setProyectoSel(null);
    setTorreSel(null); setDeptoSel(null); setFrenteMoldaje(''); setResultadoCalculo(null);
  };

  const cuadrillasEnTorre = () => {
    if (!resultadoCalculo || !torreSel) return [];
    return posicionesPorTorre(resultadoCalculo.posiciones, parsearFrentesTorre(torreSel.frente || ''));
  };

  const infoDepto = () => {
    if (!resultadoCalculo || !deptoSel?.frente_depto) return null;
    return actividadTeoricaDepto(deptoSel.frente_depto, actividades, resultadoCalculo.diaObra);
  };

  const calcularBadge = (actReal: string, actual: PosicionConContexto | null, frenteDepto: string | undefined, diaObra: number | undefined): InfoBadge | null => {
    if (!actReal) return null;
    const actRealObj = actividades.find(a => a.actividad === actReal);
    if (actual && actReal === actual.actividad) return { tipo: 'coincide', titulo: 'Coincide con el programa', subtitulo: 'Sin atraso ni adelanto', desfaseDias: 0 };
    if (actual && actReal !== actual.actividad && frenteDepto) {
      const diaRealEnFrente = encontrarDiaEnFrente(actRealObj?.mapa_dias, frenteDepto);
      const diaTeoEnFrente  = actual.diaEnFrente;
      if (diaRealEnFrente !== null && diaTeoEnFrente !== null) {
        const diff = diaRealEnFrente - diaTeoEnFrente;
        if (diff === 0) return { tipo: 'coincide', titulo: 'En programa', subtitulo: `Real: ${actReal} · Teórico: ${actual.actividad}`, desfaseDias: 0 };
        return { tipo: diff < 0 ? 'atraso' : 'adelanto', titulo: diff < 0 ? `Atraso de ${Math.abs(diff)} día${Math.abs(diff) > 1 ? 's' : ''}` : `Adelanto de ${diff} día${diff > 1 ? 's' : ''}`, subtitulo: `Real: ${actReal} · Teórico: ${actual.actividad}`, desfaseDias: diff };
      }
    }
    if (!actual && frenteDepto && diaObra !== undefined) {
      const diaTeoricoEnFrente = encontrarDiaEnFrente(actRealObj?.mapa_dias, frenteDepto);
      if (diaTeoricoEnFrente !== null) {
        const diff = diaObra - diaTeoricoEnFrente;
        if (diff === 0) return { tipo: 'coincide', titulo: 'En programa', subtitulo: `${actReal} en frente ${frenteDepto} según programa`, desfaseDias: 0 };
        return { tipo: diff > 0 ? 'atraso' : 'adelanto', titulo: diff > 0 ? `Adelanto de ${diff} día${diff > 1 ? 's' : ''}` : `Atraso de ${Math.abs(diff)} día${Math.abs(diff) > 1 ? 's' : ''}`, subtitulo: `Día actual: ${diaObra} · Día teórico en frente: ${diaTeoricoEnFrente}`, desfaseDias: diff };
      }
      return { tipo: 'sin_teorico', titulo: 'Sin datos teóricos para este frente', subtitulo: `${actReal} no tiene programa definido en ${frenteDepto}`, desfaseDias: null };
    }
    return { tipo: 'sin_teorico', titulo: 'Sin datos teóricos para comparar', subtitulo: actual ? `Real: ${actReal} · Teórico: ${actual.actividad}` : `${actReal} no tiene programa definido para este frente`, desfaseDias: null };
  };

  const guardarObsProyecto = async () => {
    if (!obsProyecto.trim() && fotosProyecto.fotos.length === 0) return;
    const urls = await fotosProyecto.subirFotos(visita.id, 'proyecto');
    await guardarObs('proyecto', { observacion: obsProyecto || null, fotos_urls: urls });
    setObsProyecto(''); fotosProyecto.resetFotos();
  };

  const guardarObsTorre = async () => {
    if (!obsTorre.trim() && fotosTorre.fotos.length === 0) return;
    const urls = await fotosTorre.subirFotos(visita.id, 'torre');
    await guardarObs('torre', { torre_id: torreSel?.id, observacion: obsTorre || null, fotos_urls: urls });
    setObsTorre(''); fotosTorre.resetFotos();
  };

  const guardarObsDepto = async () => {
    const info   = infoDepto() ?? { actual: null, antes: [], despues: [] };
    const actual = info.actual;
    const badge  = calcularBadge(actividadReal, actual, deptoSel?.frente_depto, resultadoCalculo?.diaObra);
    const urls   = await fotosDepto.subirFotos(visita.id, 'depto');
    await guardarObs('departamento', {
      torre_id: torreSel?.id, departamento_id: deptoSel?.id,
      observacion: obsDepto || null, frente_depto: deptoSel?.frente_depto,
      actividad_teorica: actual?.actividad ?? null, cuadrilla_teorica: actual?.cuadrilla ?? null,
      actividad_real: actividadReal || null, desfase_dias: badge?.desfaseDias ?? null, fotos_urls: urls,
    });
    setObsDepto(''); setActividadReal(''); fotosDepto.resetFotos(); setPantalla('torre');
  };

  const cuadrillasAgrupadas = agruparPorCuadrilla(actividades);
  const proyectosFiltrados  = lineaSel ? proyectos.filter(p => p.linea === lineaSel) : [];
  const torresOrdenadas     = ordenTorres === 'frente' ? sortTorresPorFrente(torres) : sortTorresPorNombre(torres);

  // ─── Sub-componentes internos ─────────────────────────────────────────────

  const SortToggle = ({ opcionA, opcionB, valor, onChange, labelA, labelB }: { opcionA: string; opcionB: string; valor: string; onChange: (v: any) => void; labelA: string; labelB: string }) => (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {[{ key: opcionA, label: labelA }, { key: opcionB, label: labelB }].map(opt => {
        const activo = valor === opt.key;
        return (
          <button key={opt.key} onClick={() => onChange(opt.key)} style={{ flex: 1, height: 34, borderRadius: 10, background: activo ? (dark ? '#1a1a1a' : '#1e3a5f') : 'transparent', border: `0.5px solid ${activo ? (dark ? '#2a2a2a' : '#1e3a5f') : border}`, color: activo ? '#fff' : textMuted, fontSize: 11, fontWeight: activo ? 600 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <span style={{ fontSize: 10 }}>{activo ? '↑' : '↕'}</span>{opt.label}
          </button>
        );
      })}
    </div>
  );

  // Banner — estilo consistente con el resto de la app
  const Banner = () => visita ? (
    <div style={{ background: dark ? 'linear-gradient(135deg, #0a1628, #0e1f3d)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', borderRadius: 14, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, border: dark ? '0.5px solid rgba(30,58,95,0.4)' : 'none' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ color: '#f9fafb', fontSize: 13, fontWeight: 600 }}>Visita activa · {proyectoSel?.nombre}</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
          {new Date(visita.iniciada_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          {resultadoCalculo ? ` · Moldaje: ${normalizarFrente(frenteMoldaje)}` : ''}
        </div>
      </div>
      <button onClick={() => setShowAlertTerminar(true)} style={{ background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 12px', color: '#f9fafb', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Terminar</button>
    </div>
  ) : null;

  const ModalTerminar = () => (
    <>
      <IonModal isOpen={showAlertTerminar} onDidDismiss={() => setShowAlertTerminar(false)} initialBreakpoint={0.42} breakpoints={[0, 0.42]}>
        <div style={{ padding: 24, background: card }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 6 }}>¿Terminar visita?</div>
          <div style={{ fontSize: 13, color: textSecondary, marginBottom: 8 }}>Se cerrará la visita y se generará un PDF con todas las observaciones y fotos.</div>
          <div style={{ fontSize: 12, color: textMuted, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📄</span> El PDF se abrirá para compartir por WhatsApp, email u otras apps.
          </div>
          <button onClick={terminarVisita} style={{ width: '100%', height: 48, borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>Terminar y generar PDF</button>
          <button onClick={() => setShowAlertTerminar(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
        </div>
      </IonModal>
      <IonModal isOpen={generandoPDF} backdropDismiss={false}>
        <div style={{ background: card, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <IonSpinner name="crescent" style={{ width: 48, height: 48, color: '#1e3a5f' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: textPrimary, marginBottom: 6 }}>Generando PDF</div>
            <div style={{ fontSize: 13, color: textSecondary }}>Descargando fotos y armando el reporte...</div>
            <div style={{ fontSize: 11, color: textMuted, marginTop: 8 }}>Esto puede tardar unos segundos</div>
          </div>
        </div>
      </IonModal>
    </>
  );

  // ─── PANTALLA: INICIO ─────────────────────────────────────────────────────
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
            <>
              {/* Selector de línea */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ ...labelStyle, marginBottom: 10 }}>Línea de producción</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {lineas.map(linea => {
                    const lc = lineaConfig[linea];
                    const sel = lineaSel === linea;
                    return (
                      <button key={linea} onClick={() => { setLineaSel(linea); setProyectoSel(null); }} style={{ background: sel ? `${lc.color}18` : 'transparent', border: `0.5px solid ${sel ? lc.color : border}`, borderRadius: 20, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: lc.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: sel ? lc.color : textSecondary, fontWeight: sel ? 600 : 400 }}>{lc.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selector de proyecto */}
              {lineaSel && (
                <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
                  <div style={{ ...labelStyle, marginBottom: 8 }}>Proyecto</div>
                  <IonSelect
                    placeholder="— Seleccionar proyecto —"
                    onIonChange={e => setProyectoSel(proyectosFiltrados.find((p: any) => p.id === e.detail.value))}
                    style={{ background: inputBg, borderRadius: 10, border: `0.5px solid ${inputBorder}`, padding: '10px 12px', color: textPrimary, width: '100%', fontSize: 14 }}
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
                style={{ width: '100%', height: 48, borderRadius: 12, background: proyectoSel ? 'linear-gradient(135deg, #1e3a5f, #2563eb)' : (dark ? '#111' : '#e2e8f0'), border: 'none', color: proyectoSel ? '#fff' : textMuted, fontSize: 15, fontWeight: 700, cursor: proyectoSel ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {loading ? <IonSpinner name="crescent" style={{ color: '#fff' }} /> : '+ Iniciar visita'}
              </button>
            </>
          ) : (
            <>
              <Banner />

              {/* Obs proyecto */}
              <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
                <div style={{ ...labelStyle, marginBottom: 10 }}>Observación general del proyecto</div>
                <textarea value={obsProyecto} onChange={e => setObsProyecto(e.target.value)} placeholder="Escribe una observación libre..." rows={3}
                  style={{ width: '100%', background: inputBg, border: `0.5px solid ${inputBorder}`, borderRadius: 10, padding: '10px 12px', color: textPrimary, fontSize: 14, resize: 'none', boxSizing: 'border-box' }} />
                <FotosPreview fotos={fotosProyecto.fotos} onAgregar={fotosProyecto.agregarFoto} onEliminar={fotosProyecto.eliminarFoto} subiendo={fotosProyecto.subiendo} dark={dark} border={border} textMuted={textMuted} />
                <button onClick={guardarObsProyecto} disabled={!obsProyecto.trim() && fotosProyecto.fotos.length === 0}
                  style={{ width: '100%', height: 44, borderRadius: 10, marginTop: 10, background: (obsProyecto.trim() || fotosProyecto.fotos.length > 0) ? 'rgba(59,130,246,0.08)' : 'transparent', border: `0.5px solid ${(obsProyecto.trim() || fotosProyecto.fotos.length > 0) ? 'rgba(59,130,246,0.3)' : border}`, color: (obsProyecto.trim() || fotosProyecto.fotos.length > 0) ? '#3b82f6' : textMuted, fontSize: 14, fontWeight: 500, cursor: (obsProyecto.trim() || fotosProyecto.fotos.length > 0) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {fotosProyecto.subiendo ? <><IonSpinner name="crescent" style={{ width: 16, height: 16 }} /> Subiendo fotos...</> : '✓ Guardar observación'}
                </button>
              </div>

              <button onClick={() => setPantalla('torres')} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                🏢 Ir a torres →
              </button>
            </>
          )}
        </div>
        <ModalTerminar />
      </IonContent>
    </IonPage>
  );

  // ─── PANTALLA: TORRES ─────────────────────────────────────────────────────
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
          <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${dark ? 'rgba(30,58,95,0.5)' : '#bfdbfe'}`, padding: 16, marginBottom: 14 }}>
            <div style={{ ...labelStyle, color: dark ? '#4a7ab5' : '#1d4ed8', marginBottom: 6 }}>Calibrador de programa</div>
            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>
              ¿En qué frente está <span style={{ color: textPrimary, fontWeight: 600 }}>Moldaje Monolítico</span> hoy?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={frenteMoldaje} onChange={e => setFrenteMoldaje(e.target.value)} placeholder="Ej: 2F14"
                style={{ flex: 1, background: inputBg, border: `0.5px solid ${inputBorder}`, borderRadius: 10, padding: '10px 12px', color: textPrimary, fontSize: 14 }} />
              <button onClick={aplicarMoldaje} disabled={!frenteMoldaje.trim()} style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', borderRadius: 10, padding: '0 18px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: frenteMoldaje.trim() ? 'pointer' : 'default' }}>OK</button>
            </div>
            {resultadoCalculo && (
              <div style={{ marginTop: 10, fontSize: 12, color: dark ? '#4ade80' : '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#15803d' }} />
                Día de obra {resultadoCalculo.diaObra} · Programa calculado
              </div>
            )}
            <div style={{ fontSize: 11, color: textMuted, marginTop: 6 }}>Acepta mayúsculas y minúsculas · opcional</div>
          </div>

          {/* Lista torres */}
          <div style={{ height: '0.5px', background: sepLine, marginBottom: 14 }} />
          <div style={{ ...labelStyle, marginBottom: 10 }}>Torres</div>
          <SortToggle opcionA="frente" opcionB="nombre" valor={ordenTorres} onChange={setOrdenTorres} labelA="Por frente (F1→F28)" labelB="Por letra (A→Z)" />

          {torresOrdenadas.map(torre => (
            <div key={torre.id} onClick={() => seleccionarTorre(torre)} style={{ background: cardGrad, borderRadius: 14, border: `0.5px solid ${border}`, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: dark ? '0.5px solid #2a2a2a' : '0.5px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: dark ? '#666' : '#1e3a5f', flexShrink: 0 }}>
                {torre.nombre?.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>{torre.nombre}</div>
                <div style={{ fontSize: 12, color: textSecondary, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ background: dark ? 'rgba(30,58,95,0.4)' : 'rgba(30,58,95,0.08)', border: `0.5px solid ${dark ? 'rgba(30,58,95,0.6)' : 'rgba(30,58,95,0.2)'}`, borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 600, color: dark ? '#4a7ab5' : '#1e3a5f' }}>{torre.frente}</span>
                  {torre.pisos} pisos
                </div>
              </div>
              <div style={{ fontSize: 20, color: dark ? '#2a2a2a' : '#bfdbfe' }}>›</div>
            </div>
          ))}
        </div>
        <ModalTerminar />
      </IonContent>
    </IonPage>
  );

  // ─── PANTALLA: TORRE ──────────────────────────────────────────────────────
  if (pantalla === 'torre') return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#111' : 'transparent' }}>
          <button slot="start" onClick={() => setPantalla('torres')} style={{ background: 'transparent', border: 'none', color: dark ? '#555' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>‹</button>
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>
            {torreSel?.nombre}
            <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.6, marginLeft: 6 }}>· {torreSel?.frente}</span>
          </IonTitle>
          {resultadoCalculo && (
            <div slot="end" style={{ marginRight: 14, background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#f9fafb', fontWeight: 600 }}>
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
            <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
              <div style={{ ...labelStyle, marginBottom: 4 }}>Cuadrillas activas según programa</div>
              <div style={{ fontSize: 11, color: textSecondary, marginBottom: 12 }}>Moldaje en {normalizarFrente(frenteMoldaje)} · Día {resultadoCalculo.diaObra}</div>
              {cuadrillasEnTorre().length === 0
                ? <div style={{ fontSize: 13, color: textMuted }}>Sin actividad programada en esta torre</div>
                : cuadrillasEnTorre().map((pos, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: idx < cuadrillasEnTorre().length - 1 ? `0.5px solid ${border}` : 'none' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{pos.cuadrilla}</div>
                      <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>{pos.actividad} · {pos.frente}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {/* Departamentos agrupados por piso */}
          <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
            <div style={{ ...labelStyle, marginBottom: 14 }}>Departamentos</div>
            {(() => {
              // Agrupar por piso, orden por id_obra dentro de cada frente
              const porPiso: Record<number, any[]> = {};
              [...deptos]
                .sort((a, b) => (a.id_obra ?? '').localeCompare(b.id_obra ?? '', 'es', { numeric: true }))
                .forEach(d => {
                  const piso = d.piso ?? 0;
                  if (!porPiso[piso]) porPiso[piso] = [];
                  porPiso[piso].push(d);
                });
              return Object.keys(porPiso)
                .sort((a, b) => parseInt(a) - parseInt(b))
                .map(pisoKey => {
                  const piso = parseInt(pisoKey);
                  const deptosDelPiso = porPiso[piso];
                  // Agrupar de a 2 por frente_depto
                  const porFrente: Record<string, any[]> = {};
                  deptosDelPiso.forEach(d => {
                    const f = d.frente_depto ?? 'sin_frente';
                    if (!porFrente[f]) porFrente[f] = [];
                    porFrente[f].push(d);
                  });
                  return (
                    <div key={piso} style={{ marginBottom: 16 }}>
                      {/* Encabezado de piso */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: dark ? '#4a7ab5' : '#1e3a5f' }}>
                          Piso {piso === 0 ? '—' : piso}
                        </div>
                        <div style={{ flex: 1, height: '0.5px', background: dark ? '#1e1e1e' : '#e2e8f0' }} />
                      </div>
                      {/* Grid de frentes */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {Object.keys(porFrente)
                          .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
                          .map(frente => (
                            <div key={frente} style={{ display: 'flex', gap: 6 }}>
                              {porFrente[frente].map(depto => (
                                <div
                                  key={depto.id}
                                  onClick={() => { setDeptoSel(depto); setPantalla('depto'); }}
                                  style={{
                                    background: dark ? 'linear-gradient(135deg, #111, #181818)' : '#f8fafc',
                                    border: `0.5px solid ${border}`,
                                    borderRadius: 12, padding: '10px 12px',
                                    cursor: 'pointer', minWidth: 64,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                  }}
                                >
                                  {/* Id obra — mismo peso que número */}
                                  <span style={{
                                    fontSize: 13, fontWeight: 700,
                                    color: dark ? '#4a7ab5' : '#1e3a5f',
                                    lineHeight: 1,
                                  }}>
                                    {depto.id_obra ?? '—'}
                                  </span>
                                  {/* Separador */}
                                  <div style={{ width: '100%', height: '0.5px', background: dark ? '#222' : '#e2e8f0' }} />
                                  {/* Número depto */}
                                  <span style={{
                                    fontSize: 13, fontWeight: 700,
                                    color: textPrimary, lineHeight: 1,
                                  }}>
                                    {depto.numero ?? '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                });
            })()}
          </div>

          {/* Obs torre */}
          <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Observación de torre</div>
            <textarea value={obsTorre} onChange={e => setObsTorre(e.target.value)} placeholder="Observación libre de la torre..." rows={3}
              style={{ width: '100%', background: inputBg, border: `0.5px solid ${inputBorder}`, borderRadius: 10, padding: '10px 12px', color: textPrimary, fontSize: 14, resize: 'none', boxSizing: 'border-box' }} />
            <FotosPreview fotos={fotosTorre.fotos} onAgregar={fotosTorre.agregarFoto} onEliminar={fotosTorre.eliminarFoto} subiendo={fotosTorre.subiendo} dark={dark} border={border} textMuted={textMuted} />
            <button onClick={guardarObsTorre} disabled={!obsTorre.trim() && fotosTorre.fotos.length === 0}
              style={{ width: '100%', height: 44, borderRadius: 10, marginTop: 10, background: (obsTorre.trim() || fotosTorre.fotos.length > 0) ? 'rgba(59,130,246,0.08)' : 'transparent', border: `0.5px solid ${(obsTorre.trim() || fotosTorre.fotos.length > 0) ? 'rgba(59,130,246,0.3)' : border}`, color: (obsTorre.trim() || fotosTorre.fotos.length > 0) ? '#3b82f6' : textMuted, fontSize: 14, fontWeight: 500, cursor: (obsTorre.trim() || fotosTorre.fotos.length > 0) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {fotosTorre.subiendo ? <><IonSpinner name="crescent" style={{ width: 16, height: 16 }} /> Subiendo fotos...</> : '✓ Guardar observación'}
            </button>
          </div>
        </div>
        <ModalTerminar />
      </IonContent>
    </IonPage>
  );

  // ─── PANTALLA: DEPTO ──────────────────────────────────────────────────────
  if (pantalla === 'depto') {
    const info   = infoDepto() ?? { actual: null, antes: [], despues: [] };
    const actual = info.actual;
    const badge  = calcularBadge(actividadReal, actual, deptoSel?.frente_depto, resultadoCalculo?.diaObra);

    return (
      <IonPage>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': dark ? '#111' : 'transparent' }}>
            <button slot="start" onClick={() => setPantalla('torre')} style={{ background: 'transparent', border: 'none', color: dark ? '#555' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>‹</button>
            <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>
              {deptoSel?.numero ?? deptoSel?.id_obra}
              {deptoSel?.numero && deptoSel?.id_obra && <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.55, marginLeft: 6 }}>({deptoSel.id_obra})</span>}
              <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.5, marginLeft: 6 }}>· {torreSel?.nombre}</span>
            </IonTitle>
            <div slot="end" style={{ marginRight: 14, background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#f9fafb' }}>
              Piso {deptoSel?.piso}
            </div>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg }}>
          <div style={{ padding: '12px 12px 100px' }}>
            <Banner />

            {/* Info depto — chips estilo Admin/Dashboard */}
            <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ label: 'N° Final', value: deptoSel?.numero }, { label: 'Id obra', value: deptoSel?.id_obra }, { label: 'Piso', value: deptoSel?.piso }].map(item => (
                  <div key={item.label} style={{ flex: 1, background: dark ? '#111' : '#f8fafc', borderRadius: 10, padding: '10px 8px', textAlign: 'center', border: `0.5px solid ${border}` }}>
                    <div style={{ fontSize: 9, color: textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '1px' }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>{item.value ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actividad teórica */}
            {actual ? (
              <div style={{ background: dark ? 'linear-gradient(135deg, #0a1628, #0e1f3d)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', borderRadius: 12, padding: '12px 14px', marginBottom: 6, border: dark ? '0.5px solid rgba(30,58,95,0.4)' : 'none' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>Actividad actual · hoy</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{actual.actividad}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{actual.cuadrilla}</div>
              </div>
            ) : (
              <div style={{ background: dark ? 'linear-gradient(135deg, #111, #181818)' : '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 6, border: `0.5px solid ${border}` }}>
                <div style={{ fontSize: 11, color: textMuted }}>Sin actividad programada para hoy</div>
              </div>
            )}

            {/* Contexto antes/después */}
            {(info.antes.length > 0 || info.despues.length > 0) && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[...info.antes].reverse().map((a, i) => (
                    <div key={i} style={{ background: dark ? 'rgba(30,58,95,0.12)' : 'rgba(30,58,95,0.05)', borderRadius: 10, padding: '7px 10px', border: `0.5px solid ${dark ? 'rgba(30,58,95,0.25)' : 'rgba(30,58,95,0.15)'}` }}>
                      <div style={{ fontSize: 9, color: dark ? '#4a7ab5' : '#1d4ed8', marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Hace {Math.abs(a.diasRelativo)} día{Math.abs(a.diasRelativo) > 1 ? 's' : ''}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>{a.actividad}</div>
                      <div style={{ fontSize: 10, color: textSecondary, marginTop: 1 }}>{a.cuadrilla}</div>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {info.despues.map((a, i) => (
                    <div key={i} style={{ background: 'transparent', borderRadius: 10, padding: '7px 10px', border: `0.5px dashed ${dark ? 'rgba(30,58,95,0.3)' : 'rgba(30,58,95,0.2)'}`, opacity: 0.75 }}>
                      <div style={{ fontSize: 9, color: dark ? '#4a7ab5' : '#1d4ed8', marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>En {a.diasRelativo} día{a.diasRelativo > 1 ? 's' : ''}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>{a.actividad}</div>
                      <div style={{ fontSize: 10, color: textSecondary, marginTop: 1 }}>{a.cuadrilla}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selector actividad real + badge */}
            <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>¿Qué actividad está realmente aquí?</div>

              <button onClick={() => setShowActividadSheet(true)} style={{ width: '100%', background: actividadReal ? (dark ? 'rgba(30,58,95,0.4)' : 'rgba(30,58,95,0.07)') : (dark ? '#111' : '#f8fafc'), border: `0.5px solid ${actividadReal ? (dark ? 'rgba(30,58,95,0.6)' : '#1e3a5f') : border}`, borderRadius: 10, padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', marginBottom: badge ? 10 : 0 }}>
                <div>
                  {actividadReal ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{actividadReal}</div>
                      <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{actividades.find(a => a.actividad === actividadReal)?.cuadrilla}</div>
                    </>
                  ) : (
                    <span style={{ fontSize: 13, color: textMuted }}>— Seleccionar actividad —</span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: textMuted }}>▾</span>
              </button>

              {/* Sheet de selección */}
              <IonModal isOpen={showActividadSheet} onDidDismiss={() => setShowActividadSheet(false)} initialBreakpoint={0.75} breakpoints={[0, 0.75, 1]}>
                <div style={{ background: card, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '16px 16px 12px', borderBottom: `0.5px solid ${border}` }}>
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: dark ? '#2a2a2a' : '#e2e8f0', margin: '0 auto 14px' }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>Seleccionar actividad</div>
                    <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>Agrupado por cuadrilla · toca para seleccionar</div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 40px' }}>
                    {Object.entries(cuadrillasAgrupadas).map(([cuadrilla, acts]) => (
                      <div key={cuadrilla} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: dark ? '#4a7ab5' : '#1e3a5f', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6, paddingLeft: 2 }}>{cuadrilla}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {(acts as any[]).map((act, i) => {
                            const sel = actividadReal === act.actividad;
                            return (
                              <button key={i} onClick={() => { setActividadReal(sel ? '' : act.actividad); setShowActividadSheet(false); }}
                                style={{ width: '100%', background: sel ? (dark ? 'rgba(30,58,95,0.5)' : 'rgba(30,58,95,0.09)') : (dark ? '#111' : '#f8fafc'), border: `0.5px solid ${sel ? (dark ? 'rgba(30,58,95,0.7)' : '#1e3a5f') : border}`, borderRadius: 10, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: sel ? (dark ? '#4ade80' : '#1e3a5f') : (dark ? '#2a2a2a' : '#cbd5e1'), border: sel ? 'none' : `1.5px solid ${dark ? '#3a3a3a' : '#94a3b8'}` }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: sel ? 600 : 400, color: textPrimary }}>{act.actividad}</div>
                                  {act.dia_inicio !== undefined && <div style={{ fontSize: 10, color: textMuted, marginTop: 1 }}>Día {act.dia_inicio}</div>}
                                </div>
                                {sel && <span style={{ fontSize: 14, color: dark ? '#4ade80' : '#1e3a5f' }}>✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </IonModal>

              {/* Badge resultado */}
              {badge && (
                <div style={{ background: badge.tipo === 'coincide' ? (dark ? 'rgba(74,222,128,0.08)' : 'rgba(34,197,94,0.06)') : badge.tipo === 'sin_teorico' ? (dark ? 'rgba(100,116,139,0.08)' : 'rgba(100,116,139,0.06)') : (dark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)'), border: `0.5px solid ${badge.tipo === 'coincide' ? 'rgba(34,197,94,0.3)' : badge.tipo === 'sin_teorico' ? 'rgba(100,116,139,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{badge.tipo === 'coincide' ? '✅' : badge.tipo === 'sin_teorico' ? '❓' : '⚠️'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: badge.tipo === 'coincide' ? (dark ? '#4ade80' : '#16a34a') : badge.tipo === 'sin_teorico' ? textSecondary : '#ef4444' }}>{badge.titulo}</div>
                    <div style={{ fontSize: 11, color: badge.tipo === 'coincide' ? (dark ? '#4ade80' : '#16a34a') : badge.tipo === 'sin_teorico' ? textMuted : '#ef4444', opacity: 0.8 }}>{badge.subtitulo}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Obs depto */}
            <div style={{ background: cardGrad, borderRadius: 16, border: `0.5px solid ${border}`, padding: 16, marginBottom: 12 }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>Observaciones del departamento</div>
              <textarea value={obsDepto} onChange={e => setObsDepto(e.target.value)} placeholder="Observación libre..." rows={3}
                style={{ width: '100%', background: inputBg, border: `0.5px solid ${inputBorder}`, borderRadius: 10, padding: '10px 12px', color: textPrimary, fontSize: 14, resize: 'none', boxSizing: 'border-box' }} />
              <FotosPreview fotos={fotosDepto.fotos} onAgregar={fotosDepto.agregarFoto} onEliminar={fotosDepto.eliminarFoto} subiendo={fotosDepto.subiendo} dark={dark} border={border} textMuted={textMuted} />
              <button onClick={guardarObsDepto} disabled={fotosDepto.subiendo}
                style={{ width: '100%', height: 44, borderRadius: 10, marginTop: 10, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: fotosDepto.subiendo ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {fotosDepto.subiendo ? <><IonSpinner name="crescent" style={{ width: 16, height: 16 }} /> Subiendo fotos...</> : '✓ Guardar y volver'}
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

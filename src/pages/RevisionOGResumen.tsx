// src/pages/RevisionOGResumen.tsx
// Resumen de cierre de departamento — Revisión Tolerancias OG
// Muestra heatmap del plano, tabla resumen por ambiente y detalle con hotspots
// FMS · Junio 2026
//
// FIX (jul 2026 · navegación OG): la selección (proyecto/torre/depto/cerrado) ya
//   NO llega por location.state (se perdía al volver atrás → blanco / dashboard).
//   Se lee desde sessionStorage ('og_seleccion'), que deja seteada RevisionOG.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, useIonViewDidEnter,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { CheckCircle2, Circle } from 'lucide-react';

// ─── Dimensiones base del calibrador de plano (vertical original) ────────────
const PLANO_W = 674;
const PLANO_H = 961;

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface OgRegistro {
  id: string;
  ambiente: string;
  tipo_elemento: string;
  tipo_revision: string;
  elemento: string;
  tolerancia: string;
  comentario: string | null;
  foto_url: string | null;
  creado_en: string;
  usuarios: { nombre: string }[] | null;
  accion: string | null; // reparación (desde og_reparaciones), cruzada por id
  codigo: string | null; // código corto de la reparación (PI, PU, C, Y...), cruzado por id
  estado: string;        // 'PENDIENTE' | 'SOLUCIONADO'
}

// ─── Vistas por tipo de reparación (FIX ago-2026) ─────────────────────────────
// General = todas · Albañilería = picado/puntereo · Copa = copa · Yeso = yeso.
// 'por definir' solo se ve en General.
type Vista = 'general' | 'albanileria' | 'copa' | 'yeso';

const VISTAS: { key: Vista; label: string }[] = [
  { key: 'general',     label: 'General' },
  { key: 'albanileria', label: 'Albañilería' },
  { key: 'copa',        label: 'Copa' },
  { key: 'yeso',        label: 'Yeso' },
];

// Clasifica una obs según su código (PI/PU/C/Y). Ya no adivina por texto:
// se basa en el código corto asignado en Calibrador de Elementos.
const obsEnVista = (codigo: string | null, vista: Vista): boolean => {
  if (vista === 'general') return true;
  const c = (codigo || '').toUpperCase();
  if (vista === 'copa')        return c === 'C';
  if (vista === 'yeso')        return c === 'Y';
  // albañilería: picado (PI) o puntereo (PU)
  return c === 'PI' || c === 'PU';
};

// Etiqueta + color para el chip de reparación en la tabla de fallas.
// El código (PI/PU/C/Y) es la fuente de verdad; si no hay código asignado
// se muestra "Por definir" aunque exista un texto de "accion" libre.
const CODIGO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  PI: { label: 'Picado',   color: '#b91c1c', bg: '#fef2f2' },
  PU: { label: 'Puntereo', color: '#1d4ed8', bg: '#eff6ff' },
  C:  { label: 'Copa',     color: '#a16207', bg: '#fffbeb' },
  Y:  { label: 'Yeso',     color: '#7c3aed', bg: '#f5f3ff' },
};
const CODIGO_LABEL_DARK: Record<string, { color: string; bg: string }> = {
  PI: { color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  PU: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  C:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  Y:  { color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
};
const chipReparacion = (codigo: string | null, dark: boolean) => {
  const c = (codigo || '').toUpperCase();
  const base = CODIGO_LABEL[c];
  if (!base) return { codigo: '?', label: 'Por definir', color: dark ? '#6b7280' : '#6b7280', bg: dark ? 'rgba(107,114,128,0.12)' : '#f3f4f6' };
  const tema = dark ? CODIGO_LABEL_DARK[c] : { color: base.color, bg: base.bg };
  return { codigo: c, label: base.label, color: tema.color, bg: tema.bg };
};

interface AmbientePlano {
  titulo: string;
  ambiente_cod: string;
  pos_x_base: number;
  pos_y_base: number;
  ancho_base: number;
  alto_base: number;
  grupo_imagen: string;
}

interface ElementoAmb {
  elemento: string;
  pos_x: number;
  pos_y: number;
  ancho: number;
  alto: number;
  ancho_orig: number;
  alto_orig: number;
}

interface AmbienteDetalle {
  titulo: string;
  ambiente_cod: string;
  grupo_imagen: string;
  imagen_url: string | null;
  ancho_orig: number;
  alto_orig: number;
  obs: OgRegistro[];
  elementos: ElementoAmb[];
}

// ─── Selección OG persistida (reemplaza a location.state) ─────────────────────
const leerSeleccionOG = (): any => {
  try { return JSON.parse(sessionStorage.getItem('og_seleccion') || 'null'); }
  catch { return null; }
};

// ─── Helpers de color heatmap ─────────────────────────────────────────────────
function heatColor(count: number, dark: boolean) {
  if (count === 0) return {
    fill: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    stroke: dark ? '#333' : '#cbd5e1',
    text: dark ? '#6E86A6' : '#94a3b8',
  };
  if (count <= 2) return {
    fill: dark ? 'rgba(96,165,250,0.18)' : 'rgba(37,99,235,0.12)',
    stroke: dark ? '#3b82f6' : '#2563eb',
    text: dark ? '#60a5fa' : '#1d4ed8',
  };
  if (count <= 4) return {
    fill: dark ? 'rgba(251,191,36,0.18)' : 'rgba(161,98,7,0.12)',
    stroke: dark ? '#fbbf24' : '#a16207',
    text: dark ? '#fbbf24' : '#a16207',
  };
  return {
    fill: dark ? 'rgba(248,113,113,0.22)' : 'rgba(185,28,28,0.12)',
    stroke: dark ? '#f87171' : '#b91c1c',
    text: dark ? '#f87171' : '#b91c1c',
  };
}

function estadoBadge(count: number, dark: boolean) {
  if (count === 0) return { bg: dark ? '#1E2E4A' : '#f1f5f9', color: dark ? '#6E86A6' : '#94a3b8', label: 'OK' };
  if (count <= 2) return { bg: dark ? 'rgba(96,165,250,0.12)' : '#eff6ff', color: dark ? '#60a5fa' : '#1d4ed8', label: 'Bajo' };
  if (count <= 4) return { bg: dark ? 'rgba(251,191,36,0.12)' : '#fffbeb', color: dark ? '#fbbf24' : '#a16207', label: 'Alto' };
  return { bg: dark ? 'rgba(239,68,68,0.12)' : '#fef2f2', color: dark ? '#f87171' : '#b91c1c', label: 'Crítico' };
}

// ─── Componente principal ─────────────────────────────────────────────────────
const RevisionOGResumen: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const history = useHistory();
  const iniciado = useRef(false);

  // ── Tokens de diseño ──────────────────────────────────────────────────────
  const bg            = dark ? '#0B1220' : '#f0f4f8';
  const cardGrad      = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const border        = dark ? '#243550' : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#5D728F' : '#94a3b8';
  const toolbar       = dark ? '#0E1728' : '#1e3a5f';

  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16,
    border: `0.5px solid ${border}`, padding: '14px 14px', marginBottom: 10,
  };
  const sSecLabel: React.CSSProperties = {
    fontSize: 9, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12,
  };

  // ── Selección (desde sessionStorage, re-hidratada en cada montaje) ─────────
  const state = leerSeleccionOG() || {};
  const { proyecto, torre, depto, cerrado } = state;

  const [cargando, setCargando]             = useState(true);
  const [obs, setObs]                       = useState<OgRegistro[]>([]);
  const [planoUrl, setPlanoUrl]             = useState<string | null>(null);
  const [ambientesPlano, setAmbientesPlano] = useState<AmbientePlano[]>([]);
  const [detalles, setDetalles]             = useState<AmbienteDetalle[]>([]);
  const [planoW, setPlanoW]                 = useState(0);
  const planoRef = useRef<HTMLDivElement>(null);

  // ── Carga de datos ────────────────────────────────────────────────────────
  const cargar = async () => {
    if (!depto?.id) return;
    setCargando(true);
    try {
      const planoVersionId = depto.plano_version_id as string | null;

      const [
        { data: obsData },
        { data: planoData },
        { data: ambPlanoData },
        { data: configAmbData },
        { data: imagenesData },
        { data: elementosData },
      ] = await Promise.all([
        supabase.from('og_registros')
          .select('id, ambiente, tipo_elemento, tipo_revision, elemento, tolerancia, comentario, foto_url, creado_en, usuarios!og_registros_usuario_id_fkey(nombre)')
          .eq('departamento_id', depto.id)
          .order('ambiente').order('creado_en'),

        planoVersionId
          ? supabase.from('og_planos').select('plano_url').eq('plano_version_id', planoVersionId).maybeSingle()
          : Promise.resolve({ data: null }),

        planoVersionId
          ? supabase.from('og_planos_ambientes')
              .select('titulo, ambiente_cod, pos_x_base, pos_y_base, ancho_base, alto_base, grupo_imagen')
              .eq('plano_version_id', planoVersionId)
              .eq('activo', true)
              .order('orden')
          : Promise.resolve({ data: [] }),

        planoVersionId
          ? supabase.from('og_config_ambientes')
              .select('ambiente_cod, grupo_imagen, imagen_url, ambiente')
              .eq('plano_version_id', planoVersionId)
              .eq('existe', true)
          : Promise.resolve({ data: [] }),

        supabase.from('og_imagenes_ambiente')
          .select('grupo_imagen, imagen_url, ancho_orig, alto_orig')
          .eq('activo', true),

        supabase.from('og_elementos_ambiente')
          .select('grupo_imagen, elemento, pos_x, pos_y, ancho, alto')
          .eq('activo', true),
      ]);

      const registrosBase = (obsData ?? []) as unknown as OgRegistro[];

      // Reparación (accion) por registro — se cruza por id con og_registros.
      // Se consulta por los ids del depto (la vista tiene 'id'; puede no tener
      // departamento_id), evitando supuestos sobre su esquema.
      const idsDepto = registrosBase.map(r => r.id);
      const accionMap = new Map<string, string | null>();
      const codigoMap = new Map<string, string | null>();
      const estadoMap = new Map<string, string>();
      if (idsDepto.length > 0) {
        const { data: repData } = await supabase
          .from('og_reparaciones')
          .select('id, accion, codigo, estado')
          .in('id', idsDepto);
        (repData ?? []).forEach((r: any) => {
          accionMap.set(r.id, r.accion ?? null);
          codigoMap.set(r.id, r.codigo ?? null);
          estadoMap.set(r.id, r.estado ?? 'PENDIENTE');
        });
      }

      const registros = registrosBase.map(r => ({
        ...r,
        accion: accionMap.get(r.id) ?? null,
        codigo: codigoMap.get(r.id) ?? null,
        estado: estadoMap.get(r.id) ?? 'PENDIENTE',
      }));
      setObs(registros);
      setPlanoUrl((planoData as any)?.plano_url ?? null);
      setAmbientesPlano((ambPlanoData ?? []) as AmbientePlano[]);

      // Mapa de imágenes y dimensiones por grupo_imagen
      const imgMap = new Map<string, { imagen_url: string; ancho_orig: number; alto_orig: number }>();
      (imagenesData ?? []).forEach((img: any) => {
        imgMap.set(img.grupo_imagen, {
          imagen_url: img.imagen_url,
          ancho_orig: img.ancho_orig,
          alto_orig: img.alto_orig,
        });
      });

      // Mapa: ambiente_cod → { grupo_imagen, imagen_url }
      const configMap = new Map<string, { grupo_imagen: string; imagen_url: string | null }>();
      (configAmbData ?? []).forEach((c: any) => {
        if (!configMap.has(c.ambiente_cod)) {
          const imgEntry = imgMap.get(c.grupo_imagen);
          configMap.set(c.ambiente_cod, {
            grupo_imagen: c.grupo_imagen,
            imagen_url: c.imagen_url || imgEntry?.imagen_url || null,
          });
        }
      });

      // Ambientes con obs (orden de aparición)
      const ambientesConObs = [...new Set(registros.map(r => r.ambiente))];

      // Construir detalles por ambiente
      const detallesArr: AmbienteDetalle[] = [];
      for (const ambNombre of ambientesConObs) {
        const obsAmb = registros.filter(r => r.ambiente === ambNombre);

        const planoAmb = (ambPlanoData ?? []).find((a: AmbientePlano) =>
          a.titulo.toLowerCase() === ambNombre.toLowerCase()
        ) as AmbientePlano | undefined;

        const ambCod   = planoAmb?.ambiente_cod ?? '';
        const grupoImg = planoAmb?.grupo_imagen ?? '';
        const config   = configMap.get(ambCod);
        const imgEntry = grupoImg ? imgMap.get(grupoImg) : undefined;

        const imagen_url = config?.imagen_url ?? imgEntry?.imagen_url ?? null;
        const ancho_orig = imgEntry?.ancho_orig ?? 584;
        const alto_orig  = imgEntry?.alto_orig  ?? 511;

        // Solo elementos que tienen al menos 1 obs en este depto/ambiente
        const nombresConObs = new Set(obsAmb.map(r => r.elemento));
        const elementosAmb = ((elementosData ?? []) as any[])
          .filter(e => e.grupo_imagen === grupoImg && nombresConObs.has(e.elemento))
          .map(e => ({
            elemento: e.elemento,
            pos_x: e.pos_x,
            pos_y: e.pos_y,
            ancho: e.ancho,
            alto: e.alto,
            ancho_orig,
            alto_orig,
          }));

        detallesArr.push({
          titulo: ambNombre,
          ambiente_cod: ambCod,
          grupo_imagen: grupoImg,
          imagen_url,
          ancho_orig,
          alto_orig,
          obs: obsAmb,
          elementos: elementosAmb,
        });
      }

      setDetalles(detallesArr);
    } catch (e) {
      console.error('Error cargando resumen OG:', e);
    } finally {
      setCargando(false);
    }
  };

  // Alterna el estado de una falla entre PENDIENTE y SOLUCIONADO.
  // Actualización local (optimista): se guarda en la BD y se refleja de
  // inmediato en el estado en memoria (obs + detalles), sin recargar todo
  // el resumen desde la red — evita el parpadeo/recarga completa de la
  // pantalla (plano, heatmap, tarjetas) por cambiar un solo chip.
  const [guardandoEstado, setGuardandoEstado] = useState<string | null>(null);
  const toggleEstado = async (ob: OgRegistro) => {
    const nuevoEstado = ob.estado === 'SOLUCIONADO' ? 'PENDIENTE' : 'SOLUCIONADO';
    setGuardandoEstado(ob.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('og_registros')
        .update({
          estado: nuevoEstado,
          solucionado_en: nuevoEstado === 'SOLUCIONADO' ? new Date().toISOString() : null,
          solucionado_por: nuevoEstado === 'SOLUCIONADO' ? (user?.id ?? null) : null,
        })
        .eq('id', ob.id);
      if (error) throw error;

      setObs(prev => prev.map(r => (r.id === ob.id ? { ...r, estado: nuevoEstado } : r)));
      setDetalles(prev => prev.map(det => ({
        ...det,
        obs: det.obs.map(r => (r.id === ob.id ? { ...r, estado: nuevoEstado } : r)),
      })));
    } catch (e) {
      console.error('Error actualizando estado OG:', e);
    } finally {
      setGuardandoEstado(null);
    }
  };

  useIonViewDidEnter(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    cargar();
  });

  // Medir ancho del contenedor del plano
  useEffect(() => {
    if (!planoRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setPlanoW(w);
    });
    ro.observe(planoRef.current);
    return () => ro.disconnect();
  }, [cargando]);

  // ── Vista activa (General / Albañilería / Copa / Yeso) ─────────────────────
  const [vista, setVista] = useState<Vista>('general');

  // Obs visibles según la vista (base para métricas, heatmap, tabla y tarjetas)
  const obsVista = obs.filter(r => obsEnVista(r.codigo, vista));

  // ── Métricas ──────────────────────────────────────────────────────────────
  const totalObs        = obsVista.length;
  const ambientesUnicos = [...new Set(obsVista.map(r => r.ambiente))];
  const criticos        = ambientesUnicos.filter(a => obsVista.filter(r => r.ambiente === a).length >= 5).length;

  // ── Escala para plano horizontal ──────────────────────────────────────────
  // El plano original es PLANO_W(674) × PLANO_H(961), orientación vertical.
  // Lo mostramos rotado 90° a la derecha → ancho visual = PLANO_H, alto visual = PLANO_W.
  // escalaPlano: factor para que el ancho horizontal quepa en el contenedor.
  const escalaPlano       = planoW > 0 ? planoW / PLANO_H : 0;
  const alturaPlanoRender = PLANO_W * escalaPlano;

  // Transformar coords del plano vertical a plano rotado 90° (sentido horario):
  // Rotación +90°: nuevo_x = pos_y_base
  //                nuevo_y = PLANO_W - pos_x_base - ancho_base
  //                nuevo_w = alto_base
  //                nuevo_h = ancho_base
  const coordsHorizontal = (a: AmbientePlano) => ({
    left:   (PLANO_H - a.pos_y_base - a.alto_base) * escalaPlano,
  top:    a.pos_x_base * escalaPlano,
  width:  a.alto_base  * escalaPlano,
  height: a.ancho_base * escalaPlano,
});

  // Obs por ambiente_cod para colorear el heatmap (según la vista)
  const obsPorCod = new Map<string, number>();
  ambientesPlano.forEach(a => {
    const count = obsVista.filter(r => r.ambiente.toLowerCase() === a.titulo.toLowerCase()).length;
    obsPorCod.set(a.ambiente_cod, count);
  });

  // ── Tabla resumen ─────────────────────────────────────────────────────────
  const resumenTabla = ambientesUnicos
    .map(a => ({ ambiente: a, count: obsVista.filter(r => r.ambiente === a).length }))
    .sort((a, b) => b.count - a.count);
  const maxObs = resumenTabla[0]?.count ?? 1;

  // Detalles visibles: solo ambientes con al menos 1 obs en la vista activa
  const detallesVista = detalles.filter(d => d.obs.some(o => obsEnVista(o.codigo, vista)));

  // ── Guard sin depto ───────────────────────────────────────────────────────
  if (!depto) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#fff' } as any}>
            <button slot="start" onClick={() => history.goBack()}
              style={{ background: 'transparent', border: 'none', color: dark ? '#6E86A6' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>
              ‹
            </button>
            <IonTitle>Resumen OG</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg } as any}>
          <div style={{ padding: 24, color: textSecondary, textAlign: 'center', marginTop: 40 }}>
            Sin datos de departamento
          </div>
        </IonContent>
      </IonPage>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <button slot="start" onClick={() => history.goBack()}
            style={{ background: 'transparent', border: 'none', color: dark ? '#6E86A6' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>
            ‹
          </button>
          <IonTitle style={{ fontSize: 15 }}>
            Resumen · Depto {depto.id_obra ?? depto.numero} · {torre?.nombre}
          </IonTitle>
          <IonButtons slot="end">
            {cerrado && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#f87171',
                background: dark ? 'rgba(239,68,68,0.12)' : '#fef2f2',
                padding: '3px 10px', borderRadius: 20, marginRight: 10,
                border: `0.5px solid ${dark ? 'rgba(239,68,68,0.3)' : '#fecaca'}`,
              }}>🔒 Cerrado</span>
            )}
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: '12px 12px 32px' }}>

          {cargando ? (
            <div style={{ textAlign: 'center', padding: 40, color: textSecondary }}>
              Cargando resumen…
            </div>
          ) : (
            <>
              {/* ── Selector de vista (General / Albañilería / Copa / Yeso) ── */}
              <div style={{
                display: 'flex', gap: 6, marginBottom: 10,
                background: cardGrad, borderRadius: 12,
                border: `0.5px solid ${border}`, padding: 4,
              }}>
                {VISTAS.map(v => {
                  const activo = vista === v.key;
                  return (
                    <button
                      key={v.key}
                      onClick={() => setVista(v.key)}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 9,
                        border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: activo ? 700 : 500,
                        background: activo ? (dark ? '#1e3a5f' : '#1e3a5f') : 'transparent',
                        color: activo ? '#ffffff' : textSecondary,
                        transition: 'all 0.15s',
                      }}
                    >{v.label}</button>
                  );
                })}
              </div>

              {/* ── Métricas ───────────────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[
                  { label: 'Total obs.',  value: totalObs,              color: textPrimary },
                  { label: 'Ambientes',   value: ambientesUnicos.length, color: textPrimary },
                  { label: 'Críticos',    value: criticos,               color: dark ? '#f87171' : '#b91c1c' },
                ].map(m => (
                  <div key={m.label} style={{
                    background: cardGrad, borderRadius: 12,
                    border: `0.5px solid ${border}`, padding: '10px 12px',
                  }}>
                    <div style={{ fontSize: 10, color: textMuted, marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 600, color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* ── Heatmap — plano horizontal ─────────────────────────────── */}
              <div style={sCard}>
                <div style={sSecLabel as any}>Plano — distribución de observaciones</div>

                <div ref={planoRef} style={{ width: '100%', position: 'relative' }}>
                  {planoW > 0 && (
                    <div style={{
                      width: planoW,
                      height: alturaPlanoRender,
                      position: 'relative',
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: dark ? '#0a0a0a' : '#f8fafc',
                      border: `0.5px solid ${border}`,
                    }}>
                      {/* Imagen del plano rotada 90° sentido horario */}
                      {planoUrl && (
                        <img
                          src={planoUrl}
                          alt="Plano departamento"
                          style={{
                            position: 'absolute',
                            width: alturaPlanoRender,
                            height: planoW,
                            top: 0,
                            left: 0,
                            transformOrigin: `${alturaPlanoRender / 2}px ${alturaPlanoRender / 2}px`,
                            transform: `rotate(90deg) translateY(-${planoW - alturaPlanoRender}px)`,
                            objectFit: 'fill',
                            opacity: dark ? 0.55 : 0.35,
                          }}
                        />
                      )}

                      {/* Overlays coloreados por ambiente */}
                      {ambientesPlano.map(amb => {
                        const count = obsPorCod.get(amb.ambiente_cod) ?? 0;
                        const col   = heatColor(count, dark);
                        const pos   = coordsHorizontal(amb);
                        return (
                          <div
                            key={amb.ambiente_cod}
                            style={{
                              position: 'absolute',
                              left: pos.left, top: pos.top,
                              width: pos.width, height: pos.height,
                              background: col.fill,
                              border: `1.5px solid ${col.stroke}`,
                              borderRadius: 4,
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center',
                              overflow: 'hidden',
                            }}
                          >
                            <span style={{
                              fontSize: Math.max(8, Math.min(12, pos.width / 6)),
                              fontWeight: 600, color: col.text,
                              lineHeight: 1.1, textAlign: 'center', padding: '0 2px',
                            }}>
                              {count > 0 ? count : ''}
                            </span>
                            <span style={{
                              fontSize: Math.max(7, Math.min(10, pos.width / 8)),
                              color: col.text, opacity: 0.8,
                              textAlign: 'center', padding: '0 2px', lineHeight: 1.1,
                            }}>
                              {amb.titulo.length > 10 ? amb.titulo.split(' ')[0] : amb.titulo}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Leyenda */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
                  {[
                    { label: 'Sin obs.', color: dark ? '#6E86A6'    : '#94a3b8', fill: dark ? '#16233B'                      : '#f1f5f9' },
                    { label: '1–2',      color: dark ? '#60a5fa' : '#2563eb', fill: dark ? 'rgba(96,165,250,0.18)'     : 'rgba(37,99,235,0.12)' },
                    { label: '3–4',      color: dark ? '#fbbf24' : '#a16207', fill: dark ? 'rgba(251,191,36,0.18)'     : 'rgba(161,98,7,0.12)' },
                    { label: '≥5',       color: dark ? '#f87171' : '#b91c1c', fill: dark ? 'rgba(248,113,113,0.22)'    : 'rgba(185,28,28,0.12)' },
                  ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: l.fill, border: `1px solid ${l.color}` }} />
                      <span style={{ fontSize: 11, color: textSecondary }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Tabla resumen por ambiente ──────────────────────────────── */}
              {resumenTabla.length > 0 && (
                <div style={sCard}>
                  <div style={sSecLabel as any}>Resumen por ambiente</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Ambiente', 'Obs.', 'Distribución', 'Estado'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', fontSize: 10, fontWeight: 600,
                            color: textMuted, padding: '4px 6px 8px',
                            borderBottom: `0.5px solid ${border}`,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resumenTabla.map(({ ambiente, count }) => {
                        const badge    = estadoBadge(count, dark);
                        const pct      = Math.round((count / maxObs) * 100);
                        const barColor = count === 0 ? textMuted
                          : count <= 2 ? (dark ? '#3b82f6' : '#2563eb')
                          : count <= 4 ? (dark ? '#fbbf24' : '#a16207')
                          : (dark ? '#f87171' : '#b91c1c');
                        return (
                          <tr key={ambiente} style={{ borderBottom: `0.5px solid ${border}` }}>
                            <td style={{ padding: '8px 6px', color: textPrimary, fontSize: 13 }}>{ambiente}</td>
                            <td style={{ padding: '8px 6px', fontWeight: 600, color: textPrimary }}>{count}</td>
                            <td style={{ padding: '8px 6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 5, borderRadius: 3, background: dark ? '#1E2E4A' : '#e2e8f0' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: barColor }} />
                                </div>
                                <span style={{ fontSize: 10, color: textMuted, minWidth: 28 }}>
                                  {totalObs > 0 ? Math.round((count / totalObs) * 100) : 0}%
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 6px' }}>
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 9px',
                                borderRadius: 20, background: badge.bg, color: badge.color,
                              }}>{badge.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Detalle por ambiente (filtrado por vista) ───────────────── */}
              {detallesVista.map((det, idx) => (
                <AmbienteCard
                  key={det.ambiente_cod || idx}
                  det={det}
                  vista={vista}
                  dark={dark}
                  sCard={sCard}
                  sSecLabel={sSecLabel}
                  border={border}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  textMuted={textMuted}
                  onToggleEstado={toggleEstado}
                  guardandoEstado={guardandoEstado}
                />
              ))}

              {totalObs === 0 && (
                <div style={{ ...sCard, textAlign: 'center', padding: 32, color: textSecondary, fontSize: 14 }}>
                  {vista === 'general'
                    ? 'Sin observaciones registradas para este departamento'
                    : `Sin observaciones de ${VISTAS.find(v => v.key === vista)?.label.toLowerCase()} en este departamento`}
                </div>
              )}
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

// ─── Card de detalle por ambiente ─────────────────────────────────────────────
interface AmbienteCardProps {
  det: AmbienteDetalle;
  dark: boolean;
  vista: Vista;
  sCard: React.CSSProperties;
  sSecLabel: React.CSSProperties;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  onToggleEstado: (ob: OgRegistro) => void;
  guardandoEstado: string | null;
}

const AmbienteCard: React.FC<AmbienteCardProps> = ({
  det, vista, dark, sCard, sSecLabel, border, textPrimary, textSecondary, textMuted,
  onToggleEstado, guardandoEstado,
}) => {
  // ── FIX ago-2026: mismo método de render que RevisionOGAmbiente (registro) ──
  //   El registro posiciona bien porque: altura del contenedor = aspecto exacto
  //   de la imagen, <img objectFit:'fill'>, y hotspots escalados directo por
  //   ancho_orig/alto_orig (sin letterbox, sin estado imgH separado). Aquí se
  //   replica idéntico. Un solo estado medido (contenedorW); la altura se deriva
  //   en el render. Se mide en el ResizeObserver y también al cargar la imagen.
  const imgRef = useRef<HTMLDivElement>(null);
  const [contenedorW, setContenedorW] = useState(0);

  const medir = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width || el.offsetWidth;
    if (w > 0) setContenedorW(w);
  }, []);

  useEffect(() => {
    if (!imgRef.current) return;
    const ro = new ResizeObserver(entries => {
      const cw = entries[0]?.contentRect.width;
      if (cw > 0) setContenedorW(cw);
    });
    ro.observe(imgRef.current);
    return () => ro.disconnect();
  }, []);

  // Altura de la imagen derivada EN EL RENDER (idéntico al registro)
  const alturaImagen = det.ancho_orig > 0 && contenedorW > 0
    ? (det.alto_orig / det.ancho_orig) * contenedorW
    : 0;

  const escalar = (v: number, orig: number, rendered: number) =>
    orig > 0 ? (v / orig) * rendered : 0;

  // Obs y elementos filtrados por la vista activa
  const obsVista = det.obs.filter(o => obsEnVista(o.codigo, vista));
  const nombresVista = new Set(obsVista.map(o => o.elemento));
  const elementosVista = det.elementos.filter(el => nombresVista.has(el.elemento));

  const badge = estadoBadge(obsVista.length, dark);

  return (
    <div style={sCard}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{det.titulo}</div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 10px',
          borderRadius: 20, background: badge.bg, color: badge.color,
        }}>{obsVista.length} obs.</span>
      </div>

      {/* Imagen del ambiente + hotspots */}
      <div
        ref={imgRef}
        style={{
          position: 'relative',
          width: '100%',
          height: alturaImagen > 0 ? alturaImagen : 'auto',
          minHeight: alturaImagen > 0 ? undefined : 180,
          borderRadius: 10,
          overflow: 'hidden',
          background: dark ? '#0a0a0a' : '#f1f5f9',
          border: `0.5px solid ${border}`,
          marginBottom: 12,
        }}
      >
        {det.imagen_url ? (
          <img
            src={det.imagen_url}
            alt={`Plano ${det.titulo}`}
            onLoad={medir}
            style={{
              width: '100%',
              height: alturaImagen > 0 ? '100%' : 'auto',
              objectFit: 'fill', display: 'block',
              userSelect: 'none', WebkitUserSelect: 'none',
            }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: textMuted, fontSize: 13,
          }}>
            Sin imagen de ambiente
          </div>
        )}

        {/* Hotspots — escalado directo, idéntico al registro (sin letterbox) */}
        {contenedorW > 0 && alturaImagen > 0 && elementosVista.map((el, i) => {
          const left   = escalar(el.pos_x, det.ancho_orig, contenedorW);
          const top    = escalar(el.pos_y, det.alto_orig,  alturaImagen);
          const width  = escalar(el.ancho, det.ancho_orig, contenedorW);
          const height = escalar(el.alto,  det.alto_orig,  alturaImagen);

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left, top, width, height,
                border: '2.5px solid #06b6d4',
                background: 'rgba(6,182,212,0.28)',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 0 6px rgba(6,182,212,0.6)',
                borderRadius: 3,
                boxSizing: 'border-box',
              }}
            >
              <span style={{
                position: 'absolute',
                bottom: '100%', left: 0,
                fontSize: 9, fontWeight: 700,
                color: '#ffffff',
                background: '#0891b2',
                padding: '1px 4px', borderRadius: 2,
                whiteSpace: 'nowrap', maxWidth: 120,
                overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2,
              }}>
                {el.elemento}
              </span>
            </div>
          );
        })}
      </div>

      {/* Tabla de fallas */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ ...(sSecLabel as any), marginBottom: 0 }}>Fallas registradas</div>
        <span style={{ fontSize: 9, color: textMuted, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
          Toca el estado para cambiarlo
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['#', 'Elemento', 'Tipo', 'Tolerancia', 'Reparación', 'Comentario', 'Estado'].map(h => (
              <th key={h} style={{
                textAlign: 'left', fontSize: 10, fontWeight: 600,
                color: textMuted, padding: '4px 5px 6px',
                borderBottom: `0.5px solid ${border}`,
                background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {obsVista.map((ob, i) => (
            <tr key={ob.id} style={{ borderBottom: `0.5px solid ${border}` }}>
              <td style={{ padding: '7px 5px', color: textMuted, fontSize: 11 }}>{i + 1}</td>
              <td style={{ padding: '7px 5px', color: textPrimary, fontSize: 12 }}>{ob.elemento}</td>
              <td style={{ padding: '7px 5px', color: textSecondary, fontSize: 11 }}>{ob.tipo_revision}</td>
              <td style={{ padding: '7px 5px', color: textPrimary, fontSize: 12 }}>{ob.tolerancia}</td>
              <td style={{ padding: '7px 5px' }}>
                {(() => {
                  const c = chipReparacion(ob.codigo, dark);
                  return (
                    <span style={{
                      fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                      padding: '2px 8px', borderRadius: 20,
                      background: c.bg, color: c.color,
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}>
                      <span style={{
                        fontWeight: 800, fontSize: 9, border: `1px solid ${c.color}`,
                        borderRadius: 4, padding: '0 4px', lineHeight: '13px',
                      }}>{c.codigo}</span>
                      {c.label}
                    </span>
                  );
                })()}
              </td>
              <td style={{ padding: '7px 5px', color: textSecondary, fontSize: 11 }}>
                {ob.comentario || '—'}
              </td>
              <td style={{ padding: '7px 5px' }}>
                {(() => {
                  const solucionado = ob.estado === 'SOLUCIONADO';
                  const guardando = guardandoEstado === ob.id;
                  const verde    = dark ? '#4ade80' : '#15803d';
                  const verdeBg  = dark ? 'rgba(74,222,128,0.14)' : '#f0fdf4';
                  const ambar    = dark ? '#fbbf24' : '#a16207';
                  const ambarBg  = dark ? 'rgba(251,191,36,0.14)' : '#fffbeb';
                  const color = solucionado ? verde : ambar;
                  return (
                    <button
                      onClick={() => onToggleEstado(ob)}
                      disabled={guardando}
                      title={solucionado ? 'Toca para marcar como pendiente' : 'Toca para marcar como solucionado'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                        padding: '4px 10px 4px 7px', borderRadius: 20,
                        border: `1.5px solid ${color}`,
                        background: solucionado ? verdeBg : ambarBg,
                        color,
                        cursor: guardando ? 'wait' : 'pointer',
                        opacity: guardando ? 0.55 : 1,
                        boxShadow: dark ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
                      }}
                    >
                      {guardando
                        ? '…'
                        : solucionado
                          ? <CheckCircle2 size={13} strokeWidth={2.5} />
                          : <Circle size={13} strokeWidth={2.5} />}
                      {guardando ? 'Guardando' : (solucionado ? 'Solucionado' : 'Pendiente')}
                    </button>
                  );
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RevisionOGResumen;
// src/pages/RevisionOGResumen.tsx
// Resumen de cierre de departamento — Revisión Tolerancias OG
// Muestra heatmap del plano, tabla resumen por ambiente y detalle con hotspots
// FMS · Junio 2026

import React, { useEffect, useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonMenuButton, useIonViewDidEnter,
} from '@ionic/react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';

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
}

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

// ─── Helpers de color heatmap ─────────────────────────────────────────────────
function heatColor(count: number, dark: boolean) {
  if (count === 0) return {
    fill: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    stroke: dark ? '#333' : '#cbd5e1',
    text: dark ? '#555' : '#94a3b8',
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
  if (count === 0) return { bg: dark ? '#1a1a1a' : '#f1f5f9', color: dark ? '#555' : '#94a3b8', label: 'OK' };
  if (count <= 2) return { bg: dark ? 'rgba(96,165,250,0.12)' : '#eff6ff', color: dark ? '#60a5fa' : '#1d4ed8', label: 'Bajo' };
  if (count <= 4) return { bg: dark ? 'rgba(251,191,36,0.12)' : '#fffbeb', color: dark ? '#fbbf24' : '#a16207', label: 'Alto' };
  return { bg: dark ? 'rgba(239,68,68,0.12)' : '#fef2f2', color: dark ? '#f87171' : '#b91c1c', label: 'Crítico' };
}

// ─── Componente principal ─────────────────────────────────────────────────────
const RevisionOGResumen: React.FC = () => {
  const location = useLocation<any>();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const iniciado = useRef(false);

  // ── Tokens de diseño ──────────────────────────────────────────────────────
  const bg            = dark ? '#000000' : '#f0f4f8';
  const cardGrad      = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border        = dark ? '#1e1e1e' : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#444444' : '#94a3b8';
  const toolbar       = dark ? '#000000' : '#1e3a5f';

  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16,
    border: `0.5px solid ${border}`, padding: '14px 14px', marginBottom: 10,
  };
  const sSecLabel: React.CSSProperties = {
    fontSize: 9, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12,
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const state = location.state || {};
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
          .select('id, ambiente, tipo_elemento, tipo_revision, elemento, tolerancia, comentario, foto_url, creado_en, usuarios(nombre)')
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

      const registros = (obsData ?? []) as unknown as OgRegistro[];
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

  // ── Métricas ──────────────────────────────────────────────────────────────
  const totalObs       = obs.length;
  const ambientesUnicos = [...new Set(obs.map(r => r.ambiente))];
  const criticos       = ambientesUnicos.filter(a => obs.filter(r => r.ambiente === a).length >= 5).length;

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

  // Obs por ambiente_cod para colorear el heatmap
  const obsPorCod = new Map<string, number>();
  ambientesPlano.forEach(a => {
    const count = obs.filter(r => r.ambiente.toLowerCase() === a.titulo.toLowerCase()).length;
    obsPorCod.set(a.ambiente_cod, count);
  });

  // ── Tabla resumen ─────────────────────────────────────────────────────────
  const resumenTabla = ambientesUnicos
    .map(a => ({ ambiente: a, count: obs.filter(r => r.ambiente === a).length }))
    .sort((a, b) => b.count - a.count);
  const maxObs = resumenTabla[0]?.count ?? 1;

  // ── Guard sin depto ───────────────────────────────────────────────────────
  if (!depto) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#fff' } as any}>
            <IonButtons slot="start">
              <IonMenuButton style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
            </IonButtons>
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
          <IonButtons slot="start">
            <IonMenuButton style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          </IonButtons>
          <IonTitle style={{ fontSize: 15 }}>
            Resumen · Depto {depto.numero} · {torre?.nombre}
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
                    { label: 'Sin obs.', color: dark ? '#555'    : '#94a3b8', fill: dark ? '#111'                      : '#f1f5f9' },
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
                                <div style={{ flex: 1, height: 5, borderRadius: 3, background: dark ? '#1a1a1a' : '#e2e8f0' }}>
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

              {/* ── Detalle por ambiente ────────────────────────────────────── */}
              {detalles.map((det, idx) => (
                <AmbienteCard
                  key={det.ambiente_cod || idx}
                  det={det}
                  dark={dark}
                  sCard={sCard}
                  sSecLabel={sSecLabel}
                  border={border}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  textMuted={textMuted}
                />
              ))}

              {totalObs === 0 && (
                <div style={{ ...sCard, textAlign: 'center', padding: 32, color: textSecondary, fontSize: 14 }}>
                  Sin observaciones registradas para este departamento
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
  sCard: React.CSSProperties;
  sSecLabel: React.CSSProperties;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

const AmbienteCard: React.FC<AmbienteCardProps> = ({
  det, dark, sCard, sSecLabel, border, textPrimary, textSecondary, textMuted,
}) => {
  const imgRef = useRef<HTMLDivElement>(null);
  const [imgW, setImgW] = useState(0);
  const [imgH, setImgH] = useState(0);

  useEffect(() => {
    if (!imgRef.current) return;
    const ro = new ResizeObserver(entries => {
      const cw = entries[0]?.contentRect.width;
      if (!cw) return;
      const { ancho_orig, alto_orig } = det;
      if (ancho_orig && alto_orig) {
        setImgW(cw);
        setImgH(cw * (alto_orig / ancho_orig));
      } else {
        setImgW(cw);
        setImgH(cw * 0.7);
      }
    });
    ro.observe(imgRef.current);
    return () => ro.disconnect();
  }, [det.ancho_orig, det.alto_orig]);

  const badge = estadoBadge(det.obs.length, dark);

  return (
    <div style={sCard}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{det.titulo}</div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 10px',
          borderRadius: 20, background: badge.bg, color: badge.color,
        }}>{det.obs.length} obs.</span>
      </div>

      {/* Imagen del ambiente + hotspots */}
      <div
        ref={imgRef}
        style={{
          position: 'relative',
          width: '100%',
          height: imgH || 180,
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
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
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

        {/* Hotspots — solo elementos con obs, con cálculo de letterbox */}
        {imgW > 0 && det.elementos.map((el, i) => {
          const imgAspect = det.ancho_orig / det.alto_orig;
          const cntAspect = imgW / imgH;
          let renderW: number, renderH: number, offsetX: number, offsetY: number;
          if (imgAspect > cntAspect) {
            renderW = imgW;
            renderH = imgW / imgAspect;
            offsetX = 0;
            offsetY = (imgH - renderH) / 2;
          } else {
            renderH = imgH;
            renderW = imgH * imgAspect;
            offsetX = (imgW - renderW) / 2;
            offsetY = 0;
          }
          const sx     = renderW / det.ancho_orig;
          const sy     = renderH / det.alto_orig;
          const left   = offsetX + el.pos_x * sx;
          const top    = offsetY + el.pos_y * sy;
          const width  = el.ancho * sx;
          const height = el.alto  * sy;

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left, top, width, height,
                border: `2px solid ${dark ? '#f87171' : '#b91c1c'}`,
                background: dark ? 'rgba(248,113,113,0.2)' : 'rgba(185,28,28,0.12)',
                borderRadius: 3,
                boxSizing: 'border-box',
              }}
            >
              <span style={{
                position: 'absolute',
                bottom: '100%', left: 0,
                fontSize: 9, fontWeight: 700,
                color: dark ? '#f87171' : '#b91c1c',
                background: dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)',
                padding: '1px 3px', borderRadius: 2,
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
      <div style={sSecLabel as any}>Fallas registradas</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['#', 'Elemento', 'Tipo', 'Tolerancia', 'Comentario'].map(h => (
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
          {det.obs.map((ob, i) => (
            <tr key={ob.id} style={{ borderBottom: `0.5px solid ${border}` }}>
              <td style={{ padding: '7px 5px', color: textMuted, fontSize: 11 }}>{i + 1}</td>
              <td style={{ padding: '7px 5px', color: textPrimary, fontSize: 12 }}>{ob.elemento}</td>
              <td style={{ padding: '7px 5px', color: textSecondary, fontSize: 11 }}>{ob.tipo_revision}</td>
              <td style={{ padding: '7px 5px', color: textPrimary, fontSize: 12 }}>{ob.tolerancia}</td>
              <td style={{ padding: '7px 5px', color: textSecondary, fontSize: 11 }}>
                {ob.comentario || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RevisionOGResumen;

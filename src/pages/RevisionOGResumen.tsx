// src/pages/RevisionOGResumen.tsx
// Módulo Revisión Tolerancias OG — Pantalla 3: Resumen del departamento
// Solo lectura. Obs agrupadas por ambiente con detalle completo.
// FMS · Junio 2026

import React, { useRef, useState, useMemo } from 'react';
import {
  IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar,
  IonRefresher, IonRefresherContent,
} from '@ionic/react';
import { useIonViewDidEnter } from '@ionic/react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

interface NavState {
  proyecto: { id: string; nombre: string };
  torre:    { id: string; nombre: string };
  depto:    { id: string; numero: string; id_obra?: string };
}

const RevisionOGResumen: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const location = useLocation<NavState>();
  const mounted = useRef(false);

  // ── tokens ────────────────────────────────────────────────────────────────
  const bg            = dark ? '#000000' : '#f0f4f8';
  const cardGrad      = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary = dark ? '#6b7280'  : '#64748b';
  const textMuted     = dark ? '#444444'  : '#94a3b8';
  const toolbar       = dark ? '#000000'  : '#1e3a5f';
  const sepLine       = dark
    ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';
  const azul      = dark ? '#60a5fa' : '#1d4ed8';
  const azulBg    = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const azulBord  = dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe';
  const amarillo  = dark ? '#fbbf24' : '#a16207';
  const amarilloBg  = dark ? 'rgba(251,191,36,0.06)' : '#fffbeb';
  const amarilloBord = dark ? 'rgba(251,191,36,0.2)' : '#fde68a';
  const verde     = dark ? '#4ade80' : '#15803d';
  const verdeBg   = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord = dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0';

  // ── nav state ─────────────────────────────────────────────────────────────
  const { proyecto, torre, depto } = (location.state || {}) as NavState;

  // ── state ─────────────────────────────────────────────────────────────────
  const [obs, setObs]           = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [fotoModal, setFotoModal] = useState<string | null>(null);

  // ── init ──────────────────────────────────────────────────────────────────
  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargar(); }
  });

  const cargar = async () => {
    if (!depto?.id) return;
    setCargando(true);
    const { data } = await supabase
      .from('og_registros')
      .select(`
        id, ambiente, tipo_elemento, tipo_revision,
        elemento, tolerancia, comentario, foto_url, creado_en,
        usuarios(nombre)
      `)
      .eq('departamento_id', depto.id)
      .order('ambiente', { ascending: true })
      .order('creado_en', { ascending: true });
    setObs(data || []);
    setCargando(false);
  };

  const onRefresh = async (e: any) => {
    await cargar();
    e.detail.complete();
  };

  // ── computed ───────────────────────────────────────────────────────────────
  const agrupadas = useMemo(() => {
    const mapa: Record<string, any[]> = {};
    for (const o of obs) {
      const a = o.ambiente || 'Sin ambiente';
      if (!mapa[a]) mapa[a] = [];
      mapa[a].push(o);
    }
    return Object.entries(mapa).map(([ambiente, items]) => ({ ambiente, items }));
  }, [obs]);

  // Color de pill por tipo de elemento
  const pillColor = (tipo: string) => {
    if (tipo === 'Muros') return { bg: amarilloBg, color: amarillo, border: amarilloBord };
    return { bg: azulBg, color: azul, border: azulBord };
  };

  // ── styles ─────────────────────────────────────────────────────────────────
  const sCard: React.CSSProperties = {
    background: cardGrad, borderRadius: 16,
    border: `0.5px solid ${border}`, padding: 14, marginBottom: 10,
  };
  const sSecLabel: React.CSSProperties = {
    fontSize: 9, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: 600, marginBottom: 10,
  };

  // ── guard ─────────────────────────────────────────────────────────────────
  if (!proyecto || !torre || !depto) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
            <IonMenuButton slot="start" menu="menu-lateral"
              style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
            <IonTitle style={{ fontSize: 16 }}>Resumen OG</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg } as any}>
          <div style={{ padding: 32, textAlign: 'center', color: textSecondary, marginTop: 60 }}>
            Accede desde el selector de Revisión OG
          </div>
        </IonContent>
      </IonPage>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral"
            style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>📊 Resumen OG</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <IonRefresher slot="fixed" onIonRefresh={onRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div style={{ padding: 16, paddingBottom: 40 }}>

          {/* Header depto */}
          <div style={{ ...sCard, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: textSecondary, marginBottom: 2 }}>
              {proyecto.nombre} · Torre {torre.nombre}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: textPrimary }}>
                Depto {depto.numero}
                {depto.id_obra && (
                  <span style={{ fontSize: 13, color: textMuted, fontWeight: 400 }}>
                    {' '}— {depto.id_obra}
                  </span>
                )}
              </div>
              <div style={{
                background: verdeBg, color: verde, border: `0.5px solid ${verdeBord}`,
                borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 700,
              }}>
                {obs.length} obs
              </div>
            </div>
          </div>

          {/* KPIs rápidos */}
          {obs.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8, marginBottom: 10,
            }}>
              {[
                {
                  label: 'Ambientes',
                  valor: agrupadas.length,
                  color: azul, bg: azulBg, bord: azulBord,
                },
                {
                  label: 'Muros',
                  valor: obs.filter(o => o.tipo_elemento === 'Muros').length,
                  color: amarillo, bg: amarilloBg, bord: amarilloBord,
                },
                {
                  label: 'Vanos',
                  valor: obs.filter(o => o.tipo_elemento === 'Vanos').length,
                  color: verde, bg: verdeBg, bord: verdeBord,
                },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  background: kpi.bg, border: `0.5px solid ${kpi.bord}`,
                  borderRadius: 12, padding: '10px 8px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>
                    {kpi.valor}
                  </div>
                  <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>
                    {kpi.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: '0.5px', background: sepLine, margin: '16px 0' }} />

          {/* Sin obs */}
          {cargando && (
            <div style={{ textAlign: 'center', padding: 32, color: textMuted }}>
              Cargando...
            </div>
          )}

          {!cargando && obs.length === 0 && (
            <div style={{ ...sCard, textAlign: 'center', padding: '32px 14px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, color: textSecondary }}>Sin observaciones registradas</div>
            </div>
          )}

          {/* Agrupadas por ambiente */}
          {agrupadas.map(({ ambiente, items }) => (
            <div key={ambiente} style={{ marginBottom: 14 }}>

              {/* Header ambiente */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 14 }}>🏠</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>
                  {ambiente}
                </span>
                <span style={{
                  background: azulBg, color: azul, border: `0.5px solid ${azulBord}`,
                  borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                }}>
                  {items.length}
                </span>
              </div>

              {/* Obs del ambiente */}
              {items.map((o: any, i: number) => {
                const pill = pillColor(o.tipo_elemento);
                return (
                  <div
                    key={o.id}
                    style={{
                      ...sCard,
                      marginBottom: i < items.length - 1 ? 8 : 10,
                      padding: '12px 14px',
                    }}
                  >
                    {/* Cabecera obs */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {/* Pill tipo elemento */}
                        <span style={{
                          background: pill.bg, color: pill.color,
                          border: `0.5px solid ${pill.border}`,
                          borderRadius: 20, padding: '2px 8px',
                          fontSize: 11, fontWeight: 600,
                        }}>
                          {o.tipo_elemento}
                        </span>
                        {/* Pill tipo revisión */}
                        <span style={{
                          background: azulBg, color: azul, border: `0.5px solid ${azulBord}`,
                          borderRadius: 20, padding: '2px 8px',
                          fontSize: 11, fontWeight: 600,
                        }}>
                          {o.tipo_revision}
                        </span>
                      </div>
                      {/* Foto miniatura */}
                      {o.foto_url && (
                        <button
                          onClick={() => setFotoModal(o.foto_url)}
                          style={{
                            width: 40, height: 40, borderRadius: 8,
                            border: `0.5px solid ${border}`,
                            overflow: 'hidden', padding: 0, cursor: 'pointer',
                            background: 'transparent', flexShrink: 0,
                          }}
                        >
                          <img
                            src={o.foto_url}
                            alt="obs"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </button>
                      )}
                    </div>

                    {/* Elemento */}
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: textPrimary, marginBottom: 4,
                    }}>
                      {o.elemento || '—'}
                    </div>

                    {/* Tolerancia */}
                    <div style={{
                      fontSize: 14, color: azul, fontWeight: 700, marginBottom: 6,
                    }}>
                      {o.tolerancia || '—'}
                    </div>

                    {/* Comentario */}
                    {o.comentario && (
                      <div style={{
                        fontSize: 12, color: textSecondary,
                        fontStyle: 'italic', marginBottom: 6,
                        padding: '6px 10px',
                        background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                        borderRadius: 8, borderLeft: `2px solid ${border}`,
                      }}>
                        "{o.comentario}"
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{ fontSize: 11, color: textMuted }}>
                      {o.usuarios?.nombre || '—'} ·{' '}
                      {new Date(o.creado_en).toLocaleDateString('es-CL', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Modal foto fullscreen */}
        {fotoModal && (
          <div
            onClick={() => setFotoModal(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <img
              src={fotoModal}
              alt="foto"
              style={{
                maxWidth: '95vw', maxHeight: '90vh',
                objectFit: 'contain', borderRadius: 8,
              }}
            />
            <button
              onClick={() => setFotoModal(null)}
              style={{
                position: 'absolute', top: 16, right: 16,
                width: 36, height: 36, borderRadius: 18,
                border: 'none', background: 'rgba(255,255,255,0.15)',
                color: '#fff', fontSize: 18, cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default RevisionOGResumen;

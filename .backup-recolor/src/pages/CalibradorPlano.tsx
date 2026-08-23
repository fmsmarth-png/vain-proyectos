// src/pages/CalibradorPlano.tsx
// Herramienta de calibración visual de ambientes sobre planos OG
// Solo accesible para administrador desde Admin.tsx
// FMS · Junio 2026

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

const ORIG_W = 674;
const ORIG_H = 961;

const AMB_CODS: Record<string, string> = {
  'Dormitorio 1': 'D1', 'Dormitorio 2': 'D2', 'Dormitorio 3': 'D3',
  'Baño Dormitorio 1': 'BD1', 'Baño Pasillo': 'BP', 'Pasillo': 'PA',
  'Living Comedor': 'LC', 'Terraza': 'TE', 'Cocina': 'CO', 'Acceso': 'AC',
  'Dormitorio': 'D1', 'Baño': 'BA', 'Hall': 'HA', 'Logia': 'LO',
  'Bodega': 'BO', 'Estacionamiento': 'ES',
};

const AMB_OPCIONES = [
  'Dormitorio 1', 'Dormitorio 2', 'Dormitorio 3',
  'Baño Dormitorio 1', 'Baño Pasillo', 'Pasillo',
  'Living Comedor', 'Terraza', 'Cocina', 'Acceso',
  'Dormitorio', 'Baño', 'Hall', 'Logia', 'Bodega', 'Estacionamiento',
];

interface Plano {
  plano_version_id: string;
  plano_url: string;
}

interface Rect {
  nombre: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const CalibradorPlano: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // ── tokens ────────────────────────────────────────────────────────────────
  const bg          = dark ? '#000000' : '#f0f4f8';
  const card        = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border      = dark ? '#1e1e1e' : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted   = dark ? '#444444' : '#94a3b8';
  const toolbar     = dark ? '#000000' : '#1e3a5f';
  const inputBg     = dark ? '#111111' : '#ffffff';
  const inputBorder = dark ? '#1e1e1e' : '#cbd5e1';
  const azul        = dark ? '#60a5fa' : '#1d4ed8';
  const azulBg      = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const azulBord    = dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe';
  const verde       = dark ? '#4ade80' : '#15803d';
  const verdeBg     = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord   = dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0';
  const rojo        = dark ? '#f87171' : '#b91c1c';
  const rojoBg      = dark ? 'rgba(239,68,68,0.06)' : '#fef2f2';
  const rojoBord    = dark ? 'rgba(239,68,68,0.15)' : '#fecaca';

  // ── state ─────────────────────────────────────────────────────────────────
  const [planos, setPlanos]             = useState<Plano[]>([]);
  const [planoSel, setPlanoSel]         = useState<Plano | null>(null);
  const [rects, setRects]               = useState<Rect[]>([]);
  const [selected, setSelected]         = useState<Rect | null>(null);
  const [ambSel, setAmbSel]             = useState('');
  const [contenedorW, setContenedorW]   = useState(0);
  const [imgCargada, setImgCargada]     = useState(false);
  const [guardando, setGuardando]       = useState(false);
  const [status, setStatus]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [cargando, setCargando]         = useState(true);

  // ── init ──────────────────────────────────────────────────────────────────
  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargarPlanos(); }
  });

  const cargarPlanos = async () => {
    setCargando(true);
    const { data } = await supabase
      .from('og_planos')
      .select('plano_version_id, plano_url')
      .eq('activo', true)
      .order('plano_version_id');
    setPlanos(data || []);
    setCargando(false);
  };

  const onPlanoChange = async (pvid: string) => {
    const p = planos.find(x => x.plano_version_id === pvid) || null;
    setPlanoSel(p);
    setRects([]);
    setSelected(null);
    setImgCargada(false);
    setStatus(null);
    if (!p) return;

    const { data } = await supabase
      .from('og_planos_ambientes')
      .select('titulo, pos_x_base, pos_y_base, ancho_base, alto_base')
      .eq('plano_version_id', pvid)
      .eq('activo', true)
      .order('orden');

    setRects((data || []).map((r: any) => ({
      nombre: r.titulo,
      x: r.pos_x_base,
      y: r.pos_y_base,
      w: r.ancho_base,
      h: r.alto_base,
    })));
  };

  // ── medir contenedor ──────────────────────────────────────────────────────
  const medirContenedor = useCallback(() => {
    if (contenedorRef.current) setContenedorW(contenedorRef.current.offsetWidth);
  }, []);

  useEffect(() => {
    medirContenedor();
    window.addEventListener('resize', medirContenedor);
    return () => window.removeEventListener('resize', medirContenedor);
  }, [medirContenedor]);

  const getScale = () => contenedorW > 0 ? contenedorW / ORIG_W : 1;
  const alturaPlano = contenedorW > 0 ? (ORIG_H / ORIG_W) * contenedorW : 0;

  // ── agregar rect ──────────────────────────────────────────────────────────
  const agregarRect = () => {
    if (!ambSel) { setStatus({ msg: 'Selecciona un ambiente primero', ok: false }); return; }
    if (rects.find(r => r.nombre === ambSel)) { setStatus({ msg: `Ya existe "${ambSel}"`, ok: false }); return; }
    const scale = getScale();
    const r: Rect = {
      nombre: ambSel,
      x: Math.round(60 / scale),
      y: Math.round(60 / scale),
      w: Math.round(160 / scale),
      h: Math.round(110 / scale),
    };
    setRects(prev => [...prev, r]);
    setSelected(r);
    setTimeout(medirContenedor, 50);
  };

  const eliminarRect = () => {
    if (!selected) return;
    setRects(prev => prev.filter(r => r !== selected));
    setSelected(null);
  };

  // ── drag ──────────────────────────────────────────────────────────────────
  const startDrag = (e: React.MouseEvent | React.TouchEvent, r: Rect) => {
    e.preventDefault();
    const scale = getScale();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const ox = r.x, oy = r.y;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const cy = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
      r.x = Math.max(0, Math.round(ox + (cx - clientX) / scale));
      r.y = Math.max(0, Math.round(oy + (cy - clientY) / scale));
      setRects(prev => [...prev]);
      setSelected(r);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  const startResize = (e: React.MouseEvent | React.TouchEvent, r: Rect) => {
    e.preventDefault();
    e.stopPropagation();
    const scale = getScale();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const ow = r.w, oh = r.h;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const cy = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
      r.w = Math.max(20, Math.round(ow + (cx - clientX) / scale));
      r.h = Math.max(20, Math.round(oh + (cy - clientY) / scale));
      setRects(prev => [...prev]);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  // ── guardar ───────────────────────────────────────────────────────────────
  const guardar = async () => {
    if (!planoSel) return;
    if (rects.length === 0) { setStatus({ msg: 'No hay ambientes configurados', ok: false }); return; }
    setGuardando(true);
    setStatus(null);
    try {
      await supabase
        .from('og_planos_ambientes')
        .delete()
        .eq('plano_version_id', planoSel.plano_version_id);

      const rows = rects.map((r, i) => ({
        plano_version_id: planoSel.plano_version_id,
        titulo:           r.nombre,
        ambiente_cod:     AMB_CODS[r.nombre] || r.nombre.substring(0, 3).toUpperCase(),
        pos_x_base:       r.x,
        pos_y_base:       r.y,
        ancho_base:       r.w,
        alto_base:        r.h,
        orden:            i + 1,
        activo:           true,
      }));

      const { error } = await supabase.from('og_planos_ambientes').insert(rows);
      if (error) throw error;
      setStatus({ msg: `✓ ${rows.length} ambiente(s) guardados para ${planoSel.plano_version_id}`, ok: true });
    } catch (e: any) {
      setStatus({ msg: 'Error: ' + (e.message || 'desconocido'), ok: false });
    } finally {
      setGuardando(false);
    }
  };

  // ── styles ────────────────────────────────────────────────────────────────
  const sCard: React.CSSProperties = {
    background: card, borderRadius: 16,
    border: `0.5px solid ${border}`, padding: 14, marginBottom: 10,
  };
  const sSecLabel: React.CSSProperties = {
    fontSize: 9, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: 600, marginBottom: 10,
  };
  const sInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`,
    borderRadius: 10, padding: '8px 12px', fontSize: 14,
    background: inputBg, color: textPrimary, outline: 'none', height: 44,
  };
  const sBtn = (color: string, bgColor: string, bdColor: string): React.CSSProperties => ({
    flex: 1, height: 40, borderRadius: 10, border: `0.5px solid ${bdColor}`,
    background: bgColor, color, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  });

  const scale = getScale();

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral"
            style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>📐 Calibrador de Planos OG</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16, paddingBottom: 60 }}>

          {/* Selector de plano */}
          <div style={sCard}>
            <div style={sSecLabel}>1 · SELECCIONA EL PLANO</div>
            {cargando ? (
              <div style={{ fontSize: 13, color: textMuted }}>Cargando planos...</div>
            ) : (
              <select
                style={sInput}
                value={planoSel?.plano_version_id || ''}
                onChange={e => onPlanoChange(e.target.value)}
              >
                <option value="">-- selecciona plano --</option>
                {planos.map(p => (
                  <option key={p.plano_version_id} value={p.plano_version_id}>
                    {p.plano_version_id}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Editor visual */}
          {planoSel && (
            <>
              {/* Toolbar de ambiente */}
              <div style={sCard}>
                <div style={sSecLabel}>2 · AGREGAR AMBIENTE</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <select
                    style={{ ...sInput, flex: 1 }}
                    value={ambSel}
                    onChange={e => setAmbSel(e.target.value)}
                  >
                    <option value="">-- ambiente --</option>
                    {AMB_OPCIONES.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <button
                    onClick={agregarRect}
                    style={{ ...sBtn(azul, azulBg, azulBord), flex: 'none', padding: '0 16px' }}
                  >
                    + Agregar
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={eliminarRect}
                    disabled={!selected}
                    style={{ ...sBtn(rojo, rojoBg, rojoBord), opacity: selected ? 1 : 0.4 }}
                  >
                    🗑 Eliminar seleccionado
                  </button>
                  <button
                    onClick={guardar}
                    disabled={guardando || rects.length === 0}
                    style={{ ...sBtn('#fff', '#1e3a5f', '#1e3a5f'), opacity: rects.length === 0 ? 0.4 : 1 }}
                  >
                    {guardando ? 'Guardando...' : '💾 Guardar'}
                  </button>
                </div>
              </div>

              {/* Info del seleccionado */}
              {selected && (
                <div style={{
                  ...sCard, padding: '10px 14px',
                  background: azulBg, border: `0.5px solid ${azulBord}`,
                }}>
                  <div style={{ fontSize: 12, color: azul, fontWeight: 600 }}>
                    {selected.nombre} — x:{selected.x} y:{selected.y} w:{selected.w} h:{selected.h}
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 3 }}>
                    Arrastra para mover · Esquina inferior derecha para redimensionar
                  </div>
                </div>
              )}

              {/* Status */}
              {status && (
                <div style={{
                  padding: '10px 14px', borderRadius: 12, marginBottom: 10, fontSize: 13, fontWeight: 600,
                  background: status.ok ? verdeBg : rojoBg,
                  border: `0.5px solid ${status.ok ? verdeBord : rojoBord}`,
                  color: status.ok ? verde : rojo,
                }}>
                  {status.msg}
                </div>
              )}

              {/* Instrucción */}
              <div style={{ fontSize: 12, color: textSecondary, textAlign: 'center', marginBottom: 8 }}>
                3 · POSICIONA LOS RECTÁNGULOS SOBRE EL PLANO
              </div>

              {/* Plano con hotspots */}
              <div
                ref={contenedorRef}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: alturaPlano > 0 ? alturaPlano : 'auto',
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: `0.5px solid ${border}`,
                  background: dark ? '#0a0a0a' : '#f8fafc',
                  touchAction: 'none',
                }}
              >
                <img
                  ref={imgRef}
                  src={planoSel.plano_url}
                  alt={`Plano ${planoSel.plano_version_id}`}
                  onLoad={() => { setImgCargada(true); medirContenedor(); }}
                  style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
                />

                {imgCargada && contenedorW > 0 && rects.map((r, i) => {
                  const isSel = r === selected;
                  return (
                    <div
                      key={i}
                      onMouseDown={e => { setSelected(r); startDrag(e, r); }}
                      onTouchStart={e => { setSelected(r); startDrag(e, r); }}
                      style={{
                        position: 'absolute',
                        left:   Math.round(r.x * scale),
                        top:    Math.round(r.y * scale),
                        width:  Math.round(r.w * scale),
                        height: Math.round(r.h * scale),
                        border: `2px solid ${isSel ? '#ef4444' : 'rgba(37,99,235,0.8)'}`,
                        background: isSel ? 'rgba(239,68,68,0.15)' : 'rgba(37,99,235,0.15)',
                        cursor: 'move',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                        touchAction: 'none',
                      }}
                    >
                      <span style={{
                        fontSize: Math.max(9, scale * 14),
                        fontWeight: 700,
                        color: isSel ? '#991b1b' : '#1e3a5f',
                        textShadow: '0 1px 2px rgba(255,255,255,0.9)',
                        pointerEvents: 'none',
                        textAlign: 'center',
                        wordBreak: 'break-word',
                        maxWidth: '90%',
                        lineHeight: 1.2,
                      }}>
                        {r.nombre}
                      </span>

                      {/* Handle de resize */}
                      {isSel && (
                        <div
                          onMouseDown={e => startResize(e, r)}
                          onTouchStart={e => startResize(e, r)}
                          style={{
                            position: 'absolute',
                            bottom: -6, right: -6,
                            width: 14, height: 14,
                            background: '#fff',
                            border: '2px solid #ef4444',
                            borderRadius: 3,
                            cursor: 'se-resize',
                            zIndex: 10,
                            touchAction: 'none',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Listado de rectángulos */}
              {rects.length > 0 && (
                <div style={{ ...sCard, marginTop: 10 }}>
                  <div style={sSecLabel}>AMBIENTES CONFIGURADOS ({rects.length})</div>
                  {rects.map((r, i) => (
                    <div
                      key={i}
                      onClick={() => setSelected(r)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 10px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                        background: r === selected ? azulBg : 'transparent',
                        border: `0.5px solid ${r === selected ? azulBord : border}`,
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{r.nombre}</span>
                        <span style={{ fontSize: 10, color: textMuted, marginLeft: 8 }}>
                          x:{r.x} y:{r.y} w:{r.w} h:{r.h}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: textMuted }}>#{i + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!planoSel && !cargando && (
            <div style={{
              ...sCard, textAlign: 'center', padding: '40px 20px',
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗺️</div>
              <div style={{ fontSize: 14, color: textSecondary }}>
                Selecciona un plano para comenzar a calibrar los ambientes
              </div>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default CalibradorPlano;

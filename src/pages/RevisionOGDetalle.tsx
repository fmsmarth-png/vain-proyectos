// src/pages/RevisionOGDetalle.tsx
// Módulo Revisión Tolerancias OG — Pantalla 2: Formulario de registro
// Flujo: Ambiente → Tipo elemento → Tipo revisión → Elemento → Tolerancia → Foto/Comentario → Guardar
// FMS · Junio 2026

import React, { useRef, useState, useEffect } from 'react';
import {
  IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { useIonViewDidEnter } from '@ionic/react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';
import { comprimirImagen } from '../utils/comprimirImagen';
import {
  AMBIENTES_DEFAULT,
  ELEMENTOS_DEFAULT,
  REVISIONES_POR_TIPO,
  OG_REVISION_QUERY,
  LABEL_REVISION,
  normalizarAmbienteCatalogo,
  getSubtipoCod,
} from '../utils/ogSubtipos';

interface NavState {
  proyecto: { id: string; nombre: string };
  torre:    { id: string; nombre: string };
  depto:    { id: string; numero: string; id_obra?: string };
  cerrado:  boolean;
}

const RevisionOGDetalle: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const location = useLocation<NavState>();
  const mounted = useRef(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  // ── tokens ────────────────────────────────────────────────────────────────
  const bg            = dark ? '#000000' : '#f0f4f8';
  const cardGrad      = dark ? 'linear-gradient(135deg, #0e0e0e 0%, #141414 100%)' : '#ffffff';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb'  : '#0f172a';
  const textSecondary = dark ? '#6b7280'  : '#64748b';
  const textMuted     = dark ? '#444444'  : '#94a3b8';
  const toolbar       = dark ? '#000000'  : '#1e3a5f';
  const inputBg       = dark ? '#111111'  : '#ffffff';
  const inputBorder   = dark ? '#1e1e1e'  : '#cbd5e1';
  const rojo      = dark ? '#f87171' : '#b91c1c';
  const rojoBg    = dark ? 'rgba(239,68,68,0.06)' : '#fef2f2';
  const rojoBord  = dark ? 'rgba(239,68,68,0.15)' : '#fecaca';
  const azul      = dark ? '#60a5fa' : '#1d4ed8';
  const azulBg    = dark ? 'rgba(96,165,250,0.06)' : '#eff6ff';
  const azulBord  = dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe';
  const verde     = dark ? '#4ade80' : '#15803d';
  const verdeBg   = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord = dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0';

  // ── nav state ─────────────────────────────────────────────────────────────
  const { proyecto, torre, depto, cerrado } = (location.state || {}) as NavState;

  // ── state ─────────────────────────────────────────────────────────────────
  const [usuario, setUsuario]     = useState<any>(null);
  const [ambientes, setAmbientes] = useState<string[]>([]);

  // Cadena de selección
  const [ambiente, setAmbiente]         = useState('');
  const [tipoElemento, setTipoElemento] = useState<'Muros' | 'Vanos' | ''>('');
  const [tipoRevision, setTipoRevision] = useState('');
  const [elementos, setElementos]       = useState<string[]>([]);
  const [elemento, setElemento]         = useState('');
  const [tolerancias, setTolerancias]   = useState<string[]>([]);
  const [tolerancia, setTolerancia]     = useState('');

  // Datos extra
  const [comentario, setComentario] = useState('');
  const [fotoPreview, setFotoPreview]       = useState('');
  const [fotoComprimida, setFotoComprimida] = useState<Blob | null>(null);

  // UI
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado]   = useState(false);
  const [error, setError]         = useState('');

  // ── init ──────────────────────────────────────────────────────────────────
  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; inicializar(); }
  });

  const inicializar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: u } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('email', user.email)
      .maybeSingle();
    setUsuario(u);

    // Cargar ambientes desde og_config_ambientes
    const { data: ambData } = await supabase
      .from('og_config_ambientes')
      .select('ambiente')
      .eq('existe', true)
      .order('ambiente');

    const lista = [...new Set((ambData || []).map((r: any) => r.ambiente as string))];
    setAmbientes(lista.length > 0 ? lista : AMBIENTES_DEFAULT);
  };

  // ── efectos de la cadena ──────────────────────────────────────────────────

  // Cada vez que cambia ambiente o tipoElemento → recargar elementos
  useEffect(() => {
    if (!ambiente || !tipoElemento) {
      setElementos([]);
      setElemento('');
      setTolerancias([]);
      setTolerancia('');
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('og_elementos_detalle')
        .select('elemento, subtipo_cod')
        .eq('ambiente', ambiente)
        .eq('activo', true)
        .order('elemento');

      let lista: string[] = [];
      if (data && data.length > 0) {
        // Vanos: tienen subtipo_cod definido; Muros: subtipo_cod vacío o nulo
        if (tipoElemento === 'Vanos') {
          lista = (data as any[])
            .filter((e: any) => !!e.subtipo_cod)
            .map((e: any) => e.elemento as string);
        } else {
          lista = (data as any[])
            .filter((e: any) => !e.subtipo_cod)
            .map((e: any) => e.elemento as string);
        }
      }

      const unique = [...new Set(lista)];
      setElementos(unique.length > 0 ? unique : ELEMENTOS_DEFAULT[tipoElemento] || []);
      setElemento('');
      setTolerancias([]);
      setTolerancia('');
    })();
  }, [ambiente, tipoElemento]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cada vez que cambia el elemento → recargar tolerancias
  useEffect(() => {
    if (!elemento || !tipoElemento || !tipoRevision || !ambiente) {
      setTolerancias([]);
      setTolerancia('');
      return;
    }
    (async () => {
      const key = `${tipoElemento}-${tipoRevision}`;
      const qp = OG_REVISION_QUERY[key];
      if (!qp) return;

      const ambCat = normalizarAmbienteCatalogo(ambiente);

      const { data } = await supabase
        .from('og_catalogo')
        .select('tolerancia')
        .eq('revision', qp.revision)
        .eq('item_revision', qp.itemRevision)
        .eq('elemento', elemento)
        .eq('ambiente', ambCat)
        .eq('activo', true)
        .order('tolerancia');

      const lista = [...new Set((data || []).map((r: any) => r.tolerancia as string))];
      setTolerancias(lista);
      setTolerancia('');
    })();
  }, [elemento, tipoElemento, tipoRevision, ambiente]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── helpers de reset ──────────────────────────────────────────────────────
  const resetDesdeTipoElemento = () => {
    setTipoRevision('');
    setElementos([]);
    setElemento('');
    setTolerancias([]);
    setTolerancia('');
  };

  const resetDesdeTipoRevision = () => {
    setElemento('');
    setTolerancias([]);
    setTolerancia('');
  };

  // ── foto ──────────────────────────────────────────────────────────────────
  const seleccionarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Preview inmediato
    const prev = URL.createObjectURL(file);
    setFotoPreview(prev);
    // Comprimir en background
    const blob = await comprimirImagen(file);
    setFotoComprimida(blob);
  };

  const limpiarFoto = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoPreview('');
    setFotoComprimida(null);
    if (fotoRef.current) fotoRef.current.value = '';
  };

  // ── guardar ───────────────────────────────────────────────────────────────
  const guardar = async () => {
    setError('');
    if (!ambiente)     return setError('Selecciona un ambiente');
    if (!tipoElemento) return setError('Selecciona el tipo de elemento');
    if (!tipoRevision) return setError('Selecciona el tipo de revisión');
    if (!elemento)     return setError('Selecciona el elemento');
    if (!tolerancia)   return setError('Selecciona la tolerancia');

    setGuardando(true);
    try {
      let fotoUrl: string | null = null;

      if (fotoComprimida) {
        const ts  = Date.now();
        const path = `og/${depto.id}/${ts}.jpg`;
        const { error: storErr } = await supabase.storage
          .from('fotos-registros')
          .upload(path, fotoComprimida, { contentType: 'image/jpeg', upsert: false });
        if (!storErr) {
          const { data: urlData } = supabase.storage
            .from('fotos-registros')
            .getPublicUrl(path);
          fotoUrl = urlData.publicUrl;
        }
      }

      const { error: insErr } = await supabase.from('og_registros').insert({
        proyecto_id:     proyecto.id,
        torre_id:        torre.id,
        departamento_id: depto.id,
        ambiente,
        tipo_elemento:   tipoElemento,
        tipo_revision:   tipoRevision,
        subtipo_cod:     getSubtipoCod(elemento),
        elemento,
        tolerancia,
        comentario:      comentario.trim() || null,
        foto_url:        fotoUrl,
        usuario_id:      usuario?.id ?? null,
        sesion_id:       `${usuario?.id ?? 'anon'}_${Date.now()}`,
      });

      if (insErr) throw insErr;

      // Reset formulario (mantiene ambiente seleccionado para registro continuo)
      setTipoElemento('');
      resetDesdeTipoElemento();
      setComentario('');
      limpiarFoto();
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);

    } catch (e: any) {
      setError(e.message || 'Error al guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
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
  const sInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: `0.5px solid ${inputBorder}`,
    borderRadius: 10, padding: '8px 12px', fontSize: 14,
    background: inputBg, color: textPrimary, outline: 'none', height: 44,
  };
  const sToggle = (activo: boolean): React.CSSProperties => ({
    flex: 1, height: 44, borderRadius: 10,
    border: `0.5px solid ${activo ? azulBord : border}`,
    background: activo ? azulBg : 'transparent',
    color: activo ? azul : textSecondary,
    fontSize: 14, fontWeight: activo ? 700 : 400,
    cursor: 'pointer', transition: 'all 0.15s',
  });

  // ── guard: acceso sin state ───────────────────────────────────────────────
  if (!proyecto || !torre || !depto) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
            <IonMenuButton slot="start" menu="menu-lateral"
              style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' } as any} />
            <IonTitle style={{ fontSize: 16 }}>Revisión OG</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': bg } as any}>
          <div style={{ padding: 32, textAlign: 'center', color: textSecondary, marginTop: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📐</div>
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
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>📐 Registrar Tolerancia</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 16, paddingBottom: 40 }}>

          {/* Info depto */}
          <div style={{ ...sCard, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: textSecondary, marginBottom: 2 }}>
              {proyecto.nombre} · Torre {torre.nombre}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary }}>
              Depto {depto.numero}
              {depto.id_obra && (
                <span style={{ fontSize: 13, color: textMuted, fontWeight: 400 }}>
                  {' '}— {depto.id_obra}
                </span>
              )}
            </div>
          </div>

          {/* Banner cerrado */}
          {cerrado && (
            <div style={{
              background: rojoBg, border: `0.5px solid ${rojoBord}`,
              borderRadius: 12, padding: '10px 14px', marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>🔒</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: rojo }}>Departamento cerrado</div>
                <div style={{ fontSize: 11, color: textSecondary }}>No se pueden agregar observaciones</div>
              </div>
            </div>
          )}

          {/* ── 1. Ambiente ───────────────────────────────────────── */}
          <div style={sCard}>
            <div style={sSecLabel}>1 · AMBIENTE</div>
            <select
              style={sInput}
              value={ambiente}
              disabled={cerrado}
              onChange={e => {
                setAmbiente(e.target.value);
                setTipoElemento('');
                resetDesdeTipoElemento();
              }}
            >
              <option value="">Selecciona ambiente...</option>
              {ambientes.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* ── 2. Tipo de elemento ───────────────────────────────── */}
          {ambiente && (
            <div style={sCard}>
              <div style={sSecLabel}>2 · TIPO DE ELEMENTO</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['Muros', 'Vanos'] as const).map(t => (
                  <button
                    key={t}
                    style={sToggle(tipoElemento === t)}
                    disabled={cerrado}
                    onClick={() => {
                      setTipoElemento(t);
                      resetDesdeTipoElemento();
                    }}
                  >
                    {t === 'Muros' ? '🧱 Muros' : '🚪 Vanos'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 3. Tipo de revisión ───────────────────────────────── */}
          {tipoElemento && (
            <div style={sCard}>
              <div style={sSecLabel}>3 · TIPO DE REVISIÓN</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(REVISIONES_POR_TIPO[tipoElemento] || []).map(r => (
                  <button
                    key={r}
                    style={sToggle(tipoRevision === r)}
                    disabled={cerrado}
                    onClick={() => {
                      setTipoRevision(r);
                      resetDesdeTipoRevision();
                    }}
                  >
                    {LABEL_REVISION[r] ?? r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 4. Elemento específico ────────────────────────────── */}
          {tipoRevision && (
            <div style={sCard}>
              <div style={sSecLabel}>4 · ELEMENTO</div>
              {elementos.length === 0 ? (
                <div style={{ fontSize: 13, color: textMuted, padding: '8px 0' }}>
                  Cargando elementos...
                </div>
              ) : (
                <select
                  style={sInput}
                  value={elemento}
                  disabled={cerrado}
                  onChange={e => {
                    setElemento(e.target.value);
                    setTolerancias([]);
                    setTolerancia('');
                  }}
                >
                  <option value="">Selecciona elemento...</option>
                  {elementos.map(el => (
                    <option key={el} value={el}>{el}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── 5. Tolerancia ─────────────────────────────────────── */}
          {elemento && (
            <div style={sCard}>
              <div style={sSecLabel}>5 · TOLERANCIA</div>
              {tolerancias.length === 0 ? (
                <div style={{
                  fontSize: 13, color: textMuted, textAlign: 'center',
                  padding: '10px 0', fontStyle: 'italic',
                }}>
                  Sin tolerancias en catálogo para esta combinación.
                  <br />
                  <span style={{ fontSize: 11 }}>Verifica que el catálogo esté cargado.</span>
                </div>
              ) : (
                <select
                  style={sInput}
                  value={tolerancia}
                  disabled={cerrado}
                  onChange={e => setTolerancia(e.target.value)}
                >
                  <option value="">Selecciona tolerancia...</option>
                  {tolerancias.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ── 6. Comentario y foto ──────────────────────────────── */}
          {elemento && (
            <div style={sCard}>
              <div style={sSecLabel}>6 · COMENTARIO Y FOTO (OPCIONALES)</div>

              <div style={{ fontSize: 11, color: textSecondary, marginBottom: 4 }}>Comentario</div>
              <textarea
                style={{
                  ...sInput, height: 'auto', resize: 'none',
                  lineHeight: 1.6, paddingTop: 10, marginBottom: 14,
                } as React.CSSProperties}
                rows={3}
                value={comentario}
                disabled={cerrado}
                onChange={e => setComentario(e.target.value)}
                placeholder="Observación adicional..."
              />

              <div style={{ fontSize: 11, color: textSecondary, marginBottom: 6 }}>Foto</div>
              <input
                ref={fotoRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={seleccionarFoto}
              />

              {!fotoPreview ? (
                <button
                  onClick={() => fotoRef.current?.click()}
                  disabled={cerrado}
                  style={{
                    width: '100%', height: 80, borderRadius: 10,
                    border: `1.5px dashed ${border}`, background: 'transparent',
                    color: textMuted, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  📷 Agregar foto
                </button>
              ) : (
                <div style={{ position: 'relative' }}>
                  <img
                    src={fotoPreview}
                    alt="preview"
                    style={{
                      width: '100%', borderRadius: 10,
                      maxHeight: 220, objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                  <button
                    onClick={limpiarFoto}
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 28, height: 28, borderRadius: 14,
                      border: 'none', background: 'rgba(0,0,0,0.65)',
                      color: '#fff', fontSize: 13, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: rojoBg, border: `0.5px solid ${rojoBord}`,
              borderRadius: 10, padding: '10px 14px',
              marginBottom: 10, fontSize: 13, color: rojo,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Flash guardado */}
          {guardado && (
            <div style={{
              background: verdeBg, border: `0.5px solid ${verdeBord}`,
              borderRadius: 10, padding: '10px 14px',
              marginBottom: 10, fontSize: 13, color: verde, fontWeight: 600,
            }}>
              ✅ Observación guardada correctamente
            </div>
          )}

          {/* Botón guardar — solo visible cuando hay tolerancia */}
          {tolerancia && !cerrado && (
            <button
              onClick={guardar}
              disabled={guardando}
              style={{
                width: '100%', height: 54, borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: guardando ? 'not-allowed' : 'pointer',
                opacity: guardando ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {guardando ? 'Guardando...' : '💾 Guardar observación'}
            </button>
          )}

        </div>
      </IonContent>
    </IonPage>
  );
};

export default RevisionOGDetalle;

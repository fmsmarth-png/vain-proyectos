// src/pages/AdminGestionPlanos.tsx
// Gestión de planos OG: crear, clonar, subir imágenes, asignar grupo_imagen
// Estilo unificado con la app (dark/light theme)
// FMS · Septiembre 2026

import React, { useState, useEffect, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonMenuButton,
} from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';

interface Plano {
  id: string;
  plano_version_id: string;
  tipo_depto: string | null;
  orientacion: string | null;
  plano_url: string | null;
  activo: boolean;
  calibration_w: number | null;
  calibration_h: number | null;
  deptos_count?: number;
  ambientes_count?: number;
}

interface Ambiente {
  id: string;
  plano_version_id: string;
  titulo: string;
  ambiente_cod: string;
  grupo_imagen: string | null;
  pos_x_base: number;
  pos_y_base: number;
  ancho_base: number;
  alto_base: number;
  orden: number;
  activo: boolean;
}

interface GrupoImagen {
  grupo_imagen: string;
  imagen_url: string;
  activo: boolean;
  elementos: number;
}

const AdminGestionPlanos: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg          = dark ? '#0B1220' : '#f0f4f8';
  const card        = dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#ffffff';
  const border      = dark ? '#243550'  : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb'  : '#0f172a';
  const textMuted   = dark ? '#5D728F'  : '#94a3b8';
  const toolbar     = dark ? '#0E1728'  : '#1e3a5f';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const inputBg     = dark ? '#1B2C48'  : '#ffffff';
  const inputBorder = dark ? '#243550'  : '#cbd5e1';
  const azul        = dark ? '#60a5fa'  : '#1d4ed8';
  const azulBg      = dark ? 'rgba(96,165,250,0.08)' : '#eff6ff';
  const azulBord    = dark ? 'rgba(96,165,250,0.2)'  : '#bfdbfe';
  const verde       = dark ? '#4ade80'  : '#15803d';
  const verdeBg     = dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4';
  const verdeBord   = dark ? 'rgba(74,222,128,0.2)'  : '#bbf7d0';
  const rojo        = dark ? '#f87171'  : '#b91c1c';
  const rojoBg      = dark ? 'rgba(239,68,68,0.06)'  : '#fef2f2';
  const rojoBord    = dark ? 'rgba(239,68,68,0.15)'  : '#fecaca';
  const naranja     = dark ? '#fb923c'  : '#ea580c';
  const naranjaBg   = dark ? 'rgba(251,146,60,0.08)' : '#fff7ed';
  const naranjaBord = dark ? 'rgba(251,146,60,0.2)'  : '#fed7aa';

  const sInput: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    border: `0.5px solid ${inputBorder}`, borderRadius: 10,
    padding: '8px 12px', fontSize: 13,
    background: inputBg, color: textPrimary, outline: 'none', height: 40,
  };
  const sLabel: React.CSSProperties = {
    fontSize: 9, color: textMuted, textTransform: 'uppercase',
    letterSpacing: '1.5px', fontWeight: 600, marginBottom: 6,
  };
  const sCard: React.CSSProperties = {
    background: card, borderRadius: 14,
    border: `0.5px solid ${border}`, padding: 12, marginBottom: 10,
  };
  const sBtn = (color: string, bgColor: string, borderColor: string, disabled = false): React.CSSProperties => ({
    height: 36, borderRadius: 10, fontSize: 12, fontWeight: 600,
    border: `0.5px solid ${borderColor}`, background: bgColor,
    color, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, padding: '0 14px',
  });

  // State
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ambientesPorPlano, setAmbientesPorPlano] = useState<Record<string, Ambiente[]>>({});
  const [gruposImagen, setGruposImagen] = useState<GrupoImagen[]>([]);
  const [planoExpandido, setPlanoExpandido] = useState<string | null>(null);
  const [cambios, setCambios] = useState<Record<string, string>>({});
  const [guardandoAmb, setGuardandoAmb] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  // Crear plano
  const [showCrear, setShowCrear] = useState(false);
  const [nuevoId, setNuevoId] = useState('');
  const [clonarDesde, setClonarDesde] = useState('');
  const [clonarGrupos, setClonarGrupos] = useState(false);
  const [sufijoGrupo, setSufijoGrupo] = useState('');
  const [creando, setCreando] = useState(false);

  // Nuevo grupo imagen
  const [showNuevoGrupo, setShowNuevoGrupo] = useState(false);
  const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState('');
  const [nuevoGrupoFile, setNuevoGrupoFile] = useState<File | null>(null);
  const [nuevoGrupoPreview, setNuevoGrupoPreview] = useState<string | null>(null);
  const [clonarElemDesde, setClonarElemDesde] = useState('');
  const [creandoGrupo, setCreandoGrupo] = useState(false);

  // Upload
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const grupoFileRef = useRef<HTMLInputElement>(null);
  const [uploadPlanoId, setUploadPlanoId] = useState<string | null>(null);

  // ── Load ──

  const cargarGruposImagen = async () => {
    const { data } = await supabase.from('og_imagenes_ambiente')
      .select('grupo_imagen, imagen_url, activo').order('grupo_imagen');
    const { data: elems } = await supabase.from('og_elementos_ambiente').select('grupo_imagen');
    const m = new Map<string, number>();
    (elems ?? []).forEach(e => m.set(e.grupo_imagen, (m.get(e.grupo_imagen) ?? 0) + 1));
    setGruposImagen((data ?? []).map(g => ({ ...g, elementos: m.get(g.grupo_imagen) ?? 0 })));
  };

  const cargarPlanos = async () => {
    setCargando(true);
    const { data: raw } = await supabase.from('og_planos').select('*').order('plano_version_id');
    const { data: deptos } = await supabase.from('departamentos').select('plano_version_id');
    const dc = new Map<string, number>();
    (deptos ?? []).forEach(d => { if (d.plano_version_id) dc.set(d.plano_version_id, (dc.get(d.plano_version_id) ?? 0) + 1); });
    const { data: ambs } = await supabase.from('og_planos_ambientes').select('plano_version_id').eq('activo', true);
    const ac = new Map<string, number>();
    (ambs ?? []).forEach(a => ac.set(a.plano_version_id, (ac.get(a.plano_version_id) ?? 0) + 1));
    setPlanos((raw ?? []).map(p => ({ ...p, deptos_count: dc.get(p.plano_version_id) ?? 0, ambientes_count: ac.get(p.plano_version_id) ?? 0 })));
    setCargando(false);
  };

  useEffect(() => { cargarPlanos(); cargarGruposImagen(); }, []);

  const cargarAmbientes = async (pvId: string) => {
    if (ambientesPorPlano[pvId]) return;
    const { data } = await supabase.from('og_planos_ambientes').select('*').eq('plano_version_id', pvId).order('orden');
    if (data) setAmbientesPorPlano(prev => ({ ...prev, [pvId]: data }));
  };

  const toggleExpand = (pvId: string) => {
    if (planoExpandido === pvId) { setPlanoExpandido(null); return; }
    setPlanoExpandido(pvId);
    cargarAmbientes(pvId);
  };

  // ── Grupo imagen changes ──

  const setCambioGrupo = (ambId: string, grupo: string) => setCambios(prev => ({ ...prev, [ambId]: grupo }));

  const guardarCambios = async (pvId: string) => {
    const ambs = ambientesPorPlano[pvId] ?? [];
    const pendientes = ambs.filter(a => cambios[a.id] !== undefined);
    if (!pendientes.length) return;
    setGuardandoAmb(true);
    let ok = 0;
    for (const c of pendientes) {
      const { error } = await supabase.from('og_planos_ambientes').update({ grupo_imagen: cambios[c.id] }).eq('id', c.id);
      if (!error) ok++;
    }
    const nuevosCambios = { ...cambios };
    pendientes.forEach(c => delete nuevosCambios[c.id]);
    setCambios(nuevosCambios);
    const { data } = await supabase.from('og_planos_ambientes').select('*').eq('plano_version_id', pvId).order('orden');
    if (data) setAmbientesPorPlano(prev => ({ ...prev, [pvId]: data }));
    setStatus({ msg: `✓ ${ok} ambiente(s) actualizado(s)`, ok: true });
    setGuardandoAmb(false);
  };

  const tieneCambios = (pvId: string) => (ambientesPorPlano[pvId] ?? []).some(a => cambios[a.id] !== undefined);

  const getGrupoUrl = (g: string | null) => g ? gruposImagen.find(x => x.grupo_imagen === g)?.imagen_url ?? null : null;

  const sugerirGrupos = (cod: string) => {
    const map: Record<string, string[]> = { D1: ['D1_'], D2: ['D2_'], D3: ['D3_'], BD1: ['BD1_'], BP: ['BPASILLO_'], PA: ['PASILLO_'], LC: ['LC_'], CO: ['Cocina_', 'COCINA_'], AC: ['ACC_'], TE: ['TERRAZA_', 'TE_'] };
    const pf = map[cod] ?? [cod];
    const sug = gruposImagen.filter(g => pf.some(p => g.grupo_imagen.toUpperCase().startsWith(p.toUpperCase())));
    return sug.length > 0 ? sug : gruposImagen.filter(g => g.activo);
  };

  // ── Create / Clone plano ──

  const crearPlano = async () => {
    if (!nuevoId.trim()) return;
    setCreando(true);
    if (clonarDesde) {
      const { data, error } = await supabase.rpc('og_clonar_plano', {
        p_origen_plano_version_id: clonarDesde, p_nuevo_plano_version_id: nuevoId.trim(),
        p_clonar_grupos_imagen: clonarGrupos, p_sufijo_grupo: sufijoGrupo.trim() || null,
      });
      if (error) setStatus({ msg: 'Error: ' + error.message, ok: false });
      else if (data && !data.ok) setStatus({ msg: data.error, ok: false });
      else { setStatus({ msg: `✓ Plano "${nuevoId}" creado con ${data?.ambientes_clonados ?? 0} ambientes`, ok: true }); setShowCrear(false); setNuevoId(''); setClonarDesde(''); cargarPlanos(); }
    } else {
      const { error } = await supabase.from('og_planos').insert({ plano_version_id: nuevoId.trim(), activo: true });
      if (error) setStatus({ msg: 'Error: ' + error.message, ok: false });
      else { setStatus({ msg: `✓ Plano "${nuevoId}" creado`, ok: true }); setShowCrear(false); setNuevoId(''); cargarPlanos(); }
    }
    setCreando(false);
  };

  // ── Upload plano image ──

  const subirImagen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadPlanoId) return;
    setSubiendo(true);
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${uploadPlanoId}.${ext}`;
    const { error: ue } = await supabase.storage.from('og_planos').upload(path, file, { upsert: true });
    if (ue) { setStatus({ msg: 'Error: ' + ue.message, ok: false }); setSubiendo(false); return; }
    const { data: ud } = supabase.storage.from('og_planos').getPublicUrl(path);
    await supabase.from('og_planos').update({ plano_url: ud.publicUrl }).eq('plano_version_id', uploadPlanoId);
    setStatus({ msg: '✓ Imagen subida', ok: true }); cargarPlanos();
    setSubiendo(false); setUploadPlanoId(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // ── Create grupo imagen ──

  const handleGrupoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNuevoGrupoFile(file);
    const r = new FileReader();
    r.onload = () => setNuevoGrupoPreview(r.result as string);
    r.readAsDataURL(file);
  };

  const crearGrupoImagen = async () => {
    if (!nuevoGrupoNombre.trim() || !nuevoGrupoFile) return;
    setCreandoGrupo(true);
    const nombre = nuevoGrupoNombre.trim();
    const ext = nuevoGrupoFile.name.split('.').pop() ?? 'png';
    const path = `${nombre}.${ext}`;
    const { error: ue } = await supabase.storage.from('og-ambientes').upload(path, nuevoGrupoFile, { upsert: true });
    if (ue) { setStatus({ msg: 'Error subiendo: ' + ue.message, ok: false }); setCreandoGrupo(false); return; }
    const { data: ud } = supabase.storage.from('og-ambientes').getPublicUrl(path);
    const img = new Image(); img.src = nuevoGrupoPreview!;
    await new Promise(res => { img.onload = res; });
    const { error: ie } = await supabase.from('og_imagenes_ambiente').insert({ grupo_imagen: nombre, imagen_url: ud.publicUrl, ancho_orig: img.naturalWidth, alto_orig: img.naturalHeight, activo: true });
    if (ie) { setStatus({ msg: 'Error: ' + ie.message, ok: false }); setCreandoGrupo(false); return; }
    if (clonarElemDesde) {
      const { data: eo } = await supabase.from('og_elementos_ambiente').select('grupo_imagen, orientacion, ambiente_cod, tipo_elemento, elemento, subtipo_cod, pos_x, pos_y, ancho, alto, activo').eq('grupo_imagen', clonarElemDesde);
      if (eo && eo.length > 0) {
        const cols = Math.max(1, Math.floor(img.naturalWidth / 85));
        const ne = eo.map((e, i) => {
          const fx = (e.pos_x + e.ancho) <= img.naturalWidth;
          const fy = (e.pos_y + e.alto) <= img.naturalHeight;
          return { ...e, grupo_imagen: nombre, ...((!fx || !fy) ? { pos_x: (i % cols) * 85, pos_y: Math.floor(i / cols) * 35, ancho: 80, alto: 30 } : {}) };
        });
        await supabase.from('og_elementos_ambiente').insert(ne);
        setStatus({ msg: `✓ Grupo "${nombre}" con ${ne.length} elementos`, ok: true });
      } else setStatus({ msg: `✓ Grupo "${nombre}" creado`, ok: true });
    } else setStatus({ msg: `✓ Grupo "${nombre}" creado sin elementos`, ok: true });
    setShowNuevoGrupo(false); setNuevoGrupoNombre(''); setNuevoGrupoFile(null); setNuevoGrupoPreview(null); setClonarElemDesde('');
    setCreandoGrupo(false); cargarGruposImagen();
  };

  // ── Toggle / Delete ──

  const toggleActivo = async (pvId: string, activo: boolean) => {
    await supabase.from('og_planos').update({ activo: !activo }).eq('plano_version_id', pvId);
    setPlanos(prev => prev.map(p => p.plano_version_id === pvId ? { ...p, activo: !activo } : p));
  };

  const eliminarPlano = async (pvId: string) => {
    if (!confirm(`¿Eliminar "${pvId}" y sus ambientes?`)) return;
    await supabase.from('og_planos_ambientes').delete().eq('plano_version_id', pvId);
    await supabase.from('og_planos').delete().eq('plano_version_id', pvId);
    cargarPlanos();
  };

  // ── Render ──

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>🗺️ Gestión Planos OG</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 14, paddingBottom: 60 }}>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button onClick={() => { setShowCrear(!showCrear); setShowNuevoGrupo(false); }} style={{ ...sBtn(azul, azulBg, azulBord), flex: 1 }}>
              + Nuevo Plano
            </button>
            <button onClick={() => { setShowNuevoGrupo(!showNuevoGrupo); setShowCrear(false); }} style={{ ...sBtn(verde, verdeBg, verdeBord), flex: 1 }}>
              🖼 Nuevo Grupo Img
            </button>
            <button onClick={cargarPlanos} style={{ ...sBtn(textMuted, 'transparent', border), flex: 'none', padding: '0 12px' }}>
              🔄
            </button>
          </div>

          {/* Status */}
          {status && (
            <div style={{ padding: '8px 12px', borderRadius: 10, marginBottom: 10, fontSize: 12, fontWeight: 600, background: status.ok ? verdeBg : rojoBg, border: `0.5px solid ${status.ok ? verdeBord : rojoBord}`, color: status.ok ? verde : rojo }}>
              {status.msg}
            </div>
          )}

          {/* Create plano panel */}
          {showCrear && (
            <div style={{ ...sCard, border: `0.5px solid ${azulBord}` }}>
              <div style={sLabel}>CREAR / CLONAR PLANO</div>
              <input style={{ ...sInput, marginBottom: 6 }} placeholder="plano_version_id (ej: S5_N_DER_V2)" value={nuevoId} onChange={e => setNuevoId(e.target.value)} />
              <select style={{ ...sInput, marginBottom: 6 }} value={clonarDesde} onChange={e => setClonarDesde(e.target.value)}>
                <option value="">Sin clonar (vacío)</option>
                {planos.filter(p => (p.ambientes_count ?? 0) > 0).map(p => (
                  <option key={p.plano_version_id} value={p.plano_version_id}>{p.plano_version_id} ({p.ambientes_count} amb.)</option>
                ))}
              </select>
              {clonarDesde && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <button onClick={() => setClonarGrupos(!clonarGrupos)} style={{ flex: 1, height: 34, borderRadius: 8, fontSize: 11, fontWeight: 600, border: `0.5px solid ${clonarGrupos ? azulBord : inputBorder}`, background: clonarGrupos ? azulBg : 'transparent', color: clonarGrupos ? azul : textMuted, cursor: 'pointer' }}>
                    {clonarGrupos ? '✓ ' : ''}Clonar grupos img
                  </button>
                  {clonarGrupos && <input style={{ ...sInput, flex: 1, height: 34, fontSize: 11 }} placeholder="Sufijo (ej: V2)" value={sufijoGrupo} onChange={e => setSufijoGrupo(e.target.value)} />}
                </div>
              )}
              <button onClick={crearPlano} disabled={!nuevoId.trim() || creando} style={{ ...sBtn('#fff', nuevoId.trim() ? '#1e3a5f' : inputBorder, 'transparent', !nuevoId.trim() || creando), width: '100%' }}>
                {creando ? 'Creando...' : clonarDesde ? '📋 Clonar plano' : '+ Crear plano vacío'}
              </button>
            </div>
          )}

          {/* Create grupo imagen panel */}
          {showNuevoGrupo && (
            <div style={{ ...sCard, border: `0.5px solid ${verdeBord}` }}>
              <div style={sLabel}>NUEVO GRUPO DE IMAGEN</div>
              <input style={{ ...sInput, marginBottom: 6 }} placeholder="Nombre (ej: Cocina_VG4_DER)" value={nuevoGrupoNombre} onChange={e => setNuevoGrupoNombre(e.target.value)} />
              <div style={{ marginBottom: 6 }}>
                <input ref={grupoFileRef} type="file" accept="image/*" onChange={handleGrupoFile} style={{ fontSize: 12, color: textMuted }} />
              </div>
              {nuevoGrupoPreview && (
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <img src={nuevoGrupoPreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 8, border: `0.5px solid ${border}` }} />
                </div>
              )}
              <select style={{ ...sInput, marginBottom: 6 }} value={clonarElemDesde} onChange={e => setClonarElemDesde(e.target.value)}>
                <option value="">Sin clonar elementos</option>
                {gruposImagen.filter(g => g.activo && g.elementos > 0).map(g => (
                  <option key={g.grupo_imagen} value={g.grupo_imagen}>{g.grupo_imagen} ({g.elementos} elem.)</option>
                ))}
              </select>
              <button onClick={crearGrupoImagen} disabled={!nuevoGrupoNombre.trim() || !nuevoGrupoFile || creandoGrupo} style={{ ...sBtn('#fff', nuevoGrupoNombre.trim() && nuevoGrupoFile ? verde : inputBorder, 'transparent', !nuevoGrupoNombre.trim() || !nuevoGrupoFile || creandoGrupo), width: '100%' }}>
                {creandoGrupo ? 'Creando...' : '🖼 Crear grupo de imagen'}
              </button>
            </div>
          )}

          {/* Loading */}
          {cargando && <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: textMuted }}>Cargando planos...</div>}

          {/* Planos list */}
          {!cargando && planos.map(plano => {
            const isOpen = planoExpandido === plano.plano_version_id;
            return (
              <div key={plano.plano_version_id} style={sCard}>
                {/* Header */}
                <div onClick={() => toggleExpand(plano.plano_version_id)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>{plano.plano_version_id}</div>
                    <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
                      {plano.deptos_count} depto(s) · {plano.ambientes_count} amb.{!plano.plano_url && ' · Sin imagen'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {!plano.activo && <span style={{ fontSize: 9, fontWeight: 700, color: rojo, background: rojoBg, padding: '2px 6px', borderRadius: 4 }}>INACTIVO</span>}
                    {plano.plano_url
                      ? <span style={{ fontSize: 9, fontWeight: 700, color: verde, background: verdeBg, padding: '2px 6px', borderRadius: 4 }}>IMG</span>
                      : <span style={{ fontSize: 9, fontWeight: 700, color: naranja, background: naranjaBg, padding: '2px 6px', borderRadius: 4 }}>SIN IMG</span>}
                    <span style={{ fontSize: 14, color: textMuted }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded content */}
                {isOpen && (
                  <div style={{ marginTop: 10, borderTop: `0.5px solid ${border}`, paddingTop: 10 }}>
                    {/* Image preview */}
                    {plano.plano_url && (
                      <div style={{ textAlign: 'center', marginBottom: 10 }}>
                        <img src={plano.plano_url} alt="" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, border: `0.5px solid ${border}` }} />
                      </div>
                    )}

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      <button onClick={() => { setUploadPlanoId(plano.plano_version_id); fileRef.current?.click(); }} disabled={subiendo} style={sBtn(azul, azulBg, azulBord, subiendo)}>
                        🖼 {plano.plano_url ? 'Cambiar img' : 'Subir img'}
                      </button>
                      <button onClick={() => toggleActivo(plano.plano_version_id, plano.activo)} style={sBtn(textMuted, 'transparent', border)}>
                        {plano.activo ? '⏸ Desactivar' : '▶ Activar'}
                      </button>
                      {plano.deptos_count === 0 && (
                        <button onClick={() => eliminarPlano(plano.plano_version_id)} style={sBtn(rojo, rojoBg, rojoBord)}>
                          🗑 Eliminar
                        </button>
                      )}
                    </div>

                    {/* Ambientes */}
                    {ambientesPorPlano[plano.plano_version_id] && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={sLabel}>AMBIENTES ({ambientesPorPlano[plano.plano_version_id].length})</div>
                          {tieneCambios(plano.plano_version_id) && (
                            <button onClick={() => guardarCambios(plano.plano_version_id)} disabled={guardandoAmb} style={sBtn(verde, verdeBg, verdeBord, guardandoAmb)}>
                              {guardandoAmb ? '...' : '💾 Guardar'}
                            </button>
                          )}
                        </div>

                        {ambientesPorPlano[plano.plano_version_id].map(amb => {
                          const grupoActual = cambios[amb.id] ?? amb.grupo_imagen;
                          const imgUrl = getGrupoUrl(grupoActual);
                          const sugeridos = sugerirGrupos(amb.ambiente_cod);
                          const sinAsignar = !grupoActual;
                          const modificado = cambios[amb.id] !== undefined;

                          return (
                            <div key={amb.id} style={{
                              display: 'flex', gap: 8, alignItems: 'center',
                              padding: '8px 10px', marginBottom: 4, borderRadius: 10,
                              border: `0.5px solid ${sinAsignar ? naranjaBord : modificado ? verdeBord : border}`,
                              background: sinAsignar ? naranjaBg : modificado ? verdeBg : 'transparent',
                            }}>
                              {/* Thumb */}
                              <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', border: `0.5px solid ${border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark ? '#0a0a0a' : '#f8fafc' }}>
                                {imgUrl ? <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 8, color: textMuted }}>—</span>}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>{amb.titulo}</span>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: textMuted, background: dark ? '#0B1220' : '#f0f4f8', padding: '1px 5px', borderRadius: 4 }}>{amb.ambiente_cod}</span>
                                </div>
                                <select value={grupoActual ?? ''} onChange={e => setCambioGrupo(amb.id, e.target.value)}
                                  style={{ width: '100%', padding: '4px 6px', borderRadius: 6, fontSize: 11, border: `0.5px solid ${sinAsignar ? naranjaBord : inputBorder}`, background: inputBg, color: textPrimary }}>
                                  <option value="">— Sin asignar —</option>
                                  {sugeridos.length < gruposImagen.length && (
                                    <optgroup label={`Sugeridos (${amb.ambiente_cod})`}>
                                      {sugeridos.map(g => <option key={g.grupo_imagen} value={g.grupo_imagen}>{g.grupo_imagen} ({g.elementos} el.)</option>)}
                                    </optgroup>
                                  )}
                                  <optgroup label="Todos">
                                    {gruposImagen.filter(g => g.activo).map(g => <option key={g.grupo_imagen} value={g.grupo_imagen}>{g.grupo_imagen} ({g.elementos} el.)</option>)}
                                  </optgroup>
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Hidden file inputs */}
          <input ref={fileRef} type="file" accept="image/*" onChange={subirImagen} style={{ display: 'none' }} />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default AdminGestionPlanos;
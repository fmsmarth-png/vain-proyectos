// src/pages/ReporteVisualOG.tsx
// Reporte VISUAL de Obra Gruesa — navegación en cascada Proyecto ▸ Torre ▸ Piso ▸ Depto
// Gemelo visual de ReporteOG (que da datos duros): aquí se navega por niveles para
// dar indicaciones claras de torre/piso/depto y, en el depto, ver el plano con la
// posición de cada reparación (drill-down a RevisionOGResumen).
// FMS · Agosto 2026
//
// Fuente de conteos: vista og_reparaciones (registro + accion + ubicación), la misma
// de ReporteOG. El 'piso' se cruza desde departamentos por departamento_id.
// Drill-down: setea sessionStorage['og_seleccion'] = { proyecto, torre, depto } y
// navega a '/revision-og/resumen' (misma pantalla visual que ya existe).

import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, useIonViewWillEnter,
  IonModal, IonSpinner,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import {
  generarFichaReparacion, FichaData, FichaAmbiente,
} from '../utils/fichaReparacionCanvas';

// ─── Vistas por tipo de reparación ────────────────────────────────────────────
type Vista = 'general' | 'albanileria' | 'copa' | 'yeso';
const VISTAS: { key: Vista; label: string }[] = [
  { key: 'general',     label: 'General' },
  { key: 'albanileria', label: 'Albañilería' },
  { key: 'copa',        label: 'Copa' },
  { key: 'yeso',        label: 'Yeso' },
];

// Categoría de una accion (robusto a variantes de nombre)
type Cat = 'picado' | 'puntereo' | 'copa' | 'yeso' | 'pordefinir';
const catAccion = (accion: string | null): Cat => {
  const a = (accion || '').toLowerCase();
  if (a.includes('picado'))   return 'picado';
  if (a.includes('puntereo')) return 'puntereo';
  if (a === 'copa')           return 'copa';
  if (a === 'yeso')           return 'yeso';
  return 'pordefinir';
};

const obsEnVista = (accion: string | null, vista: Vista): boolean => {
  if (vista === 'general') return true;
  const c = catAccion(accion);
  if (vista === 'albanileria') return c === 'picado' || c === 'puntereo';
  if (vista === 'copa')        return c === 'copa';
  return c === 'yeso';
};

// Meta de categorías (etiqueta corta + color para los chips de desglose)
const CATS: { key: Cat; label: string }[] = [
  { key: 'picado',     label: 'Picado' },
  { key: 'puntereo',   label: 'Puntereo' },
  { key: 'copa',       label: 'Copa' },
  { key: 'yeso',       label: 'Yeso' },
  { key: 'pordefinir', label: 'Por definir' },
];
const catColor = (c: Cat, dark: boolean) => {
  switch (c) {
    case 'picado':   return { color: dark ? '#f87171' : '#b91c1c', bg: dark ? 'rgba(239,68,68,0.12)'  : '#fef2f2' };
    case 'puntereo': return { color: dark ? '#60a5fa' : '#1d4ed8', bg: dark ? 'rgba(96,165,250,0.12)' : '#eff6ff' };
    case 'copa':     return { color: dark ? '#fbbf24' : '#a16207', bg: dark ? 'rgba(251,191,36,0.12)' : '#fffbeb' };
    case 'yeso':     return { color: dark ? '#c084fc' : '#7c3aed', bg: dark ? 'rgba(192,132,252,0.12)': '#f5f3ff' };
    default:         return { color: dark ? '#6b7280' : '#6b7280', bg: dark ? 'rgba(107,114,128,0.12)': '#f3f4f6' };
  }
};

// ─── Tipos de datos ───────────────────────────────────────────────────────────
interface RepRow {
  departamento_id: string | null;
  torre_id: string | null;
  torre: string | null;
  depto: number | null;         // número de depto
  piso: number | null;          // cruzado desde departamentos
  plano_version_id: string | null;
  tipo_revision: string | null; // MURO | PIERNA | VANO
  ambiente: string | null;
  elemento: string | null;
  id_obra: string | null;       // ej '1F24.2' → posición en planta
  frente: string | null;        // ej 'F23-24' → pares de la torre
  accion: string | null;
  creado_en: string | null;     // fecha de la obs → precio vigente a esta fecha
}
interface Proyecto { id: string; nombre: string; }

// Plano precargado de un depto (para la ficha): imagen + coords por ambiente
interface PlanoAmbiente {
  titulo: string;
  imagen_url: string | null;
  ancho_orig: number;
  alto_orig: number;
  elementos: { elemento: string; pos_x: number; pos_y: number; ancho: number; alto: number }[];
}
interface PlanoDepto {
  plano_version_id: string | null;
  ambientes: PlanoAmbiente[]; // todos los ambientes del plano con sus elementos
}

interface Tarifa {
  declaracion: string;    // MURO | PIERNA
  accion_cat: string;     // picado | puntereo
  precio: number;
  vigencia_desde: string; // date
}

// Formato de moneda CLP
const fmtCLP = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-CL');

// Etiqueta legible de la reparación (para la ficha)
const labelReparacion = (accion: string | null): string => {
  const c = catAccion(accion);
  if (c === 'picado')   return 'Picado';
  if (c === 'puntereo') return 'Puntereo';
  if (c === 'copa')     return 'Copa';
  if (c === 'yeso')     return 'Yeso';
  return 'Por definir';
};

// Blob → base64 puro (sin prefijo data:) — mismo patrón que Pre Entrega
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      resolve(res.substring(res.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// Resuelve el precio vigente de una obs según su fecha (creado_en).
// declaracion: VANO se cobra como PIERNA. cat: picado/puntereo (albañilería).
// Precio = tarifa (declaracion, cat) con la vigencia_desde MÁS RECIENTE <= fecha.
const resolverPrecio = (
  tarifas: Tarifa[],
  tipo_revision: string | null,
  accion: string | null,
  creado_en: string | null,
): number => {
  const cat = catAccion(accion);
  if (cat !== 'picado' && cat !== 'puntereo') return 0; // solo albañilería tiene tarifa
  const decl = (tipo_revision || '').toUpperCase() === 'VANO'
    ? 'PIERNA'
    : (tipo_revision || '').toUpperCase();
  const fecha = creado_en ? new Date(creado_en).getTime() : Date.now();

  const candidatas = tarifas
    .filter(t => t.declaracion === decl && t.accion_cat === cat
      && new Date(t.vigencia_desde).getTime() <= fecha)
    .sort((a, b) => new Date(b.vigencia_desde).getTime() - new Date(a.vigencia_desde).getTime());

  return candidatas.length > 0 ? Number(candidatas[0].precio) : 0;
};

// ─── Componente ───────────────────────────────────────────────────────────────
const ReporteVisualOG: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const history = useHistory();

  // Tokens (idénticos a RevisionOGResumen)
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

  // Estado
  const [proyectos, setProyectos]   = useState<Proyecto[]>([]);
  const [proyectoSel, setProyectoSel] = useState<Proyecto | null>(null);
  const [rows, setRows]             = useState<RepRow[]>([]);
  const [tarifas, setTarifas]       = useState<Tarifa[]>([]);
  const [torreSel, setTorreSel]     = useState<{ id: string; nombre: string; frente: string | null } | null>(null);
  const [pisoSel, setPisoSel]       = useState<number | null>(null);
  const [vista, setVista]           = useState<Vista>('general');
  const [cargando, setCargando]     = useState(false);

  // ── Ficha WhatsApp (nivel depto) ────────────────────────────────────────────
  // Precarga del plano del depto (imagenes/coords) al abrir el nivel piso, para
  // que la ficha se genere al instante. Cache por departamento_id.
  const [planoCache, setPlanoCache] = useState<Record<string, PlanoDepto>>({});
  const [generando, setGenerando]   = useState(false);
  const [fichaError, setFichaError] = useState('');

  // ── Cargar proyectos al entrar ──────────────────────────────────────────────
  useIonViewWillEnter(() => { cargarProyectos(); });
  useEffect(() => { cargarProyectos(); /* eslint-disable-next-line */ }, []);

  const cargarProyectos = async () => {
    const { data } = await supabase.from('proyectos').select('id, nombre').order('nombre');
    setProyectos((data ?? []) as Proyecto[]);
  };

  // Tarifas de reparación (una vez; se resuelven por vigencia al costear)
  useEffect(() => { cargarTarifas(); /* eslint-disable-next-line */ }, []);
  const cargarTarifas = async () => {
    const { data } = await supabase
      .from('og_tarifas_reparacion')
      .select('declaracion, accion_cat, precio, vigencia_desde')
      .eq('activo', true);
    setTarifas((data ?? []) as Tarifa[]);
  };

  // Precarga en segundo plano de los planos del piso abierto (ficha instantánea)
  useEffect(() => {
    if (!torreSel || pisoSel === null) return;
    const deptos = new Map<string, string | null>();
    rows
      .filter(r => r.torre_id === torreSel.id && (r.piso ?? -1) === pisoSel && r.departamento_id)
      .forEach(r => { if (!deptos.has(r.departamento_id!)) deptos.set(r.departamento_id!, r.plano_version_id); });
    let cancel = false;
    (async () => {
      for (const [id, pv] of deptos.entries()) {
        if (cancel) break;
        await precargarPlano(id, pv);
      }
    })();
    return () => { cancel = true; };
    /* eslint-disable-next-line */
  }, [torreSel, pisoSel]);

  // ── Cargar reparaciones del proyecto + cruzar piso ──────────────────────────
  const elegirProyecto = async (p: Proyecto) => {
    setProyectoSel(p);
    setTorreSel(null);
    setPisoSel(null);
    setCargando(true);
    try {
      const { data: repData } = await supabase
        .from('og_reparaciones')
        .select('departamento_id, torre_id, torre, depto, tipo_revision, ambiente, elemento, id_obra, frente, accion, creado_en')
        .eq('proyecto_id', p.id);

      const reps = (repData ?? []) as any[];

      // Cruzar piso + plano_version_id desde departamentos (por los ids presentes)
      const ids = [...new Set(reps.map(r => r.departamento_id).filter(Boolean))] as string[];
      const infoDepto = new Map<string, { piso: number | null; plano_version_id: string | null }>();
      if (ids.length > 0) {
        const { data: deptoData } = await supabase
          .from('departamentos')
          .select('id, piso, plano_version_id')
          .in('id', ids);
        (deptoData ?? []).forEach((d: any) => {
          infoDepto.set(d.id, { piso: d.piso ?? null, plano_version_id: d.plano_version_id ?? null });
        });
      }

      const enriquecidas: RepRow[] = reps.map(r => {
        const info = r.departamento_id ? infoDepto.get(r.departamento_id) : undefined;
        return {
          departamento_id: r.departamento_id ?? null,
          torre_id: r.torre_id ?? null,
          torre: r.torre ?? null,
          depto: r.depto ?? null,
          piso: info?.piso ?? null,
          plano_version_id: info?.plano_version_id ?? null,
          tipo_revision: r.tipo_revision ?? null,
          ambiente: r.ambiente ?? null,
          elemento: r.elemento ?? null,
          id_obra: r.id_obra ?? null,
          frente: r.frente ?? null,
          accion: r.accion ?? null,
          creado_en: r.creado_en ?? null,
        };
      });
      setRows(enriquecidas);
    } finally {
      setCargando(false);
    }
  };

  // ── Precarga del plano de un depto (para la ficha) ──────────────────────────
  // Carga imágenes de ambiente + coordenadas de elementos, resolviendo el
  // grupo_imagen correcto por plano_version_id (misma lógica del resumen).
  const precargarPlano = async (
    departamento_id: string, plano_version_id: string | null,
  ): Promise<PlanoDepto | null> => {
    if (planoCache[departamento_id]) return planoCache[departamento_id];
    if (!plano_version_id) return null;
    try {
      const [
        { data: ambPlanoData },
        { data: imagenesData },
        { data: elementosData },
      ] = await Promise.all([
        supabase.from('og_planos_ambientes')
          .select('titulo, grupo_imagen')
          .eq('plano_version_id', plano_version_id)
          .eq('activo', true)
          .order('orden'),
        supabase.from('og_imagenes_ambiente')
          .select('grupo_imagen, imagen_url, ancho_orig, alto_orig')
          .eq('activo', true),
        supabase.from('og_elementos_ambiente')
          .select('grupo_imagen, elemento, pos_x, pos_y, ancho, alto')
          .eq('activo', true),
      ]);

      const imgMap = new Map<string, { imagen_url: string; ancho_orig: number; alto_orig: number }>();
      (imagenesData ?? []).forEach((img: any) =>
        imgMap.set(img.grupo_imagen, { imagen_url: img.imagen_url, ancho_orig: img.ancho_orig, alto_orig: img.alto_orig }));

      const ambientes: PlanoAmbiente[] = (ambPlanoData ?? []).map((a: any) => {
        const grupo = a.grupo_imagen ?? '';
        const img = imgMap.get(grupo);
        const elementos = ((elementosData ?? []) as any[])
          .filter(e => e.grupo_imagen === grupo)
          .map(e => ({ elemento: e.elemento, pos_x: e.pos_x, pos_y: e.pos_y, ancho: e.ancho, alto: e.alto }));
        return {
          titulo: a.titulo,
          imagen_url: img?.imagen_url ?? null,
          ancho_orig: img?.ancho_orig ?? 584,
          alto_orig: img?.alto_orig ?? 511,
          elementos,
        };
      });

      const plano: PlanoDepto = { plano_version_id, ambientes };
      setPlanoCache(prev => ({ ...prev, [departamento_id]: plano }));
      return plano;
    } catch (e) {
      console.error('[ReporteVisualOG] Error precargando plano:', e);
      return null;
    }
  };

  // ── Generar y compartir ficha de un gremio para un depto ────────────────────
  const compartirFicha = async (
    d: { departamento_id: string; numero: number; id_obra: string | null; plano_version_id: string | null; rows: RepRow[] },
    gremio: 'albanileria' | 'yeso',
  ) => {
    if (!proyectoSel || !torreSel) return;
    setGenerando(true);
    setFichaError('');
    try {
      // Asegurar plano precargado (usa el valor retornado, no el state async)
      let plano: PlanoDepto | null = planoCache[d.departamento_id] ?? null;
      if (!plano) plano = await precargarPlano(d.departamento_id, d.plano_version_id);

      // Obs del gremio en este depto
      const obsGremio = d.rows.filter(r => obsEnVista(r.accion, gremio));
      if (obsGremio.length === 0) { setFichaError('Sin reparaciones de este gremio'); setGenerando(false); return; }

      // Agrupar por ambiente
      const piso = obsGremio[0]?.piso ?? null;
      const ambientesMap = new Map<string, RepRow[]>();
      obsGremio.forEach(r => {
        const key = r.ambiente || 'General';
        const arr = ambientesMap.get(key) ?? [];
        arr.push(r); ambientesMap.set(key, arr);
      });

      // Construir ambientes de la ficha, cruzando con el plano precargado
      const ambientesFicha: FichaAmbiente[] = [];
      for (const [ambNombre, rs] of ambientesMap.entries()) {
        const pa = plano?.ambientes.find(x => x.titulo.toLowerCase() === ambNombre.toLowerCase());
        const nombresConObs = new Set(rs.map(r => r.elemento).filter(Boolean) as string[]);
        const elementos = (pa?.elementos ?? []).filter(e => nombresConObs.has(e.elemento));
        ambientesFicha.push({
          titulo: ambNombre,
          imagen_url: pa?.imagen_url ?? null,
          ancho_orig: pa?.ancho_orig ?? 584,
          alto_orig: pa?.alto_orig ?? 511,
          elementos,
          obs: rs.map(r => ({
            elemento: r.elemento || '—',
            tipo_revision: r.tipo_revision,
            reparacion: labelReparacion(r.accion),
            valor: resolverPrecio(tarifas, r.tipo_revision, r.accion, r.creado_en),
          })),
        });
      }

      const total = obsGremio.reduce(
        (s, r) => s + resolverPrecio(tarifas, r.tipo_revision, r.accion, r.creado_en), 0);

      const data: FichaData = {
        gremio,
        gremioLabel: gremio === 'yeso' ? 'YESO' : 'ALBAÑILERÍA',
        proyecto: proyectoSel.nombre,
        torre: torreSel.frente || torreSel.nombre,
        piso,
        depto: d.numero,
        idObra: obsGremio[0]?.id_obra ?? null,
        frente: obsGremio[0]?.frente ?? null,
        ambientes: ambientesFicha,
        total,
      };

      const blob = await generarFichaReparacion(data);
      const idTxt = (d.id_obra || `Depto_${d.numero}`).replace(/[^\w.-]/g, '');
      const fileName = `Ficha_${data.gremioLabel}_${idTxt}_${Date.now()}.png`;

      if (Capacitor.isNativePlatform()) {
        const base64 = await blobToBase64(blob);
        await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
        const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
        try {
          await Share.share({
            title: fileName,
            text: `${data.gremioLabel} · Torre ${data.torre} · ${d.id_obra || `Depto ${d.numero}`}`,
            url: uri,
            dialogTitle: 'Compartir ficha',
          });
        } catch { /* usuario cerró el diálogo */ }
      } else {
        // Web: descarga directa
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      console.error('[ReporteVisualOG] Error generando ficha:', e);
      setFichaError('Error al generar la ficha: ' + (e?.message ?? ''));
    } finally {
      setGenerando(false);
    }
  };

  // ── Drill-down a la pantalla visual de resumen del depto ────────────────────
  const abrirDepto = (departamento_id: string, numero: number, plano_version_id: string | null) => {
    if (!proyectoSel || !torreSel) return;
    sessionStorage.setItem('og_seleccion', JSON.stringify({
      proyecto: { id: proyectoSel.id, nombre: proyectoSel.nombre },
      torre:    { id: torreSel.id, nombre: torreSel.frente || torreSel.nombre },
      depto:    { id: departamento_id, numero, plano_version_id },
    }));
    history.push('/revision-og/resumen');
  };

  // ── Filtrado por vista ──────────────────────────────────────────────────────
  const rowsVista = rows.filter(r => obsEnVista(r.accion, vista));

  // Desglose por categoría de un subconjunto (para los chips)
  const desglose = (subset: RepRow[]) => {
    const m: Record<Cat, number> = { picado: 0, puntereo: 0, copa: 0, yeso: 0, pordefinir: 0 };
    subset.forEach(r => { m[catAccion(r.accion)]++; });
    return m;
  };

  // Monto total de un subconjunto (precio vigente por obs, según su creado_en)
  const montoDe = (subset: RepRow[]) =>
    subset.reduce((s, r) => s + resolverPrecio(tarifas, r.tipo_revision, r.accion, r.creado_en), 0);

  // ── Agregaciones por nivel ──────────────────────────────────────────────────
  const nivelTorres = () => {
    const map = new Map<string, { id: string; nombre: string; frente: string | null; rows: RepRow[] }>();
    rowsVista.forEach(r => {
      if (!r.torre_id) return;
      const cur = map.get(r.torre_id) ?? { id: r.torre_id, nombre: r.torre ?? '—', frente: r.frente ?? null, rows: [] };
      cur.rows.push(r);
      map.set(r.torre_id, cur);
    });
    return [...map.values()].sort((a, b) =>
      (a.frente || a.nombre || '').localeCompare(b.frente || b.nombre || '', undefined, { numeric: true }));
  };

  const nivelPisos = () => {
    if (!torreSel) return [];
    const map = new Map<number, RepRow[]>();
    rowsVista.filter(r => r.torre_id === torreSel.id).forEach(r => {
      const piso = r.piso ?? -1; // -1 = sin piso asignado
      const arr = map.get(piso) ?? [];
      arr.push(r);
      map.set(piso, arr);
    });
    return [...map.entries()]
      .map(([piso, rs]) => ({ piso, rows: rs }))
      .sort((a, b) => a.piso - b.piso);
  };

  const nivelDeptos = () => {
    if (!torreSel || pisoSel === null) return [];
    const map = new Map<string, { departamento_id: string; numero: number; id_obra: string | null; plano_version_id: string | null; rows: RepRow[] }>();
    rowsVista
      .filter(r => r.torre_id === torreSel.id && (r.piso ?? -1) === pisoSel && r.departamento_id)
      .forEach(r => {
        const key = r.departamento_id as string;
        const cur = map.get(key) ?? {
          departamento_id: key, numero: r.depto ?? 0, id_obra: r.id_obra ?? null, plano_version_id: r.plano_version_id, rows: [],
        };
        cur.rows.push(r);
        map.set(key, cur);
      });
    // Orden por id_obra (par y sufijo) para que salgan agrupados como en la planta
    return [...map.values()].sort((a, b) =>
      (a.id_obra || '').localeCompare(b.id_obra || '', undefined, { numeric: true }));
  };

  // ── UI: chips de desglose ───────────────────────────────────────────────────
  const ChipsDesglose: React.FC<{ subset: RepRow[] }> = ({ subset }) => {
    const d = desglose(subset);
    const visibles = CATS.filter(c => d[c.key] > 0);
    if (visibles.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
        {visibles.map(c => {
          const col = catColor(c.key, dark);
          return (
            <span key={c.key} style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: col.bg, color: col.color, whiteSpace: 'nowrap',
            }}>
              {c.label}: {d[c.key]}
            </span>
          );
        })}
      </div>
    );
  };

  // ── UI: tarjeta de nivel (torre/piso/depto) ────────────────────────────────
  const TarjetaNivel: React.FC<{
    titulo: string; subtitulo?: string; total: number; subset: RepRow[]; onClick: () => void;
  }> = ({ titulo, subtitulo, total, subset, onClick }) => {
    const monto = montoDe(subset);
    return (
    <button
      onClick={onClick}
      style={{
        ...sCard, width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'block', transition: 'transform 0.1s',
      }}
      onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.99)')}
      onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>{subtitulo}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: textPrimary, lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>obs</div>
        </div>
      </div>
      <ChipsDesglose subset={subset} />
      {monto > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 8, borderTop: `0.5px solid ${border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Costo albañilería
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: dark ? '#4ade80' : '#15803d' }}>
            {fmtCLP(monto)}
          </span>
        </div>
      )}
    </button>
    );
  };

  // ── Breadcrumb ──────────────────────────────────────────────────────────────
  const Breadcrumb: React.FC = () => {
    if (!proyectoSel) return null;
    const seg = (label: string, activo: boolean, onClick?: () => void) => (
      <span
        onClick={onClick}
        style={{
          fontSize: 12, fontWeight: activo ? 700 : 500,
          color: activo ? textPrimary : (dark ? '#60a5fa' : '#1d4ed8'),
          cursor: onClick ? 'pointer' : 'default',
        }}
      >{label}</span>
    );
    const sep = <span style={{ color: textMuted, fontSize: 12, margin: '0 6px' }}>▸</span>;
    return (
      <div style={{ ...sCard, padding: '10px 14px', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        {seg(proyectoSel.nombre, !torreSel, () => { setTorreSel(null); setPisoSel(null); })}
        {torreSel && sep}
        {torreSel && seg(torreSel.frente || `Torre ${torreSel.nombre}`, pisoSel === null, () => setPisoSel(null))}
        {pisoSel !== null && sep}
        {pisoSel !== null && seg(pisoSel === -1 ? 'Sin piso' : `Piso ${pisoSel}`, true)}
      </div>
    );
  };

  // ── Selector de vista (reparación) ──────────────────────────────────────────
  const SelectorVista: React.FC = () => (
    <div style={{
      display: 'flex', gap: 6, marginBottom: 10,
      background: cardGrad, borderRadius: 12, border: `0.5px solid ${border}`, padding: 4,
    }}>
      {VISTAS.map(v => {
        const activo = vista === v.key;
        return (
          <button key={v.key} onClick={() => setVista(v.key)}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: activo ? 700 : 500,
              background: activo ? '#1e3a5f' : 'transparent',
              color: activo ? '#ffffff' : textSecondary, transition: 'all 0.15s',
            }}>{v.label}</button>
        );
      })}
    </div>
  );

  // ── Back del toolbar: sube un nivel en la cascada ───────────────────────────
  const volver = () => {
    if (pisoSel !== null) { setPisoSel(null); return; }
    if (torreSel)         { setTorreSel(null); return; }
    if (proyectoSel)      { setProyectoSel(null); setRows([]); return; }
    history.goBack();
  };

  // Totales del nivel actual (para KPI superior)
  const subsetNivel = torreSel
    ? (pisoSel !== null
        ? rowsVista.filter(r => r.torre_id === torreSel.id && (r.piso ?? -1) === pisoSel)
        : rowsVista.filter(r => r.torre_id === torreSel.id))
    : rowsVista;
  const totalNivel = subsetNivel.length;
  const montoNivel = montoDe(subsetNivel);

  const tituloToolbar = !proyectoSel
    ? 'Reporte Visual OG'
    : !torreSel
      ? proyectoSel.nombre
      : pisoSel === null
        ? (torreSel.frente || `Torre ${torreSel.nombre}`)
        : (pisoSel === -1 ? 'Sin piso' : `Piso ${pisoSel}`);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <button slot="start" onClick={volver}
            style={{ background: 'transparent', border: 'none', color: dark ? '#555' : 'rgba(255,255,255,0.7)', fontSize: 22, cursor: 'pointer', paddingLeft: 12 }}>
            ‹
          </button>
          <IonTitle style={{ fontSize: 15 }}>{tituloToolbar}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: '12px 12px 32px' }}>

          {/* ── Paso 1: elegir proyecto ── */}
          {!proyectoSel && (
            <>
              <div style={sSecLabel as any}>Elige un proyecto</div>
              {proyectos.length === 0 && (
                <div style={{ ...sCard, textAlign: 'center', color: textSecondary, fontSize: 14 }}>
                  Cargando proyectos…
                </div>
              )}
              {proyectos.map(p => (
                <button key={p.id} onClick={() => elegirProyecto(p)}
                  style={{ ...sCard, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>{p.nombre}</div>
                </button>
              ))}
            </>
          )}

          {/* ── Cascada ── */}
          {proyectoSel && (
            <>
              <Breadcrumb />
              <SelectorVista />

              {/* KPI del nivel */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div style={{ background: cardGrad, borderRadius: 12, border: `0.5px solid ${border}`, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: textMuted, marginBottom: 2 }}>Obs. en vista</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: textPrimary }}>{totalNivel}</div>
                </div>
                <div style={{ background: cardGrad, borderRadius: 12, border: `0.5px solid ${border}`, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: textMuted, marginBottom: 2 }}>Costo albañilería</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: dark ? '#4ade80' : '#15803d', marginTop: 2 }}>
                    {fmtCLP(montoNivel)}
                  </div>
                </div>
              </div>

              {cargando ? (
                <div style={{ textAlign: 'center', padding: 40, color: textSecondary }}>Cargando…</div>
              ) : (
                <>
                  {/* Nivel TORRES */}
                  {!torreSel && nivelTorres().map(t => (
                    <TarjetaNivel
                      key={t.id}
                      titulo={t.frente || `Torre ${t.nombre}`}
                      subtitulo={`Torre ${t.nombre} · ${new Set(t.rows.map(r => r.departamento_id)).size} deptos afectados`}
                      total={t.rows.length}
                      subset={t.rows}
                      onClick={() => { setTorreSel({ id: t.id, nombre: t.nombre, frente: t.frente }); setPisoSel(null); }}
                    />
                  ))}
                  {!torreSel && nivelTorres().length === 0 && (
                    <div style={{ ...sCard, textAlign: 'center', color: textSecondary, fontSize: 14 }}>
                      Sin observaciones para esta vista
                    </div>
                  )}

                  {/* Nivel PISOS */}
                  {torreSel && pisoSel === null && nivelPisos().map(pi => (
                    <TarjetaNivel
                      key={pi.piso}
                      titulo={pi.piso === -1 ? 'Sin piso asignado' : `Piso ${pi.piso}`}
                      subtitulo={`${new Set(pi.rows.map(r => r.departamento_id)).size} deptos afectados`}
                      total={pi.rows.length}
                      subset={pi.rows}
                      onClick={() => setPisoSel(pi.piso)}
                    />
                  ))}
                  {torreSel && pisoSel === null && nivelPisos().length === 0 && (
                    <div style={{ ...sCard, textAlign: 'center', color: textSecondary, fontSize: 14 }}>
                      Sin observaciones para esta vista en esta torre
                    </div>
                  )}

                  {/* Nivel DEPTOS */}
                  {torreSel && pisoSel !== null && nivelDeptos().map(d => {
                    // Obs COMPLETAS del depto (no filtradas por pestaña) para decidir gremios
                    const rowsDepto = rows.filter(r => r.departamento_id === d.departamento_id);
                    const hayAlb  = rowsDepto.some(r => obsEnVista(r.accion, 'albanileria'));
                    const hayYeso = rowsDepto.some(r => obsEnVista(r.accion, 'yeso'));
                    const dFull = { departamento_id: d.departamento_id, numero: d.numero, id_obra: d.id_obra, plano_version_id: d.plano_version_id, rows: rowsDepto };
                    return (
                      <div key={d.departamento_id} style={{ marginBottom: 10 }}>
                        <TarjetaNivel
                          titulo={d.id_obra || `Depto ${d.numero}`}
                          subtitulo="Toca para ver el plano y posiciones"
                          total={d.rows.length}
                          subset={d.rows}
                          onClick={() => abrirDepto(d.departamento_id, d.numero, d.plano_version_id)}
                        />
                        {(hayAlb || hayYeso) && (
                          <div style={{ display: 'flex', gap: 8, marginTop: -4 }}>
                            {hayAlb && (
                              <button
                                onClick={() => compartirFicha(dFull, 'albanileria')}
                                disabled={generando}
                                style={{
                                  flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                                  border: `0.5px solid ${dark ? 'rgba(6,182,212,0.4)' : '#a5f3fc'}`,
                                  background: dark ? 'rgba(6,182,212,0.10)' : '#ecfeff',
                                  color: dark ? '#22d3ee' : '#0e7490', fontSize: 13, fontWeight: 600,
                                }}
                              >📲 Ficha Albañilería</button>
                            )}
                            {hayYeso && (
                              <button
                                onClick={() => compartirFicha(dFull, 'yeso')}
                                disabled={generando}
                                style={{
                                  flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                                  border: `0.5px solid ${dark ? 'rgba(192,132,252,0.4)' : '#ddd6fe'}`,
                                  background: dark ? 'rgba(192,132,252,0.10)' : '#f5f3ff',
                                  color: dark ? '#c084fc' : '#7c3aed', fontSize: 13, fontWeight: 600,
                                }}
                              >📲 Ficha Yeso</button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {torreSel && pisoSel !== null && nivelDeptos().length === 0 && (
                    <div style={{ ...sCard, textAlign: 'center', color: textSecondary, fontSize: 14 }}>
                      Sin observaciones para esta vista en este piso
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Overlay de generación de ficha */}
        {generando && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 14, zIndex: 9999,
          }}>
            <IonSpinner name="crescent" style={{ '--color': '#22d3ee' } as any} />
            <div style={{ color: '#fff', fontSize: 14 }}>Generando ficha…</div>
          </div>
        )}

        {/* Error de ficha */}
        {fichaError && (
          <div style={{
            position: 'fixed', bottom: 24, left: 16, right: 16, zIndex: 9999,
            background: dark ? 'rgba(239,68,68,0.15)' : '#fef2f2',
            border: `0.5px solid ${dark ? 'rgba(239,68,68,0.4)' : '#fecaca'}`,
            color: dark ? '#f87171' : '#b91c1c',
            padding: '12px 14px', borderRadius: 12, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <span>{fichaError}</span>
            <button onClick={() => setFichaError('')}
              style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default ReporteVisualOG;
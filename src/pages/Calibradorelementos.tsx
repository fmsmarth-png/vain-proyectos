// src/pages/CalibradorElementos.tsx
// Calibrador visual de elementos sobre imágenes de ambiente OG
// Permite agregar, mover, redimensionar, eliminar y espejar elementos
// Solo accesible para administrador desde Admin.tsx
// FMS · Junio 2026

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar,
} from '@ionic/react';
import { useIonViewDidEnter } from '@ionic/react';
import { useTheme } from '../Context/ThemeContext';
import { supabase } from '../supabase';
import { Wrench, MapPin } from 'lucide-react';
import { ACCIONES_REPARACION, getAccionReparacionPorTexto } from '../utils/ogSubtipos';

interface GrupoImagen {
  grupo_imagen: string;
  imagen_url:   string;
  ancho_orig:   number;
  alto_orig:    number;
}

interface Elemento {
  id?:           string;
  elemento:      string;
  tipo_elemento: string;
  subtipo_cod:   string | null;
  pos_x:         number;
  pos_y:         number;
  ancho:         number;
  alto:          number;
  esNuevo?:      boolean;
  modificado?:   boolean;
}

interface Tolerancia {
  id: string;
  revision: string;
  item_revision: string;
  elemento: string;
  ambiente: string | null;
  tolerancia: string;
  fase: string | null;
  activo: boolean;
}

interface Reparacion {
  id: string;
  revision: string;
  item_revision: string;
  tolerancia: string;
  accion: string;
  codigo: string | null;
}

type FiltroVista = 'Todos' | 'Muros' | 'Vanos';

const TIPOS_ELEMENTO = ['Muros', 'Vanos'];

const CalibradorElementos: React.FC = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const mounted = useRef(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

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

  const [grupos, setGrupos]           = useState<GrupoImagen[]>([]);
  const [grupoSel, setGrupoSel]       = useState<GrupoImagen | null>(null);
  const [elementos, setElementos]     = useState<Elemento[]>([]);
  const [elSel, setElSel]             = useState<Elemento | null>(null);
  const [contenedorW, setContenedorW] = useState(0);
  const [alturaImg, setAlturaImg]     = useState(0);
  const [imgCargada, setImgCargada]   = useState(false);
  const [cargando, setCargando]       = useState(true);
  const [guardando, setGuardando]     = useState(false);
  const [status, setStatus]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [filtroVista, setFiltroVista] = useState<FiltroVista>('Todos');

  // Ayudas visuales
  const [mostrarGuias, setMostrarGuias]         = useState(false);
  const [mostrarCuadricula, setMostrarCuadricula] = useState(false);
  const [snapActivo, setSnapActivo]             = useState(false);
  const SNAP = 10; // px en coordenadas originales

  // Tolerancias y reparaciones del elemento seleccionado
  const [tolerancias, setTolerancias]           = useState<Tolerancia[]>([]);
  const [reparaciones, setReparaciones]         = useState<Reparacion[]>([]);
  const [cargandoTol, setCargandoTol]           = useState(false);
  const [showAddTol, setShowAddTol]             = useState(false);
  const [showClonarTol, setShowClonarTol]       = useState(false);
  const [nuevaTolRevision, setNuevaTolRevision] = useState('MURO');
  const [nuevaTolItem, setNuevaTolItem]         = useState('PLANEIDAD');
  const [nuevaTolTexto, setNuevaTolTexto]       = useState('');
  const [nuevaTolAmbiente, setNuevaTolAmbiente] = useState('');
  const [nuevaTolAccion, setNuevaTolAccion]     = useState('');
  const [nuevaTolCodigo, setNuevaTolCodigo]     = useState('');
  const [clonarDesdeElem, setClonarDesdeElem]   = useState('');
  const [elemsSimilares, setElemsSimilares]     = useState<string[]>([]);
  const [guardandoRepId, setGuardandoRepId]     = useState<string | null>(null);
  const [ambientesDisponibles, setAmbientesDisponibles] = useState<string[]>([]);
  const [guardandoAmbId, setGuardandoAmbId]     = useState<string | null>(null);

  // Nuevo elemento
  const [nuevoNombre, setNuevoNombre]   = useState('');
  const [nuevoTipo, setNuevoTipo]       = useState('Muros');
  const [nuevoSubtipo, setNuevoSubtipo] = useState('MUR');

  // Espejo
  const [grupoEspejo, setGrupoEspejo]         = useState('');
  const [espejoX, setEspejoX]                 = useState(true);
  const [espejoY, setEspejoY]                 = useState(false);
  const [aplicandoEspejo, setAplicandoEspejo] = useState(false);

  // Clonar UN elemento individual a otro grupo (no reemplaza lo existente en destino)
  const [grupoClonElem, setGrupoClonElem]         = useState('');
  const [clonElemEspejoX, setClonElemEspejoX]     = useState(false);
  const [clonElemEspejoY, setClonElemEspejoY]     = useState(false);
  const [clonandoElemento, setClonandoElemento]   = useState(false);

  useIonViewDidEnter(() => {
    if (!mounted.current) { mounted.current = true; cargarGrupos(); cargarAmbientes(); }
  });

  const cargarAmbientes = async () => {
    const { data } = await supabase
      .from('og_planos_ambientes')
      .select('titulo')
      .eq('activo', true);
    const unicos = [...new Set((data ?? []).map(d => d.titulo))].sort();
    setAmbientesDisponibles(unicos);
  };

  const cargarGrupos = async () => {
    setCargando(true);
    const { data } = await supabase
      .from('og_imagenes_ambiente')
      .select('grupo_imagen, imagen_url, ancho_orig, alto_orig')
      .eq('activo', true)
      .order('grupo_imagen');
    setGrupos(data || []);
    setCargando(false);
  };

  const cargarElementos = async (gi: string) => {
    const { data } = await supabase
      .from('og_elementos_ambiente')
      .select('id, elemento, tipo_elemento, subtipo_cod, pos_x, pos_y, ancho, alto')
      .eq('grupo_imagen', gi)
      .eq('activo', true)
      .order('tipo_elemento');
    setElementos((data || []).map(e => ({
      id:            e.id,
      elemento:      e.elemento,
      tipo_elemento: e.tipo_elemento,
      subtipo_cod:   e.subtipo_cod,
      pos_x:         e.pos_x,
      pos_y:         e.pos_y,
      ancho:         e.ancho,
      alto:          e.alto,
      esNuevo:       false,
      modificado:    false,
    })));
  };

  const onGrupoChange = async (gi: string) => {
    const g = grupos.find(x => x.grupo_imagen === gi) || null;
    setGrupoSel(g);
    setElSel(null);
    setElementos([]);
    setImgCargada(false);
    setAlturaImg(0);
    setContenedorW(0);
    setStatus(null);
    setGrupoEspejo('');
    setGrupoClonElem('');
    setFiltroVista('Todos');
    if (!g) return;
    await cargarElementos(gi);
  };

  const medirContenedor = useCallback(() => {
    if (contenedorRef.current) {
      const w = contenedorRef.current.offsetWidth;
      if (w > 0) setContenedorW(w);
    }
  }, []);

  useEffect(() => {
    medirContenedor();
    window.addEventListener('resize', medirContenedor);
    return () => window.removeEventListener('resize', medirContenedor);
  }, [medirContenedor]);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    if (w > 0) setContenedorW(w);
    if (h > 0) setAlturaImg(h);
    setImgCargada(true);
  };

  const scaleX = grupoSel && contenedorW > 0 ? contenedorW / grupoSel.ancho_orig : 1;
  const scaleY = grupoSel && alturaImg > 0    ? alturaImg   / grupoSel.alto_orig  : 1;

  const snapVal = (v: number) => snapActivo ? Math.round(v / SNAP) * SNAP : v;

  const agregarElemento = () => {
    if (!nuevoNombre.trim()) { setStatus({ msg: 'Ingresa un nombre', ok: false }); return; }
    const nuevo: Elemento = {
      elemento:      nuevoNombre.trim(),
      tipo_elemento: nuevoTipo,
      subtipo_cod:   nuevoSubtipo || null,
      pos_x:         Math.round(30 / scaleX),
      pos_y:         Math.round(30 / scaleY),
      ancho:         Math.round(80 / scaleX),
      alto:          Math.round(50 / scaleY),
      esNuevo:       true,
      modificado:    true,
    };
    setElementos(prev => [...prev, nuevo]);
    setElSel(nuevo);
    setNuevoNombre('');
  };

  const eliminarElemento = async () => {
    if (!elSel) return;
    if (elSel.id) {
      await supabase.from('og_elementos_ambiente').update({ activo: false }).eq('id', elSel.id);
    }
    setElementos(prev => prev.filter(e => e !== elSel));
    setElSel(null);
  };

  const startDrag = (e: React.MouseEvent | React.TouchEvent, el: Elemento) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const ox = el.pos_x, oy = el.pos_y;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const cy = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
      el.pos_x = snapVal(Math.max(0, Math.round(ox + (cx - clientX) / scaleX)));
      el.pos_y = snapVal(Math.max(0, Math.round(oy + (cy - clientY) / scaleY)));
      el.modificado = true;
      setElementos(prev => [...prev]);
      setElSel(el);
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

  const startResize = (e: React.MouseEvent | React.TouchEvent, el: Elemento) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const ow = el.ancho, oh = el.alto;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const cy = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
      el.ancho = snapVal(Math.max(10, Math.round(ow + (cx - clientX) / scaleX)));
      el.alto  = snapVal(Math.max(10, Math.round(oh + (cy - clientY) / scaleY)));
      el.modificado = true;
      setElementos(prev => [...prev]);
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

  // Igualar dimensiones al elemento seleccionado
  const igualarDimensiones = (ref: Elemento) => {
    const mismoTipo = elementos.filter(e => e.tipo_elemento === ref.tipo_elemento && e !== ref);
    if (mismoTipo.length === 0) { setStatus({ msg: 'No hay otros elementos del mismo tipo', ok: false }); return; }
    mismoTipo.forEach(e => {
      e.ancho = ref.ancho;
      e.alto  = ref.alto;
      e.modificado = true;
    });
    setElementos(prev => [...prev]);
    setStatus({ msg: `✓ Dimensiones igualadas en ${mismoTipo.length} elemento(s)`, ok: true });
  };

  // ── Tolerancias ──

  const cargarTolerancias = async (nombreElemento: string) => {
    setCargandoTol(true);
    setTolerancias([]);
    setReparaciones([]);
    setShowAddTol(false);
    setShowClonarTol(false);

    const { data: tols } = await supabase
      .from('og_catalogo')
      .select('id, revision, item_revision, elemento, ambiente, tolerancia, fase, activo')
      .eq('elemento', nombreElemento)
      .eq('activo', true)
      .order('revision')
      .order('item_revision')
      .order('tolerancia');

    setTolerancias(tols ?? []);

    // Load all reparaciones for quick lookup
    const { data: reps } = await supabase
      .from('og_tolerancia_reparacion')
      .select('id, revision, item_revision, tolerancia, accion, codigo');
    setReparaciones(reps ?? []);

    // Load similar element names for cloning (from both catalogo and elementos_ambiente)
    const { data: similaresCat } = await supabase
      .from('og_catalogo')
      .select('elemento')
      .eq('activo', true);
    const { data: similaresElem } = await supabase
      .from('og_elementos_ambiente')
      .select('elemento')
      .eq('activo', true);
    const todosNombres = [
      ...(similaresCat ?? []).map(s => s.elemento),
      ...(similaresElem ?? []).map(s => s.elemento),
    ];
    const unicos = [...new Set(todosNombres)].sort();
    setElemsSimilares(unicos);

    setCargandoTol(false);
  };

  // Load tolerances when element selection changes
  useEffect(() => {
    if (elSel?.elemento && !elSel.esNuevo) {
      cargarTolerancias(elSel.elemento);
    } else {
      setTolerancias([]);
    }
  }, [elSel?.elemento, elSel?.esNuevo]);

  const getAccion = (revision: string, itemRevision: string, tolerancia: string): string => {
    // og_tolerancia_reparacion has revision/item_revision swapped vs og_catalogo
    // Try both orientations
    const rep = reparaciones.find(r =>
      r.tolerancia === tolerancia && (
        (r.revision === revision && r.item_revision === itemRevision) ||
        (r.revision === itemRevision && r.item_revision === revision)
      )
    );
    return rep?.accion ?? '—';
  };

  const getCodigo = (revision: string, itemRevision: string, tolerancia: string): string => {
    const rep = reparaciones.find(r =>
      r.tolerancia === tolerancia && (
        (r.revision === revision && r.item_revision === itemRevision) ||
        (r.revision === itemRevision && r.item_revision === revision)
      )
    );
    return rep?.codigo ?? '';
  };

  const getRepId = (revision: string, itemRevision: string, tolerancia: string): string | null => {
    const rep = reparaciones.find(r =>
      r.tolerancia === tolerancia && (
        (r.revision === revision && r.item_revision === itemRevision) ||
        (r.revision === itemRevision && r.item_revision === revision)
      )
    );
    return rep?.id ?? null;
  };

  const agregarTolerancia = async () => {
    if (!elSel || !nuevaTolTexto.trim()) return;
    const { error } = await supabase.from('og_catalogo').insert({
      revision: nuevaTolRevision,
      item_revision: nuevaTolItem,
      elemento: elSel.elemento,
      ambiente: nuevaTolAmbiente.trim() || null,
      tolerancia: nuevaTolTexto.trim(),
      fase: 'OBRA GRUESA',
      activo: true,
    });
    if (error) {
      setStatus({ msg: 'Error: ' + error.message, ok: false });
    } else {
      // If accion provided, add to reparaciones if doesn't exist
      if (nuevaTolAccion.trim()) {
        const exists = reparaciones.find(r =>
          r.revision === nuevaTolRevision && r.item_revision === nuevaTolItem && r.tolerancia === nuevaTolTexto.trim()
        );
        if (!exists) {
          await supabase.from('og_tolerancia_reparacion').insert({
            revision: nuevaTolRevision,
            item_revision: nuevaTolItem,
            tolerancia: nuevaTolTexto.trim(),
            accion: nuevaTolAccion.trim(),
            codigo: nuevaTolCodigo.trim() || null,
          });
        }
      }
      setNuevaTolTexto('');
      setNuevaTolAmbiente('');
      setNuevaTolAccion('');
      setNuevaTolCodigo('');
      await cargarTolerancias(elSel.elemento);
      setStatus({ msg: '✓ Tolerancia agregada', ok: true });
    }
  };

  const eliminarTolerancia = async (tolId: string) => {
    await supabase.from('og_catalogo').update({ activo: false }).eq('id', tolId);
    if (elSel) await cargarTolerancias(elSel.elemento);
  };

  const clonarTolerancias = async () => {
    if (!elSel || !clonarDesdeElem) return;
    setCargandoTol(true);

    // Get all tolerances from source element
    const { data: origen } = await supabase
      .from('og_catalogo')
      .select('revision, item_revision, ambiente, tolerancia, fase')
      .eq('elemento', clonarDesdeElem)
      .eq('activo', true);

    if (!origen || origen.length === 0) {
      setStatus({ msg: 'El elemento origen no tiene tolerancias', ok: false });
      setCargandoTol(false);
      return;
    }

    // Insert for new element
    const nuevas = origen.map(o => ({
      revision: o.revision,
      item_revision: o.item_revision,
      elemento: elSel.elemento,
      ambiente: o.ambiente,
      tolerancia: o.tolerancia,
      fase: o.fase,
      activo: true,
    }));

    const { error } = await supabase.from('og_catalogo').insert(nuevas);
    if (error) {
      setStatus({ msg: 'Error clonando: ' + error.message, ok: false });
    } else {
      setStatus({ msg: `✓ ${nuevas.length} tolerancia(s) clonadas de "${clonarDesdeElem}"`, ok: true });
      setShowClonarTol(false);
      setClonarDesdeElem('');
      await cargarTolerancias(elSel.elemento);
    }
    setCargandoTol(false);
  };

  const guardar = async () => {
    if (!grupoSel) return;
    setGuardando(true);
    setStatus(null);
    try {
      const modificados = elementos.filter(e => e.modificado === true || e.esNuevo === true);
      let count = 0;
      for (const el of modificados) {
        if (el.esNuevo === true) {
          const { error } = await supabase.from('og_elementos_ambiente').insert({
            grupo_imagen:  grupoSel.grupo_imagen,
            orientacion:   grupoSel.grupo_imagen.includes('IZQ') ? 'IZQ' : 'DER',
            ambiente_cod:  null,
            tipo_elemento: el.tipo_elemento,
            elemento:      el.elemento,
            subtipo_cod:   el.subtipo_cod,
            pos_x:         el.pos_x,
            pos_y:         el.pos_y,
            ancho:         el.ancho,
            alto:          el.alto,
            activo:        true,
          });
          if (!error) count++;
        } else if (el.id) {
          const { error } = await supabase.from('og_elementos_ambiente').update({
            pos_x:         el.pos_x,
            pos_y:         el.pos_y,
            ancho:         el.ancho,
            alto:          el.alto,
            tipo_elemento: el.tipo_elemento,
            elemento:      el.elemento,
            subtipo_cod:   el.subtipo_cod,
          }).eq('id', el.id);
          if (!error) count++;
        }
      }
      await cargarElementos(grupoSel.grupo_imagen);
      setElSel(null);
      setStatus({ msg: `✓ ${count} elemento(s) guardados`, ok: true });
    } catch (e: any) {
      setStatus({ msg: 'Error: ' + (e.message || 'desconocido'), ok: false });
    } finally {
      setGuardando(false);
    }
  };

  const aplicarEspejo = async () => {
    if (!grupoSel || !grupoEspejo) return;
    const destino = grupos.find(g => g.grupo_imagen === grupoEspejo);
    if (!destino) return;
    setAplicandoEspejo(true);
    setStatus(null);
    try {
      await supabase.from('og_elementos_ambiente').update({ activo: false }).eq('grupo_imagen', grupoEspejo);
      const rows = elementos.map(el => {
        let nx = el.pos_x;
        let ny = el.pos_y;
        if (espejoX) nx = grupoSel.ancho_orig - el.pos_x - el.ancho;
        if (espejoY) ny = grupoSel.alto_orig  - el.pos_y - el.alto;
        return {
          grupo_imagen:  grupoEspejo,
          orientacion:   grupoEspejo.includes('IZQ') ? 'IZQ' : 'DER',
          ambiente_cod:  null,
          tipo_elemento: el.tipo_elemento,
          elemento:      el.elemento,
          subtipo_cod:   el.subtipo_cod,
          pos_x:         Math.max(0, nx),
          pos_y:         Math.max(0, ny),
          ancho:         el.ancho,
          alto:          el.alto,
          activo:        true,
        };
      });
      if (rows.length > 0) {
        const { error } = await supabase.from('og_elementos_ambiente').insert(rows);
        if (error) throw error;
      }
      setStatus({ msg: `✓ ${rows.length} elemento(s) espejados a ${grupoEspejo}`, ok: true });
    } catch (e: any) {
      setStatus({ msg: 'Error espejo: ' + (e.message || 'desconocido'), ok: false });
    } finally {
      setAplicandoEspejo(false);
    }
  };

  // Clona UN solo elemento (elSel) hacia otro grupo de imagen.
  // A diferencia de aplicarEspejo, NO desactiva los elementos existentes en
  // el destino — solo agrega este elemento puntual, útil cuando ya calibraste
  // el resto del grupo destino y solo falta copiar uno.
  const clonarElementoIndividual = async () => {
    if (!grupoSel || !elSel || !grupoClonElem) return;
    const destino = grupos.find(g => g.grupo_imagen === grupoClonElem);
    if (!destino) return;
    setClonandoElemento(true);
    setStatus(null);
    try {
      let nx = elSel.pos_x;
      let ny = elSel.pos_y;
      if (clonElemEspejoX) nx = grupoSel.ancho_orig - elSel.pos_x - elSel.ancho;
      if (clonElemEspejoY) ny = grupoSel.alto_orig  - elSel.pos_y - elSel.alto;
      const { error } = await supabase.from('og_elementos_ambiente').insert({
        grupo_imagen:  grupoClonElem,
        orientacion:   grupoClonElem.includes('IZQ') ? 'IZQ' : 'DER',
        ambiente_cod:  null,
        tipo_elemento: elSel.tipo_elemento,
        elemento:      elSel.elemento,
        subtipo_cod:   elSel.subtipo_cod,
        pos_x:         Math.max(0, nx),
        pos_y:         Math.max(0, ny),
        ancho:         elSel.ancho,
        alto:          elSel.alto,
        activo:        true,
      });
      if (error) throw error;
      setStatus({ msg: `✓ "${elSel.elemento}" clonado a ${grupoClonElem}`, ok: true });
      setGrupoClonElem('');
    } catch (e: any) {
      setStatus({ msg: 'Error clonando elemento: ' + (e.message || 'desconocido'), ok: false });
    } finally {
      setClonandoElemento(false);
    }
  };

  const colorPorTipo = (tipo: string, sel: boolean) => {
    if (sel) return { bg: 'rgba(245,158,11,0.35)', border: '#f59e0b' };
    switch (tipo) {
      case 'Muros': return { bg: 'rgba(37,99,235,0.2)',  border: 'rgba(37,99,235,0.8)'  };
      case 'Vanos': return { bg: 'rgba(245,158,11,0.2)', border: 'rgba(245,158,11,0.8)' };
      default:      return { bg: 'rgba(100,100,100,0.2)',border: 'rgba(100,100,100,0.6)'};
    }
  };

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
  const sToggle = (activo: boolean): React.CSSProperties => ({
    flex: 1, height: 34, borderRadius: 8, fontSize: 11, fontWeight: 600,
    border: `0.5px solid ${activo ? azulBord : inputBorder}`,
    background: activo ? azulBg : 'transparent',
    color: activo ? azul : textMuted, cursor: 'pointer',
  });

  const otrosGrupos = grupos.filter(g => g.grupo_imagen !== grupoSel?.grupo_imagen);
  const nCambios = elementos.filter(e => e.modificado || e.esNuevo).length;

  // Elementos visibles según filtro
  const elementosVisibles = filtroVista === 'Todos'
    ? elementos
    : elementos.filter(e => e.tipo_elemento === filtroVista);

  // Líneas guía: bordes de todos los elementos visibles
  const guias = mostrarGuias ? elementosVisibles.flatMap(el => {
    const x1 = Math.round(el.pos_x * scaleX);
    const y1 = Math.round(el.pos_y * scaleY);
    const x2 = Math.round((el.pos_x + el.ancho) * scaleX);
    const y2 = Math.round((el.pos_y + el.alto) * scaleY);
    return [
      { tipo: 'v', pos: x1 }, { tipo: 'v', pos: x2 },
      { tipo: 'h', pos: y1 }, { tipo: 'h', pos: y2 },
    ];
  }) : [];

  // Cuadrícula: líneas cada SNAP px
  const lineasCuadricula: { tipo: 'v' | 'h'; pos: number }[] = [];
  if (mostrarCuadricula && grupoSel && contenedorW > 0 && alturaImg > 0) {
    for (let x = 0; x <= grupoSel.ancho_orig; x += SNAP)
      lineasCuadricula.push({ tipo: 'v', pos: Math.round(x * scaleX) });
    for (let y = 0; y <= grupoSel.alto_orig; y += SNAP)
      lineasCuadricula.push({ tipo: 'h', pos: Math.round(y * scaleY) });
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#ffffff', '--border-color': 'transparent' } as any}>
          <IonMenuButton slot="start" menu="menu-lateral"
            style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' } as any} />
          <IonTitle style={{ fontSize: 15, fontWeight: 600 }}>🎯 Calibrador de Elementos OG</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg } as any}>
        <div style={{ padding: 14, paddingBottom: 60 }}>

          {/* Selector de grupo */}
          <div style={sCard}>
            <div style={sLabel}>1 · SELECCIONA IMAGEN DE AMBIENTE</div>
            {cargando ? (
              <div style={{ fontSize: 13, color: textMuted }}>Cargando...</div>
            ) : (
              <select
                style={sInput}
                value={grupoSel?.grupo_imagen || ''}
                onChange={e => onGrupoChange(e.target.value)}
              >
                <option value="">-- selecciona grupo --</option>
                {grupos.map(g => (
                  <option key={g.grupo_imagen} value={g.grupo_imagen}>{g.grupo_imagen}</option>
                ))}
              </select>
            )}
          </div>

          {grupoSel && (
            <>
              {/* Agregar elemento */}
              <div style={sCard}>
                <div style={sLabel}>2 · AGREGAR ELEMENTO</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    style={{ ...sInput, flex: 2 }}
                    placeholder="Nombre del elemento"
                    value={nuevoNombre}
                    onChange={e => setNuevoNombre(e.target.value)}
                  />
                  <select
                    style={{ ...sInput, flex: 1 }}
                    value={nuevoTipo}
                    onChange={e => setNuevoTipo(e.target.value)}
                  >
                    {TIPOS_ELEMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    style={{ ...sInput, flex: 1 }}
                    placeholder="Subtipo (ej: MUR)"
                    value={nuevoSubtipo}
                    onChange={e => setNuevoSubtipo(e.target.value)}
                  />
                  <button
                    onClick={agregarElemento}
                    style={{
                      flex: 'none', padding: '0 16px', height: 40, borderRadius: 10,
                      border: `0.5px solid ${azulBord}`, background: azulBg,
                      color: azul, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >+ Agregar</button>
                </div>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button
                  onClick={eliminarElemento}
                  disabled={!elSel}
                  style={{
                    flex: 1, height: 38, borderRadius: 10,
                    border: `0.5px solid ${rojoBord}`, background: rojoBg,
                    color: rojo, fontSize: 12, fontWeight: 600,
                    cursor: elSel ? 'pointer' : 'not-allowed', opacity: elSel ? 1 : 0.4,
                  }}
                >🗑 Eliminar</button>
                <button
                  onClick={guardar}
                  disabled={guardando || nCambios === 0}
                  style={{
                    flex: 2, height: 38, borderRadius: 10,
                    border: `0.5px solid ${nCambios > 0 ? verdeBord : inputBorder}`,
                    background: nCambios > 0 ? verdeBg : 'transparent',
                    color: nCambios > 0 ? verde : textMuted,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    opacity: guardando ? 0.6 : 1,
                  }}
                >{guardando ? 'Guardando...' : `💾 Guardar (${nCambios} cambios)`}</button>
              </div>

              {/* Info elemento seleccionado */}
              {elSel && (
                <div style={{
                  ...sCard, padding: '10px 14px',
                  background: naranjaBg, border: `0.5px solid ${naranjaBord}`, marginBottom: 10,
                }}>
                  <div style={{ fontSize: 11, color: naranja, fontWeight: 700, marginBottom: 4 }}>
                    {elSel.elemento} · {elSel.tipo_elemento}
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginBottom: 8 }}>
                    x:{elSel.pos_x} y:{elSel.pos_y} · w:{elSel.ancho} h:{elSel.alto}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <select
                      style={{ ...sInput, flex: 1, height: 34, fontSize: 12 }}
                      value={elSel.tipo_elemento}
                      onChange={e => {
                        elSel.tipo_elemento = e.target.value;
                        elSel.modificado = true;
                        setElementos(prev => [...prev]);
                        setElSel({ ...elSel });
                      }}
                    >
                      {TIPOS_ELEMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      style={{ ...sInput, flex: 2, height: 34, fontSize: 12 }}
                      value={elSel.elemento}
                      onChange={e => {
                        elSel.elemento = e.target.value;
                        elSel.modificado = true;
                        setElementos(prev => [...prev]);
                        setElSel({ ...elSel });
                      }}
                    />
                  </div>
                  {/* Botón igualar dimensiones */}
                  <button
                    onClick={() => igualarDimensiones(elSel)}
                    style={{
                      width: '100%', height: 32, borderRadius: 8, fontSize: 11, fontWeight: 600,
                      border: `0.5px solid ${azulBord}`, background: azulBg, color: azul, cursor: 'pointer',
                    }}
                  >
                    📐 Igualar w:{elSel.ancho} h:{elSel.alto} a todos los {elSel.tipo_elemento}
                  </button>

                  {/* ── Panel de tolerancias y reparaciones ── */}
                  {!elSel.esNuevo && (
                    <div style={{ marginTop: 10, borderTop: `1px solid ${naranjaBord}`, paddingTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: naranja, textTransform: 'uppercase', letterSpacing: 1 }}>
                          Tolerancias ({tolerancias.length})
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => { setShowClonarTol(!showClonarTol); setShowAddTol(false); }}
                            style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                              border: `1px solid ${azulBord}`, background: showClonarTol ? azulBg : 'transparent',
                              color: azul, cursor: 'pointer',
                            }}
                          >📋 Clonar</button>
                          <button
                            onClick={() => {
                              const abrir = !showAddTol;
                              setShowAddTol(abrir);
                              setShowClonarTol(false);
                              // Los elementos "PIERNA..." tienen una regla fija en la
                              // pantalla de terreno (RevisionOGAmbiente.tsx): buscan la
                              // tolerancia con revision="PIERNA" sin importar qué se elija
                              // acá. Se preselecciona solo para que no quede guardada con
                              // un valor (ej. "VANO") que la app de terreno nunca va a
                              // encontrar.
                              if (abrir && elSel?.elemento?.toUpperCase().startsWith('PIERNA')) {
                                setNuevaTolRevision('PIERNA');
                              }
                            }}
                            style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                              border: `1px solid ${verdeBord}`, background: showAddTol ? verdeBg : 'transparent',
                              color: verde, cursor: 'pointer',
                            }}
                          >+ Nueva</button>
                        </div>
                      </div>

                      {cargandoTol && <div style={{ fontSize: 11, color: textMuted, padding: 8 }}>Cargando...</div>}

                      {/* Clone panel */}
                      {showClonarTol && (
                        <div style={{ padding: 8, borderRadius: 8, background: azulBg, border: `1px solid ${azulBord}`, marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: textSecondary, marginBottom: 6 }}>
                            Clonar tolerancias de otro elemento:
                          </div>
                          <select
                            style={{ ...sInput, height: 34, fontSize: 11, marginBottom: 6 }}
                            value={clonarDesdeElem}
                            onChange={e => setClonarDesdeElem(e.target.value)}
                          >
                            <option value="">-- selecciona elemento origen --</option>
                            {elemsSimilares.filter(e => e !== elSel.elemento).map(e => (
                              <option key={e} value={e}>{e}</option>
                            ))}
                          </select>
                          <button
                            onClick={clonarTolerancias}
                            disabled={!clonarDesdeElem || cargandoTol}
                            style={{
                              width: '100%', height: 30, borderRadius: 6, fontSize: 11, fontWeight: 600,
                              border: 'none', background: clonarDesdeElem ? azul : inputBorder,
                              color: '#fff', cursor: clonarDesdeElem ? 'pointer' : 'not-allowed',
                            }}
                          >{cargandoTol ? 'Clonando...' : `Clonar tolerancias de ${clonarDesdeElem || '...'}`}</button>
                        </div>
                      )}

                      {/* Add new tolerance panel */}
                      {showAddTol && (
                        <div style={{ padding: 8, borderRadius: 8, background: verdeBg, border: `1px solid ${verdeBord}`, marginBottom: 8 }}>
                          {elSel?.elemento?.toUpperCase().startsWith('PIERNA') && (
                            <div style={{ fontSize: 10, color: naranja, marginBottom: 6, lineHeight: 1.4 }}>
                              ⚠ Este elemento empieza con "PIERNA" — la app de terreno solo
                              encuentra tolerancias guardadas con Revisión = PIERNA, por eso
                              ese campo quedó fijo abajo.
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: textMuted, marginBottom: 2 }}>Revisión</div>
                              <select
                                style={{ ...sInput, width: '100%', height: 30, fontSize: 11 }}
                                value={nuevaTolRevision}
                                disabled={elSel?.elemento?.toUpperCase().startsWith('PIERNA')}
                                onChange={e => setNuevaTolRevision(e.target.value)}
                              >
                                <option value="MURO">MURO</option>
                                <option value="PLANEIDAD">PLANEIDAD</option>
                                <option value="PLOMO">PLOMO</option>
                                <option value="VANO">VANO</option>
                                <option value="PIERNA">PIERNA</option>
                              </select>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: textMuted, marginBottom: 2 }}>Tipo (ítem)</div>
                              <select
                                style={{ ...sInput, width: '100%', height: 30, fontSize: 11 }}
                                value={nuevaTolItem}
                                onChange={e => setNuevaTolItem(e.target.value)}
                              >
                                <option value="PLANEIDAD">PLANEIDAD</option>
                                <option value="CORNISA">CORNISA</option>
                                <option value="OTROS">OTROS</option>
                                <option value="PLOMO">PLOMO</option>
                                <option value="ANCHO">ANCHO</option>
                                <option value="LOSA">LOSA</option>
                                <option value="POSICION SALIDA AGUA">POS. AGUA</option>
                              </select>
                            </div>
                          </div>
                          <input
                            style={{ ...sInput, height: 30, fontSize: 11, marginBottom: 4 }}
                            placeholder="Tolerancia (ej: ENTRE +7 Y +10MM)"
                            value={nuevaTolTexto}
                            onChange={e => setNuevaTolTexto(e.target.value)}
                          />
                          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                            <input
                              style={{ ...sInput, flex: 1, height: 30, fontSize: 11 }}
                              placeholder="Ambiente (opcional)"
                              value={nuevaTolAmbiente}
                              onChange={e => setNuevaTolAmbiente(e.target.value)}
                            />
                            <select
                              style={{ ...sInput, flex: 2, height: 30, fontSize: 11 }}
                              value={nuevaTolAccion}
                              onChange={e => {
                                const seleccion = ACCIONES_REPARACION.find(a => a.accion === e.target.value);
                                setNuevaTolAccion(seleccion?.accion ?? '');
                                setNuevaTolCodigo(seleccion?.codigo ?? '');
                              }}
                            >
                              <option value="">-- Acción de reparación --</option>
                              {ACCIONES_REPARACION.map(a => (
                                <option key={a.accion} value={a.accion}>{a.label}</option>
                              ))}
                            </select>
                            <input
                              style={{
                                ...sInput, flex: 1, height: 30, fontSize: 11,
                                textTransform: 'uppercase', textAlign: 'center',
                                color: textMuted, background: dark ? 'rgba(255,255,255,0.03)' : '#f1f5f9',
                              }}
                              placeholder="Cód."
                              value={nuevaTolCodigo}
                              readOnly
                              title="Se completa solo según la acción elegida"
                            />
                          </div>
                          <button
                            onClick={agregarTolerancia}
                            disabled={!nuevaTolTexto.trim()}
                            style={{
                              width: '100%', height: 30, borderRadius: 6, fontSize: 11, fontWeight: 600,
                              border: 'none', background: nuevaTolTexto.trim() ? verde : inputBorder,
                              color: '#fff', cursor: nuevaTolTexto.trim() ? 'pointer' : 'not-allowed',
                            }}
                          >+ Agregar tolerancia</button>
                        </div>
                      )}

                      {/* Tolerance list */}
                      {!cargandoTol && tolerancias.length === 0 && (
                        <div style={{ fontSize: 11, color: textMuted, padding: '8px 0', textAlign: 'center' }}>
                          Sin tolerancias definidas — usa Clonar o Nueva
                        </div>
                      )}

                      {!cargandoTol && tolerancias.length > 0 && (
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                          {tolerancias.map(tol => {
                            const accion = getAccion(tol.revision, tol.item_revision, tol.tolerancia);
                            const codigo = getCodigo(tol.revision, tol.item_revision, tol.tolerancia);
                            return (
                              <div
                                key={tol.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  padding: '5px 8px', borderRadius: 6, marginBottom: 3,
                                  border: `0.5px solid ${border}`, fontSize: 11,
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, color: '#fff', padding: '1px 5px',
                                      borderRadius: 4, background: tol.revision === 'MURO' ? azul : naranja,
                                    }}>{tol.item_revision}</span>
                                    <span style={{ fontSize: 9, color: textMuted, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                      <MapPin size={9} strokeWidth={2.25} />
                                      <select
                                        style={{
                                          border: `1px solid ${tol.ambiente ? verdeBord : rojoBord}`,
                                          borderRadius: 3, padding: '0 4px', fontSize: 9,
                                          background: 'transparent', color: tol.ambiente ? verde : rojo,
                                          outline: 'none', fontWeight: 600, maxWidth: 100,
                                          cursor: guardandoAmbId === tol.id ? 'wait' : 'pointer',
                                          opacity: guardandoAmbId === tol.id ? 0.5 : 1,
                                        }}
                                        value={tol.ambiente ?? ''}
                                        disabled={guardandoAmbId === tol.id}
                                        onChange={async (e) => {
                                          const nuevoAmb = e.target.value || null;
                                          if (nuevoAmb === (tol.ambiente ?? '')) return;
                                          setGuardandoAmbId(tol.id);
                                          try {
                                            const { error } = await supabase
                                              .from('og_catalogo')
                                              .update({ ambiente: nuevoAmb })
                                              .eq('id', tol.id);
                                            if (error) throw error;
                                            setTolerancias(prev => prev.map(t =>
                                              t.id === tol.id ? { ...t, ambiente: nuevoAmb } : t
                                            ));
                                            setStatus({ msg: `✓ Ambiente → ${nuevoAmb || '(vacío)'}`, ok: true });
                                          } catch (err: any) {
                                            setStatus({ msg: 'Error: ' + (err.message || 'desconocido'), ok: false });
                                          } finally {
                                            setGuardandoAmbId(null);
                                          }
                                        }}
                                      >
                                        <option value="">— sin ambiente —</option>
                                        {ambientesDisponibles.map(a => (
                                          <option key={a} value={a}>{a}</option>
                                        ))}
                                        {tol.ambiente && !ambientesDisponibles.includes(tol.ambiente) && (
                                          <option value={tol.ambiente}>{tol.ambiente} (no estándar)</option>
                                        )}
                                      </select>
                                    </span>
                                  </div>
                                  <div style={{ fontWeight: 600, color: textPrimary, fontSize: 11 }}>
                                    {tol.tolerancia}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                    <span style={{ fontSize: 10, color: textMuted, flexShrink: 0, display: 'inline-flex' }}><Wrench size={11} strokeWidth={2.25} /></span>
                                    {(() => {
                                      const accionActual = accion !== '—' ? accion : '';
                                      const canonica = getAccionReparacionPorTexto(accionActual);
                                      const valorSelect = canonica?.accion ?? accionActual;
                                      const guardandoEsta = guardandoRepId === tol.id;
                                      return (
                                        <select
                                          style={{
                                            flex: 1, minWidth: 0, border: `1px solid ${accion !== '—' ? verdeBord : rojoBord}`,
                                            borderRadius: 4, padding: '2px 6px', fontSize: 10,
                                            background: 'transparent', color: accion !== '—' ? verde : rojo,
                                            outline: 'none', fontWeight: 600,
                                            cursor: guardandoEsta ? 'wait' : 'pointer',
                                            opacity: guardandoEsta ? 0.6 : 1,
                                          }}
                                          value={valorSelect}
                                          disabled={guardandoEsta}
                                          onChange={async (e) => {
                                            const seleccion = ACCIONES_REPARACION.find(a => a.accion === e.target.value);
                                            if (!seleccion || seleccion.accion === canonica?.accion) return;
                                            setGuardandoRepId(tol.id);
                                            try {
                                              const existingId = getRepId(tol.revision, tol.item_revision, tol.tolerancia);
                                              if (existingId) {
                                                const { error } = await supabase
                                                  .from('og_tolerancia_reparacion')
                                                  .update({ accion: seleccion.accion, codigo: seleccion.codigo })
                                                  .eq('id', existingId);
                                                if (error) throw error;
                                              } else {
                                                // Use item_revision as revision (matching the swapped convention)
                                                const { error } = await supabase
                                                  .from('og_tolerancia_reparacion')
                                                  .insert({
                                                    revision: tol.item_revision,
                                                    item_revision: tol.revision,
                                                    tolerancia: tol.tolerancia,
                                                    accion: seleccion.accion,
                                                    codigo: seleccion.codigo,
                                                  });
                                                if (error) throw error;
                                              }
                                              // Refresh reparaciones
                                              const { data: reps } = await supabase
                                                .from('og_tolerancia_reparacion')
                                                .select('id, revision, item_revision, tolerancia, accion, codigo');
                                              setReparaciones(reps ?? []);
                                              setStatus({ msg: `✓ Reparación "${seleccion.label}" (${seleccion.codigo}) guardada`, ok: true });
                                            } catch (err: any) {
                                              setStatus({ msg: 'Error guardando reparación: ' + (err.message || 'desconocido'), ok: false });
                                            } finally {
                                              setGuardandoRepId(null);
                                            }
                                          }}
                                        >
                                          <option value="">-- definir acción --</option>
                                          {!canonica && accionActual && (
                                            <option value={accionActual}>{accionActual} (texto anterior)</option>
                                          )}
                                          {ACCIONES_REPARACION.map(a => (
                                            <option key={a.accion} value={a.accion}>{a.label}</option>
                                          ))}
                                        </select>
                                      );
                                    })()}
                                    <div
                                      title="Código corto para reconocer la reparación en terreno — se completa solo según la acción elegida"
                                      style={{
                                        width: 44, flexShrink: 0, border: `1px solid ${codigo ? verdeBord : inputBorder}`,
                                        borderRadius: 4, padding: '2px 6px', fontSize: 10, textAlign: 'center',
                                        color: codigo ? verde : textMuted, fontWeight: 700,
                                      }}
                                    >{codigo || '—'}</div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => eliminarTolerancia(tol.id)}
                                  style={{
                                    padding: '2px 6px', borderRadius: 4, fontSize: 9,
                                    border: `1px solid ${rojoBord}`, background: 'transparent',
                                    color: rojo, cursor: 'pointer', flexShrink: 0,
                                  }}
                                >✕</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Status */}
              {status && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                  fontSize: 13, fontWeight: 600,
                  background: status.ok ? verdeBg : rojoBg,
                  border: `0.5px solid ${status.ok ? verdeBord : rojoBord}`,
                  color: status.ok ? verde : rojo,
                }}>{status.msg}</div>
              )}

              {/* ── Controles de vista ─────────────────────────────────── */}
              <div style={sCard}>
                <div style={sLabel}>3 · VISTA Y AYUDAS</div>

                {/* Filtro Todos / Muros / Vanos */}
                <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                  {(['Todos', 'Muros', 'Vanos'] as FiltroVista[]).map(f => (
                    <button
                      key={f}
                      onClick={() => { setFiltroVista(f); if (elSel && f !== 'Todos' && elSel.tipo_elemento !== f) setElSel(null); }}
                      style={{
                        ...sToggle(filtroVista === f),
                        background: filtroVista === f
                          ? f === 'Muros' ? 'rgba(37,99,235,0.15)'
                          : f === 'Vanos' ? 'rgba(245,158,11,0.15)'
                          : azulBg
                          : 'transparent',
                        border: `0.5px solid ${filtroVista === f
                          ? f === 'Muros' ? 'rgba(37,99,235,0.6)'
                          : f === 'Vanos' ? 'rgba(245,158,11,0.6)'
                          : azulBord
                          : inputBorder}`,
                        color: filtroVista === f
                          ? f === 'Muros' ? azul
                          : f === 'Vanos' ? naranja
                          : azul
                          : textMuted,
                      }}
                    >{f}</button>
                  ))}
                </div>

                {/* Ayudas */}
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={() => setMostrarGuias(v => !v)} style={sToggle(mostrarGuias)}>
                    📏 Guías {mostrarGuias ? '✓' : ''}
                  </button>
                  <button onClick={() => setMostrarCuadricula(v => !v)} style={sToggle(mostrarCuadricula)}>
                    ⊞ Cuadrícula {mostrarCuadricula ? '✓' : ''}
                  </button>
                  <button onClick={() => setSnapActivo(v => !v)} style={sToggle(snapActivo)}>
                    🧲 Snap {snapActivo ? `${SNAP}px ✓` : ''}
                  </button>
                </div>
              </div>

              {/* Instrucción */}
              <div style={{ fontSize: 11, color: textSecondary, textAlign: 'center', marginBottom: 6 }}>
                4 · POSICIONA LOS ELEMENTOS — arrastra para mover · esquina inferior derecha para redimensionar
              </div>

              {/* Imagen con hotspots */}
              <div
                ref={contenedorRef}
                style={{
                  position: 'relative', width: '100%',
                  borderRadius: 14, overflow: 'hidden',
                  border: `0.5px solid ${border}`,
                  background: dark ? '#0a0a0a' : '#f8fafc',
                  height: alturaImg > 0 ? alturaImg : 'auto',
                  minHeight: 200, touchAction: 'none',
                }}
              >
                <img
                  src={grupoSel.imagen_url}
                  alt={grupoSel.grupo_imagen}
                  onLoad={onImgLoad}
                  style={{
                    width: '100%', height: alturaImg > 0 ? '100%' : 'auto',
                    objectFit: 'fill', display: 'block',
                    pointerEvents: 'none', userSelect: 'none',
                  }}
                />

                {/* Cuadrícula */}
                {imgCargada && mostrarCuadricula && lineasCuadricula.map((l, i) => (
                  <div key={`cg_${i}`} style={{
                    position: 'absolute', pointerEvents: 'none',
                    ...(l.tipo === 'v'
                      ? { left: l.pos, top: 0, width: 1, height: '100%', background: 'rgba(100,100,255,0.12)' }
                      : { top: l.pos, left: 0, height: 1, width: '100%', background: 'rgba(100,100,255,0.12)' }),
                  }} />
                ))}

                {/* Líneas guía */}
                {imgCargada && mostrarGuias && guias.map((l, i) => (
                  <div key={`g_${i}`} style={{
                    position: 'absolute', pointerEvents: 'none',
                    ...(l.tipo === 'v'
                      ? { left: l.pos, top: 0, width: 1, height: '100%', background: 'rgba(255,50,50,0.35)' }
                      : { top: l.pos, left: 0, height: 1, width: '100%', background: 'rgba(255,50,50,0.35)' }),
                  }} />
                ))}

                {/* Hotspots */}
                {imgCargada && contenedorW > 0 && elementosVisibles.map((el, i) => {
                  const isSel = el === elSel;
                  const col = colorPorTipo(el.tipo_elemento, isSel);
                  const left   = Math.round(el.pos_x * scaleX);
                  const top    = Math.round(el.pos_y * scaleY);
                  const width  = Math.round(el.ancho  * scaleX);
                  const height = Math.round(el.alto   * scaleY);

                  return (
                    <div
                      key={el.id || `nuevo_${i}`}
                      onMouseDown={ev => { setElSel(el); startDrag(ev, el); }}
                      onTouchStart={ev => { setElSel(el); startDrag(ev, el); }}
                      style={{
                        position: 'absolute', left, top, width, height,
                        border: `${isSel ? 2 : 1.5}px solid ${col.border}`,
                        background: col.bg, cursor: 'move',
                        boxSizing: 'border-box', touchAction: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <span style={{
                        fontSize: Math.max(7, Math.min(11, width * 0.12)),
                        fontWeight: 700,
                        color: isSel ? naranja : (dark ? '#fff' : '#1e3a5f'),
                        textShadow: '0 1px 2px rgba(255,255,255,0.8)',
                        pointerEvents: 'none', textAlign: 'center',
                        wordBreak: 'break-word', maxWidth: '90%', lineHeight: 1.1,
                      }}>{el.elemento}</span>

                      {isSel && (
                        <div
                          onMouseDown={ev => startResize(ev, el)}
                          onTouchStart={ev => startResize(ev, el)}
                          style={{
                            position: 'absolute', bottom: -6, right: -6,
                            width: 14, height: 14, background: '#fff',
                            border: `2px solid ${naranja}`, borderRadius: 3,
                            cursor: 'se-resize', zIndex: 10, touchAction: 'none',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Lista de elementos */}
              {elementosVisibles.length > 0 && (
                <div style={{ ...sCard, marginTop: 10 }}>
                  <div style={{ ...sLabel, marginBottom: 8 }}>
                    ELEMENTOS ({elementosVisibles.length}{filtroVista !== 'Todos' ? ` · ${filtroVista}` : ''})
                  </div>
                  {elementosVisibles.map((el, i) => {
                    const fueraDeVista = grupoSel && (
                      (el.pos_x + el.ancho) > grupoSel.ancho_orig ||
                      (el.pos_y + el.alto) > grupoSel.alto_orig ||
                      el.pos_x < 0 || el.pos_y < 0
                    );
                    return (
                    <div
                      key={el.id || `nuevo_${i}`}
                      onClick={() => setElSel(el)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px', borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                        background: el === elSel ? naranjaBg : fueraDeVista ? rojoBg : 'transparent',
                        border: `0.5px solid ${el === elSel ? naranjaBord : fueraDeVista ? rojoBord : border}`,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>{el.elemento}</span>
                        <span style={{ fontSize: 10, color: textMuted, marginLeft: 6 }}>{el.tipo_elemento}</span>
                        {el.esNuevo && <span style={{ fontSize: 9, color: azul, marginLeft: 6, fontWeight: 700 }}>NUEVO</span>}
                        {el.modificado && !el.esNuevo && <span style={{ fontSize: 9, color: naranja, marginLeft: 6, fontWeight: 700 }}>MOD</span>}
                        {fueraDeVista && !el.esNuevo && !el.modificado && <span style={{ fontSize: 9, color: rojo, marginLeft: 6, fontWeight: 700 }}>OCULTO</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={ev => {
                            ev.stopPropagation();
                            if (!grupoSel) return;
                            const cx = Math.round((grupoSel.ancho_orig - el.ancho) / 2);
                            const cy = Math.round((grupoSel.alto_orig - el.alto) / 2);
                            setElementos(prev => prev.map(e =>
                              e === el ? { ...e, pos_x: cx, pos_y: cy, modificado: true } : e
                            ));
                            setElSel({ ...el, pos_x: cx, pos_y: cy, modificado: true });
                          }}
                          style={{
                            padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                            border: `1px solid ${fueraDeVista ? rojoBord : border}`,
                            background: fueraDeVista ? rojoBg : 'transparent',
                            color: fueraDeVista ? rojo : textMuted,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                          title="Llevar al centro de la imagen"
                        >⊕ Centro</button>
                        <span style={{ fontSize: 10, color: textMuted }}>
                          {el.pos_x},{el.pos_y}
                        </span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {/* Espejo */}
              <div style={{ ...sCard, marginTop: 10, border: `0.5px solid ${azulBord}` }}>
                <div style={sLabel}>5 · ESPEJAR ELEMENTOS A OTRO GRUPO</div>
                <div style={{ fontSize: 12, color: textSecondary, marginBottom: 10 }}>
                  Copia y espeja todos los elementos del grupo actual al grupo destino. Los elementos existentes en el destino serán reemplazados.
                </div>
                <select
                  style={{ ...sInput, marginBottom: 8 }}
                  value={grupoEspejo}
                  onChange={e => setGrupoEspejo(e.target.value)}
                >
                  <option value="">-- selecciona grupo destino --</option>
                  {otrosGrupos.map(g => (
                    <option key={g.grupo_imagen} value={g.grupo_imagen}>{g.grupo_imagen}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setEspejoX(v => !v)} style={sToggle(espejoX)}>↔ Espejo X {espejoX ? '✓' : ''}</button>
                  <button onClick={() => setEspejoY(v => !v)} style={sToggle(espejoY)}>↕ Espejo Y {espejoY ? '✓' : ''}</button>
                </div>
                <button
                  onClick={aplicarEspejo}
                  disabled={!grupoEspejo || (!espejoX && !espejoY) || aplicandoEspejo || elementos.length === 0}
                  style={{
                    width: '100%', height: 42, borderRadius: 10, border: 'none',
                    fontSize: 13, fontWeight: 700,
                    background: grupoEspejo && (espejoX || espejoY) ? '#1e3a5f' : (dark ? '#16233B' : '#e2e8f0'),
                    color: grupoEspejo && (espejoX || espejoY) ? '#fff' : textMuted,
                    cursor: grupoEspejo && (espejoX || espejoY) ? 'pointer' : 'not-allowed',
                  }}
                >
                  {aplicandoEspejo ? 'Aplicando...' : `🪞 Espejar ${elementos.length} elemento(s) → ${grupoEspejo || '...'}`}
                </button>
              </div>

              {/* Clonar UN elemento individual */}
              <div style={{ ...sCard, marginTop: 10, border: `0.5px solid ${verdeBord}` }}>
                <div style={sLabel}>6 · CLONAR ESTE ELEMENTO A OTRO GRUPO</div>
                {!elSel ? (
                  <div style={{ fontSize: 12, color: textMuted, fontStyle: 'italic' }}>
                    Selecciona un elemento arriba (en la imagen o en la lista) para poder clonarlo.
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: textSecondary, marginBottom: 10 }}>
                      Copia solo <b style={{ color: textPrimary }}>{elSel.elemento}</b> ({elSel.tipo_elemento}) al grupo
                      destino, sin tocar los demás elementos que ya existan ahí.
                    </div>
                    <select
                      style={{ ...sInput, marginBottom: 8 }}
                      value={grupoClonElem}
                      onChange={e => setGrupoClonElem(e.target.value)}
                    >
                      <option value="">-- selecciona grupo destino --</option>
                      {otrosGrupos.map(g => (
                        <option key={g.grupo_imagen} value={g.grupo_imagen}>{g.grupo_imagen}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <button onClick={() => setClonElemEspejoX(v => !v)} style={sToggle(clonElemEspejoX)}>↔ Espejo X {clonElemEspejoX ? '✓' : ''}</button>
                      <button onClick={() => setClonElemEspejoY(v => !v)} style={sToggle(clonElemEspejoY)}>↕ Espejo Y {clonElemEspejoY ? '✓' : ''}</button>
                    </div>
                    <button
                      onClick={clonarElementoIndividual}
                      disabled={!grupoClonElem || clonandoElemento}
                      style={{
                        width: '100%', height: 42, borderRadius: 10, border: 'none',
                        fontSize: 13, fontWeight: 700,
                        background: grupoClonElem ? verde : (dark ? '#16233B' : '#e2e8f0'),
                        color: grupoClonElem ? '#fff' : textMuted,
                        cursor: grupoClonElem ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {clonandoElemento ? 'Clonando...' : `📋 Clonar "${elSel.elemento}" → ${grupoClonElem || '...'}`}
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {!grupoSel && !cargando && (
            <div style={{ ...sCard, textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎯</div>
              <div style={{ fontSize: 14, color: textSecondary }}>Selecciona una imagen de ambiente para comenzar</div>
            </div>
          )}

        </div>
      </IonContent>
    </IonPage>
  );
};

export default CalibradorElementos;
// src/utils/ogCache.ts — FMS
// Pre-caching completo del módulo OG para modo offline.
// Tablas cacheadas:
//   og_catalogo            → tolerancias por elemento/ambiente
//   og_elementos_detalle   → elementos por grupo_imagen (overlay Fase 2)
//   og_config_ambientes    → config por tipo_depto
//   departamentos (OG)     → deptos por torre_id (para desplegar sin red)
//   og_planos              → URL del plano por plano_version_id
//   og_planos_ambientes    → hotspots del plano por plano_version_id
//   og_imagenes_ambiente   → imagen + dimensiones por grupo_imagen
//   og_elementos_ambiente  → elementos con coordenadas px por grupo_imagen

import { supabase } from '../supabase';

// ─── Claves localStorage ─────────────────────────────────────────────────────
const KEY_CATALOGO        = 'og_catalogo_cache';
const KEY_ELEMENTOS       = 'og_elementos_cache';
const KEY_CONFIG          = 'og_config_cache';
const KEY_TS              = 'og_cache_timestamp';
const KEY_DEPTOS          = 'og_deptos_cache';
const KEY_PLANOS          = 'og_planos_cache';
const KEY_AMBIENTES_PLANO = 'og_ambientes_plano_cache';
const KEY_IMAGENES_AMB    = 'og_imagenes_amb_cache';
const KEY_ELEMENTOS_AMB   = 'og_elementos_amb_cache';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_NAME   = 'og-imagenes-v1';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface OgCatalogoRow {
  id: string;
  revision: string;
  item_revision: string;
  elemento: string;
  ambiente: string;
  tolerancia: string;
  fase: string;
  activo: boolean;
}

export interface OgElementoRow {
  id: string;
  grupo_imagen: string;
  orientacion: string;
  ambiente: string;
  subtipo_cod: string;
  elemento: string;
  pos_x_pct: number | null;
  pos_y_pct: number | null;
  ancho_pct: number | null;
  alto_pct: number | null;
  activo: boolean;
}

export interface OgConfigAmbienteRow {
  id: string;
  tipo_depto: string;
  variante: string;
  orientacion: string;
  ambiente: string;
  grupo_imagen: string;
  imagen_url: string;
  existe: boolean;
}

export interface OgDeptoRow {
  id: string;
  numero: string;
  id_obra: string | null;
  piso: number | null;
  frente_depto: string | null;
  plano_version_id: string | null;
}

export interface OgPlanoRow {
  plano_version_id: string;
  plano_url: string;
}

export interface OgPlanoAmbienteRow {
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
}

export interface OgImagenAmbienteRow {
  grupo_imagen: string;
  imagen_url: string;
  ancho_orig: number;
  alto_orig: number;
}

export interface OgElementoAmbienteRow {
  id: string;
  grupo_imagen: string;
  elemento: string;
  tipo_elemento: string;
  subtipo_cod: string | null;
  pos_x: number;
  pos_y: number;
  ancho: number;
  alto: number;
}

// ─── Helpers de lecto-escritura ──────────────────────────────────────────────

function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[ogCache] Error escribiendo:', key, e);
  }
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isCacheVigente(): boolean {
  try {
    const ts = localStorage.getItem(KEY_TS);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function marcarTimestamp(): void {
  localStorage.setItem(KEY_TS, String(Date.now()));
}

// ─── Descarga principal ──────────────────────────────────────────────────────

export async function descargarCacheOG(forzar = false): Promise<boolean> {
  if (!forzar && isCacheVigente()) return true;

  try {
    // og_catalogo tiene >1000 filas — paginar de 1000 en 1000
    let catalogoData: any[] = [];
    let desde = 0;
    const PAGE = 1000;
    while (true) {
      const { data: page, error: pageErr } = await supabase
        .from('og_catalogo')
        .select('id,revision,item_revision,elemento,ambiente,tolerancia,fase,activo')
        .eq('activo', true)
        .range(desde, desde + PAGE - 1);
      if (pageErr) { console.warn('[ogCache] Error paginando catálogo:', pageErr); break; }
      if (!page || page.length === 0) break;
      catalogoData = catalogoData.concat(page);
      if (page.length < PAGE) break;
      desde += PAGE;
    }

    const [resEle, resCfg, resPlanos, resAmbPlano, resImgAmb, resElAmb] =
      await Promise.all([
        supabase
          .from('og_elementos_detalle')
          .select('id,grupo_imagen,orientacion,ambiente,subtipo_cod,elemento,pos_x_pct,pos_y_pct,ancho_pct,alto_pct,activo')
          .eq('activo', true),
        supabase
          .from('og_config_ambientes')
          .select('id,tipo_depto,variante,orientacion,ambiente,grupo_imagen,imagen_url,existe'),
        supabase
          .from('og_planos')
          .select('plano_version_id,plano_url')
          .eq('activo', true),
        supabase
          .from('og_planos_ambientes')
          .select('id,plano_version_id,titulo,ambiente_cod,grupo_imagen,pos_x_base,pos_y_base,ancho_base,alto_base,orden')
          .eq('activo', true)
          .order('orden'),
        supabase
          .from('og_imagenes_ambiente')
          .select('grupo_imagen,imagen_url,ancho_orig,alto_orig')
          .eq('activo', true),
        supabase
          .from('og_elementos_ambiente')
          .select('id,grupo_imagen,elemento,tipo_elemento,subtipo_cod,pos_x,pos_y,ancho,alto')
          .eq('activo', true)
          .order('tipo_elemento'),
      ]);

    const hayError = resEle.error || resCfg.error ||
      resPlanos.error || resAmbPlano.error || resImgAmb.error || resElAmb.error;

    if (hayError || catalogoData.length === 0) {
      console.warn('[ogCache] Error en descarga tablas estáticas:', hayError);
      return false;
    }

    writeCache(KEY_CATALOGO,        catalogoData);
    writeCache(KEY_ELEMENTOS,       resEle.data);
    writeCache(KEY_CONFIG,          resCfg.data);
    writeCache(KEY_PLANOS,          resPlanos.data);
    writeCache(KEY_AMBIENTES_PLANO, resAmbPlano.data);
    writeCache(KEY_IMAGENES_AMB,    resImgAmb.data);
    writeCache(KEY_ELEMENTOS_AMB,   resElAmb.data);

    const { data: torres } = await supabase.from('torres').select('id');
    if (torres && torres.length > 0) {
      const torreIds = torres.map((t: any) => t.id);
      const { data: deptos } = await supabase
        .from('departamentos')
        .select('id,numero,id_obra,piso,frente_depto,plano_version_id,torre_id')
        .in('torre_id', torreIds)
        .order('id_obra');

      if (deptos) {
        const porTorre: Record<string, OgDeptoRow[]> = {};
        for (const d of deptos as any[]) {
          const tid = d.torre_id;
          if (!porTorre[tid]) porTorre[tid] = [];
          porTorre[tid].push({
            id:               d.id,
            numero:           d.numero,
            id_obra:          d.id_obra,
            piso:             d.piso,
            frente_depto:     d.frente_depto,
            plano_version_id: d.plano_version_id,
          });
        }
        writeCache(KEY_DEPTOS, porTorre);
      }
    }

    marcarTimestamp();
    console.log('[ogCache] ✅ Cache OG completo descargado — catálogo:', catalogoData.length);

    // Pre-cachear imágenes en background (fire-and-forget)
    precachearImagenesOG(
      (resPlanos.data  as OgPlanoRow[])          .map(r => r.plano_url).filter(Boolean),
      (resImgAmb.data  as OgImagenAmbienteRow[]) .map(r => r.imagen_url).filter(Boolean),
    );

    return true;
  } catch (e) {
    console.warn('[ogCache] Error de red:', e);
    return false;
  }
}

export function cacheDeptosTorre(torreId: string, deptos: OgDeptoRow[]): void {
  const porTorre = readCache<Record<string, OgDeptoRow[]>>(KEY_DEPTOS) ?? {};
  porTorre[torreId] = deptos;
  writeCache(KEY_DEPTOS, porTorre);
}

// ─── Consultas de estado del cache ───────────────────────────────────────────

export function hayCacheOG(): boolean {
  return (
    localStorage.getItem(KEY_CATALOGO)  !== null &&
    localStorage.getItem(KEY_ELEMENTOS) !== null
  );
}

export function fechaCacheOG(): Date | null {
  const ts = localStorage.getItem(KEY_TS);
  return ts ? new Date(parseInt(ts, 10)) : null;
}

// ─── Lecturas — catálogo y elementos ─────────────────────────────────────────

export function getAmbientesCache(): string[] {
  const rows = readCache<OgCatalogoRow[]>(KEY_CATALOGO);
  if (!rows) return [];
  return [...new Set(rows.map(r => r.ambiente))].sort();
}

export function getElementosCache(ambiente: string, grupoImagen: string | string[]): OgElementoRow[] {
  const rows = readCache<OgElementoRow[]>(KEY_ELEMENTOS);
  if (!rows) return [];
  const grupos = Array.isArray(grupoImagen) ? grupoImagen : [grupoImagen];
  return rows.filter(r => r.ambiente === ambiente && grupos.includes(r.grupo_imagen));
}

export function getToleranciaCache(params: {
  revision: string;
  itemRevision: string;
  elemento: string;
  ambiente: string;
}): OgCatalogoRow[] {
  const rows = readCache<OgCatalogoRow[]>(KEY_CATALOGO);
  if (!rows) return [];
  const norm = (s: string) => (s ?? '').trim().toLowerCase();
  const pRev  = norm(params.revision);
  const pItem = norm(params.itemRevision);
  const pEl   = norm(params.elemento);
  const pAmb  = norm(params.ambiente);
  return rows.filter(
    r =>
      norm(r.revision)      === pRev  &&
      norm(r.item_revision) === pItem &&
      norm(r.elemento)      === pEl   &&
      norm(r.ambiente)      === pAmb
  );
}

export function getConfigAmbientesCache(tipoDepto: string, orientacion?: string): OgConfigAmbienteRow[] {
  const rows = readCache<OgConfigAmbienteRow[]>(KEY_CONFIG);
  if (!rows) return [];
  return rows.filter(
    r => r.tipo_depto === tipoDepto && r.existe && (!orientacion || r.orientacion === orientacion)
  );
}

// ─── Lecturas — deptos ────────────────────────────────────────────────────────

export function getDeptosTorreCache(torreId: string): OgDeptoRow[] {
  const porTorre = readCache<Record<string, OgDeptoRow[]>>(KEY_DEPTOS);
  if (!porTorre) return [];
  return porTorre[torreId] ?? [];
}

// ─── Lecturas — plano ─────────────────────────────────────────────────────────

export function getPlanoCache(planoVersionId: string): OgPlanoRow | null {
  const rows = readCache<OgPlanoRow[]>(KEY_PLANOS);
  if (!rows) return null;
  return rows.find(r => r.plano_version_id === planoVersionId) ?? null;
}

export function getAmbientesPlanoCache(planoVersionId: string): OgPlanoAmbienteRow[] {
  const rows = readCache<OgPlanoAmbienteRow[]>(KEY_AMBIENTES_PLANO);
  if (!rows) return [];
  return rows
    .filter(r => r.plano_version_id === planoVersionId)
    .sort((a, b) => a.orden - b.orden);
}

// ─── Lecturas — imagen y elementos del ambiente ───────────────────────────────

export function getImagenAmbienteCache(grupoImagen: string): OgImagenAmbienteRow | null {
  const rows = readCache<OgImagenAmbienteRow[]>(KEY_IMAGENES_AMB);
  if (!rows) return null;
  return rows.find(r => r.grupo_imagen === grupoImagen) ?? null;
}

export function getElementosAmbienteCache(grupoImagen: string): OgElementoAmbienteRow[] {
  const rows = readCache<OgElementoAmbienteRow[]>(KEY_ELEMENTOS_AMB);
  if (!rows) return [];
  return rows.filter(r => r.grupo_imagen === grupoImagen);
}

// ─── Cache API — imágenes ─────────────────────────────────────────────────────

async function precachearImagenesOG(
  urlsPlanos: string[],
  urlsAmbientes: string[],
): Promise<void> {
  if (!('caches' in window)) {
    console.warn('[ogCache] Cache API no disponible');
    return;
  }
  const todasLasUrls = [...new Set([...urlsPlanos, ...urlsAmbientes])].filter(Boolean);
  if (todasLasUrls.length === 0) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    const BATCH = 3;
    let ok = 0;
    for (let i = 0; i < todasLasUrls.length; i += BATCH) {
      const batch = todasLasUrls.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async url => {
          try {
            const cached = await cache.match(url);
            if (!cached) await cache.add(url);
            ok++;
          } catch (e) {
            console.warn('[ogCache] Error cacheando imagen:', url, e);
          }
        })
      );
    }
    console.log(`[ogCache] 🖼️ Imágenes pre-cacheadas: ${ok}/${todasLasUrls.length}`);
  } catch (e) {
    console.warn('[ogCache] Error abriendo Cache API:', e);
  }
}

/**
 * Devuelve blob URL local si la imagen está en Cache API, o la URL original como fallback.
 * Liberar con URL.revokeObjectURL() al desmontar el componente.
 */
export async function getImagenUrl(url: string): Promise<string> {
  if (!url) return url;
  if (!('caches' in window)) return url;
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) {
      const blob = await cached.blob();
      return URL.createObjectURL(blob);
    }
  } catch (e) {
    console.warn('[ogCache] Error leyendo imagen del cache:', e);
  }
  return url;
}

/**
 * Limpia el cache de imágenes OG.
 * Llamar con forzar=true en descargarCacheOG para refrescar todo.
 */
export async function limpiarCacheImagenesOG(): Promise<void> {
  if (!('caches' in window)) return;
  try {
    await caches.delete(CACHE_NAME);
    console.log('[ogCache] 🗑️ Cache de imágenes OG eliminado');
  } catch (e) {
    console.warn('[ogCache] Error eliminando cache de imágenes:', e);
  }
}
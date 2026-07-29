// src/utils/ogImageDB.ts
// ─────────────────────────────────────────────────────────────────────────────
// Caché de IMÁGENES OG en IndexedDB para modo offline  ‹FMS›
//
// Reemplaza el enfoque de Cache API (window.caches), que NO está disponible en el
// WebView de Capacitor Android (requiere Service Worker, que Capacitor no provee).
// IndexedDB sí funciona nativamente en Android, sin plugins ni Service Worker.
//
// Flujo:
//   1. CON conexión, el usuario toca "Preparar modo offline" en RevisionOG →
//        descargarTodasLasImagenesOG(onProgress)
//      Descarga todos los planos (og_planos.plano_url) y todas las imágenes de
//      ambiente (og_imagenes_ambiente.imagen_url), las convierte a base64 y las
//      guarda en IndexedDB usando la URL original como clave.
//
//   2. En RevisionOGDetalle / RevisionOGAmbiente, al resolver el src de la imagen:
//        const src = await getImagenUrlDB(urlOriginal);
//      Devuelve el data:URL guardado (offline) o, si no está, la URL original
//      (comportamiento online normal / fallback).
//
// Dimensionado (junio 2026): 7 planos + 31 imágenes de ambiente = 38 imágenes,
// ~3.6 MB en storage → ~4.8 MB en base64. Trivial para IndexedDB.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase';

const DB_NAME     = 'vain_og';
const DB_VERSION  = 1;
const STORE_IMG   = 'imagenes';        // keyPath 'url'  → { url, dataUrl, ts }
const STORE_META  = 'meta';            // keyPath 'k'    → { k, v }
const META_ULTIMA = 'ultima_descarga'; // timestamp de la última descarga

// ── apertura de la base ──────────────────────────────────────────────────────
function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IMG)) {
        db.createObjectStore(STORE_IMG, { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'k' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

// ── operaciones de bajo nivel ────────────────────────────────────────────────
async function putImagen(url: string, dataUrl: string): Promise<void> {
  const db = await abrirDB();
  const tx = db.transaction(STORE_IMG, 'readwrite');
  tx.objectStore(STORE_IMG).put({ url, dataUrl, ts: Date.now() });
  await txDone(tx);
  db.close();
}

async function getImagen(url: string): Promise<string | null> {
  const db = await abrirDB();
  const dataUrl = await new Promise<string | null>((resolve, reject) => {
    const req = db.transaction(STORE_IMG, 'readonly').objectStore(STORE_IMG).get(url);
    req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
    req.onerror   = () => reject(req.error);
  });
  db.close();
  return dataUrl;
}

async function setMeta(k: string, v: any): Promise<void> {
  const db = await abrirDB();
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put({ k, v });
  await txDone(tx);
  db.close();
}

async function getMeta(k: string): Promise<any> {
  const db = await abrirDB();
  const v = await new Promise<any>((resolve, reject) => {
    const req = db.transaction(STORE_META, 'readonly').objectStore(STORE_META).get(k);
    req.onsuccess = () => resolve(req.result ? req.result.v : null);
    req.onerror   = () => reject(req.error);
  });
  db.close();
  return v;
}

// ── utilidades ───────────────────────────────────────────────────────────────
function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Devuelve el data:URL guardado en IndexedDB para esa URL, o la URL original si
 * no está cacheada. Ante cualquier fallo de IndexedDB devuelve la URL original
 * (comportamiento online). Úsala para resolver el `src` de planos e imágenes de
 * ambiente en RevisionOGDetalle / RevisionOGAmbiente.
 */
export async function getImagenUrlDB(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;  // ← Devolver null en lugar de string vacío
  try {
    const cached = await getImagen(url);
    return cached || url;  // Fallback a URL original si no está en cache
  } catch {
    return url;  // Fallback a URL original en caso de error IndexedDB
  }
}

export type ProgresoDescarga = (hechas: number, total: number, urlActual: string) => void;

/**
 * Descarga TODAS las imágenes OG (planos + ambientes) y las guarda en IndexedDB.
 * Debe llamarse CON conexión. Reporta progreso real vía onProgress y devuelve el
 * conteo de éxitos/fallos. Las que fallen no interrumpen el resto.
 */
export async function descargarTodasLasImagenesOG(
  onProgress?: ProgresoDescarga,
): Promise<{ ok: number; fail: number; total: number }> {
  // 1. Recolectar URLs desde Supabase (dedup por si un plano/ambiente se repite)
  const urls = new Set<string>();

  const { data: planos } = await supabase
    .from('og_planos')
    .select('plano_url')
    .eq('activo', true);
  (planos || []).forEach((r: any) => { if (r.plano_url) urls.add(r.plano_url); });

  const { data: imgs } = await supabase
    .from('og_imagenes_ambiente')
    .select('imagen_url')
    .eq('activo', true);
  (imgs || []).forEach((r: any) => { if (r.imagen_url) urls.add(r.imagen_url); });

  const lista = Array.from(urls);
  const total = lista.length;
  let ok = 0;
  let fail = 0;

  // 2. Descargar y guardar una por una (con progreso real)
  for (let i = 0; i < lista.length; i++) {
    const url = lista[i];
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob    = await resp.blob();
      const dataUrl = await blobADataUrl(blob);
      await putImagen(url, dataUrl);
      ok++;
    } catch (e) {
      fail++;
      console.warn('[ogImageDB] fallo al descargar', url, e);
    }
    onProgress?.(i + 1, total, url);
  }

  // 3. Registrar fecha de descarga
  await setMeta(META_ULTIMA, Date.now());

  return { ok, fail, total };
}

/** Cantidad de imágenes actualmente guardadas en IndexedDB. */
export async function contarImagenesDescargadas(): Promise<number> {
  try {
    const db = await abrirDB();
    const n = await new Promise<number>((resolve, reject) => {
      const req = db.transaction(STORE_IMG, 'readonly').objectStore(STORE_IMG).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    db.close();
    return n;
  } catch {
    return 0;
  }
}

/** Fecha de la última descarga, o null si nunca se descargó. */
export async function fechaDescargaImagenes(): Promise<Date | null> {
  try {
    const ts = await getMeta(META_ULTIMA);
    return ts ? new Date(ts) : null;
  } catch {
    return null;
  }
}

/** True si hay al menos una imagen guardada. */
export async function hayImagenesDescargadas(): Promise<boolean> {
  return (await contarImagenesDescargadas()) > 0;
}

/** Borra todas las imágenes OG guardadas (para re-descargar limpio). */
export async function limpiarImagenesOG(): Promise<void> {
  const db = await abrirDB();
  const tx = db.transaction([STORE_IMG, STORE_META], 'readwrite');
  tx.objectStore(STORE_IMG).clear();
  tx.objectStore(STORE_META).clear();
  await txDone(tx);
  db.close();
}
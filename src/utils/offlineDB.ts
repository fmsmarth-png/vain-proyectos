// src/utils/offlineDB.ts — ‹FMS› Agosto 2026
// ─────────────────────────────────────────────────────────────────────────────
// Capa base de IndexedDB para TODAS las colas de sincronización offline
// (registros ZC, Pre Entrega, Obra Gruesa, cambios de estado).
//
// POR QUÉ EXISTE ESTE ARCHIVO
// Antes, cada cola vivía en `localStorage` como un array JSON, con las fotos
// incrustadas como texto base64. Eso tiene dos problemas serios en terreno:
//
//   1. `localStorage` tiene un límite duro de ~5-10 MB *compartido entre todas
//      las colas y todo lo demás que la app guarde ahí*. Un técnico con mala
//      señal que toma 20-30 fotos en el día puede llenarlo sin que nadie se
//      entere: `localStorage.setItem` lanza `QuotaExceededError`, el código
//      solo hacía `console.error`, y esa observación con su foto se perdía
//      en silencio (el usuario cree que quedó guardada).
//   2. Guardar binarios como base64 es ~33% más pesado que el binario real y
//      obliga a convertir string→Blob→string constantemente.
//
// IndexedDB no tiene ese límite práctico (el navegador pide permiso para
// usar cientos de MB) y guarda `Blob` nativos sin pasar por texto. Además
// funciona igual en el WebView de Capacitor Android sin plugins adicionales
// (ya se usa así para el caché de planos OG en ogImageDB.ts).
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'vain_offline_queue';
// v1: registros, pre_entrega, zc, cambios, og
// v2: + postventa (cierre de visita Post Venta con firma)
// v3: + pre_entrega_fotos (subida en 2do plano de fotos de Pre Entrega)
// v4: + postventa_borrador (avance local de una visita Post Venta en curso)
const DB_VERSION = 4;

// Un object store por cola. keyPath = campo único de cada registro.
const STORE_CONFIG: Record<string, string> = {
  registros: 'id',      // Zona Común "registros" (observaciones)
  pre_entrega: 'id',    // observacionesinformepv
  zc: 'id',             // registros_zonas_comunes
  cambios: 'id',        // cambios de estado/edición/eliminación
  og: '_id_local',      // og_registros (Obra Gruesa)
  postventa: 'id',      // cierre de visita Post Venta (observaciones + firma)
  pre_entrega_fotos: 'id', // subida en 2do plano de fotos de Pre Entrega
  postventa_borrador: 'id', // avance local de una visita Post Venta en curso
};

export type StoreName = keyof typeof STORE_CONFIG;

let dbPromise: Promise<IDBDatabase> | null = null;

function abrirDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB no disponible en este entorno'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      Object.entries(STORE_CONFIG).forEach(([store, keyPath]) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Error abriendo IndexedDB'));
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transacción IndexedDB falló'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacción IndexedDB abortada'));
  });
}

/** Lee todos los registros de una cola. */
export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as T[]);
    req.onerror = () => reject(req.error ?? new Error(`Error leyendo cola ${store}`));
  });
}

/**
 * Guarda (o reemplaza) un registro. Lanza si falla — quien llama debe decidir
 * qué hacer (reintentar, avisar al usuario), nunca tragarse el error en
 * silencio: eso es exactamente lo que causaba pérdidas antes.
 */
export async function dbPut<T>(store: StoreName, record: T): Promise<void> {
  const db = await abrirDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(record);
  await txDone(tx);
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const db = await abrirDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function dbClear(store: StoreName): Promise<void> {
  const db = await abrirDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await txDone(tx);
}

/**
 * Migra automáticamente lo que haya quedado en una clave vieja de
 * localStorage hacia IndexedDB, una sola vez. Así ningún registro que un
 * técnico haya dejado pendiente ANTES de esta actualización se pierde al
 * actualizar la app.
 */
export async function migrarDesdeLocalStorage<T extends Record<string, any>>(
  legacyKey: string,
  store: StoreName,
  normalizar: (raw: any) => T,
): Promise<void> {
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return;
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) {
      localStorage.removeItem(legacyKey);
      return;
    }
    for (const item of items) {
      await dbPut(store, normalizar(item));
    }
    localStorage.removeItem(legacyKey);
    console.log(`[offlineDB] Migradas ${items.length} entradas de "${legacyKey}" a IndexedDB (${store})`);
  } catch (e) {
    // Si la migración falla, dejamos la clave vieja intacta para reintentar
    // en el próximo arranque en vez de perder esos datos.
    console.error(`[offlineDB] Error migrando "${legacyKey}":`, e);
  }
}

/** Comprime una imagen y devuelve un Blob JPEG (no un string base64). */
export function comprimirImagenBlob(file: File | Blob, maxDim = 1200, calidad = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No se pudo obtener contexto 2D')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen')),
        'image/jpeg',
        calidad,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Error cargando imagen')); };
    img.src = url;
  });
}

// Cache de object URLs para no crear una nueva por cada render (y para poder
// revocarlas cuando el registro ya se sincronizó y se puede liberar memoria).
const objectUrlCache = new WeakMap<Blob, string>();

/** Devuelve (y cachea) una object URL para mostrar un Blob pendiente como preview. */
export function blobAObjectUrl(blob: Blob): string {
  let url = objectUrlCache.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    objectUrlCache.set(blob, url);
  }
  return url;
}
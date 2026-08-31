// src/utils/ogOfflineQueue.ts — ‹FMS› (reescrito Agosto 2026 sobre IndexedDB)
// Cola de registros OG pendientes cuando no hay conexión.
//
// CAMBIOS respecto a la versión anterior (que usaba localStorage + base64):
//   1. Persistencia en IndexedDB en vez de localStorage: sin límite práctico
//      de tamaño, así una jornada larga sin señal con muchas fotos no puede
//      llenar la cuota y perder observaciones en silencio.
//   2. Las fotos se guardan como Blob nativo (no texto base64): más liviano
//      y sin la conversión string↔binario en cada paso.
//   3. Id idempotente por registro + `upsert` en vez de `insert`: si el flush
//      se interrumpe a mitad de camino (se cierra la app, se corta la señal)
//      y ese registro ya había llegado al servidor, el reintento no lo
//      duplica.
//   4. Cada registro se borra de la cola apenas se confirma en el servidor
//      (no solo al terminar todo el lote): si el flush se corta a la mitad,
//      lo ya sincronizado no se reintenta ni se duplica.
//
// El resto de la app (RevisionOG.tsx, RevisionOGAmbiente.tsx) sigue usando
// exactamente las mismas funciones que antes, de forma síncrona: para eso
// se mantiene un espejo en memoria que se hidrata una vez desde IndexedDB
// muy al inicio del arranque de la app (ver initOgQueue() y main.tsx).

import { supabase } from '../supabase';
import { dbGetAll, dbPut, dbDelete, blobAObjectUrl, migrarDesdeLocalStorage } from './offlineDB';

const LEGACY_KEY = 'og_registros_pendientes'; // clave vieja en localStorage

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface OgRegistroPendiente {
  // id local (nunca va a Supabase, solo para identificar en cola)
  _id_local: string;
  _creado_local: string; // ISO string

  // id idempotente que SÍ va a Supabase como PK de og_registros. Se reutiliza
  // en cada reintento para que un upsert no duplique si la respuesta anterior
  // se perdió (timeout, app cerrada a mitad de la subida, etc.)
  id: string;

  // Campos que van a og_registros
  proyecto_id: string;
  torre_id: string;
  departamento_id: string;
  tipo_depto: string;
  plano_version_id: string;
  ambiente: string;
  tipo_revision: string;
  tipo_elemento: string;
  subtipo_cod: string;
  elemento: string;
  tolerancia: string;
  comentario: string;
  usuario_id: string;
  sesion_id: string;

  // Foto: Blob si está pendiente de subir, o null si no tiene / ya se subió.
  foto_url: string | null;
  foto_blob: Blob | null;

  // Campo de compatibilidad: quien lea `foto_base64` sigue funcionando
  // (recibe una object URL válida como <img src>), aunque ya no se guarde
  // texto base64 en ningún lado.
  foto_base64?: string | null;
}

// ─── Espejo en memoria (para mantener la API síncrona de antes) ────────────
let cache: OgRegistroPendiente[] = [];
let hydrated = false;
let hydratingPromise: Promise<void> | null = null;

function conPreview(r: OgRegistroPendiente): OgRegistroPendiente {
  return { ...r, foto_base64: r.foto_blob ? blobAObjectUrl(r.foto_blob) : null };
}

/**
 * Hidrata el espejo en memoria desde IndexedDB. Debe llamarse una vez, lo
 * antes posible en el arranque (ver main.tsx), para que las lecturas
 * síncronas (contarPendientesOG, getPendientesOG) reflejen la realidad desde
 * el primer render. Si se llama más de una vez, reutiliza la misma promesa.
 */
export function initOgQueue(): Promise<void> {
  if (hydratingPromise) return hydratingPromise;
  hydratingPromise = (async () => {
    try {
      await migrarDesdeLocalStorage<OgRegistroPendiente>(LEGACY_KEY, 'og', (raw) => ({
        ...raw,
        id: raw.id ?? raw._id_local, // registros viejos no tenían id idempotente propio
        foto_blob: null, // las fotos viejas en base64 no se migran (edge case raro); se
        // pierde solo la FOTO de ese registro puntual si existía, nunca el registro.
      }));
      cache = await dbGetAll<OgRegistroPendiente>('og');
    } catch (e) {
      console.error('[ogQueue] Error hidratando cola OG desde IndexedDB:', e);
      cache = [];
    } finally {
      hydrated = true;
    }
  })();
  return hydratingPromise;
}

function warnIfNotHydrated() {
  if (!hydrated) {
    console.warn('[ogQueue] Se leyó la cola antes de hidratar — llama initOgQueue() en el arranque.');
  }
}

function idLocal(): string {
  return `og_local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── API pública (misma firma que la versión anterior) ─────────────────────

/** Cuántos registros hay esperando sync */
export function contarPendientesOG(): number {
  warnIfNotHydrated();
  return cache.length;
}

/** Retorna todos los pendientes (para mostrar en la UI con badge) */
export function getPendientesOG(): OgRegistroPendiente[] {
  warnIfNotHydrated();
  return cache.map(conPreview);
}

/**
 * Agrega un registro a la cola local. Ahora es async porque persiste de
 * verdad en IndexedDB antes de devolver el control — si esto falla (disco
 * lleno, etc.) el error se propaga para que la pantalla que llama pueda
 * avisarle al usuario en vez de que la observación desaparezca en silencio.
 */
export async function encolarRegistroOG(
  registro: Omit<OgRegistroPendiente, '_id_local' | '_creado_local' | 'id' | 'foto_blob'> & {
    foto_blob?: Blob | null;     // forma preferida: pasar el Blob directo
    foto_base64?: string | null; // compat: si llega como data:URL, se convierte
  },
): Promise<void> {
  const { foto_base64, foto_blob: fotoBlobDirecto, ...resto } = registro as any;

  let foto_blob: Blob | null = fotoBlobDirecto ?? null;
  if (!foto_blob && foto_base64) {
    try {
      const res = await fetch(foto_base64); // decodifica un data:URL sin atob manual
      foto_blob = await res.blob();
    } catch (e) {
      console.warn('[ogQueue] No se pudo convertir la foto a Blob, se encola sin foto:', e);
    }
  }

  const nuevo: OgRegistroPendiente = {
    ...resto,
    _id_local: idLocal(),
    _creado_local: new Date().toISOString(),
    id: (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    foto_blob,
  };

  // 1. Reflejar de inmediato en memoria (la UI que lo lea de forma síncrona
  //    lo ve al toque).
  cache = [...cache, nuevo];

  // 2. Persistir en IndexedDB. Si falla, sacamos el registro de memoria y
  //    lanzamos: mejor que la pantalla avise "no se pudo guardar" a que el
  //    usuario crea que quedó guardado y en realidad se perdió.
  try {
    await dbPut('og', nuevo);
  } catch (e) {
    cache = cache.filter(r => r._id_local !== nuevo._id_local);
    throw new Error('No se pudo guardar la observación en el dispositivo: ' + (e as Error).message);
  }

  console.log(`[ogQueue] Encolado offline. Total en cola: ${cache.length}`);
}

/** Elimina un registro local por su _id_local (ej: si el usuario lo cancela) */
export async function eliminarPendienteOG(idLoc: string): Promise<void> {
  cache = cache.filter(r => r._id_local !== idLoc);
  try {
    await dbDelete('og', idLoc);
  } catch (e) {
    console.error('[ogQueue] Error eliminando pendiente OG:', e);
  }
}

/**
 * Sube la foto de un registro pendiente a Supabase Storage.
 * Retorna la foto_url pública o null si falla.
 */
async function subirFotoOffline(blob: Blob, departamentoId: string): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const path = `og/${departamentoId}/${timestamp}.jpg`;

    const { error } = await supabase.storage
      .from('fotos-registros')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });

    if (error) {
      console.warn('[ogQueue] Error subiendo foto:', error.message);
      return null;
    }

    const { data } = supabase.storage.from('fotos-registros').getPublicUrl(path);
    return data.publicUrl ?? null;
  } catch (e) {
    console.warn('[ogQueue] Error de red subiendo foto:', e);
    return null;
  }
}

/**
 * Sincroniza toda la cola con Supabase.
 * Llámala cuando detectes reconexión (en OfflineContext o useAppFocus).
 * Devuelve { ok, fallidos } para que la UI pueda notificar.
 */
export async function flushColaOG(): Promise<{ ok: number; fallidos: number }> {
  warnIfNotHydrated();
  if (cache.length === 0) return { ok: 0, fallidos: 0 };

  console.log(`[ogQueue] Iniciando flush de ${cache.length} registros OG pendientes`);

  let ok = 0;
  let fallidos = 0;

  // Copia estática: iteramos sobre esto, pero vamos sacando de `cache` (el
  // espejo real) apenas se confirma cada uno — así si el proceso se corta a
  // mitad de camino, lo ya sincronizado no vuelve a reintentarse.
  const pendientesActuales = [...cache];

  for (const pendiente of pendientesActuales) {
    try {
      let foto_url = pendiente.foto_url ?? null;

      if (pendiente.foto_blob && !foto_url) {
        foto_url = await subirFotoOffline(pendiente.foto_blob, pendiente.departamento_id);
        // Si falla la subida de foto, igual intentamos guardar el registro sin foto
        // (mejor un registro sin foto que perder la observación)
      }

      // Sanitizar: strings vacíos en campos UUID deben ser null, no ""
      // Supabase rechaza uuid = "" con error de sintaxis
      const uuid = (v: string | null | undefined) =>
        v && v.trim().length > 0 ? v.trim() : null;

      // upsert idempotente por id: si un intento anterior sí llegó al
      // servidor pero la respuesta se perdió (app cerrada, timeout de red),
      // este reintento no crea un duplicado.
      const { error } = await supabase.from('og_registros').upsert({
        id:               pendiente.id,
        proyecto_id:      uuid(pendiente.proyecto_id),
        torre_id:         uuid(pendiente.torre_id),
        departamento_id:  uuid(pendiente.departamento_id),
        tipo_depto:       pendiente.tipo_depto       || null,
        plano_version_id: pendiente.plano_version_id || null,
        ambiente:         pendiente.ambiente         || null,
        tipo_revision:    pendiente.tipo_revision    || null,
        tipo_elemento:    pendiente.tipo_elemento    || null,
        subtipo_cod:      pendiente.subtipo_cod      || null,
        elemento:         pendiente.elemento         || null,
        tolerancia:       pendiente.tolerancia       || null,
        comentario:       pendiente.comentario       || null,
        foto_url,
        usuario_id:       uuid(pendiente.usuario_id),
        sesion_id:        pendiente.sesion_id        || null,
      }, { onConflict: 'id', ignoreDuplicates: true });

      if (error) {
        console.warn('[ogQueue] Error insertando registro:', error.message);
        fallidos++;
        continue;
      }

      // Confirmado en servidor → sacarlo YA de memoria y de IndexedDB.
      cache = cache.filter(r => r._id_local !== pendiente._id_local);
      await dbDelete('og', pendiente._id_local);
      ok++;
    } catch (e) {
      console.warn('[ogQueue] Error de red en flush:', e);
      fallidos++;
    }
  }

  console.log(`[ogQueue] Flush completo — ok: ${ok}, fallidos: ${fallidos}`);
  return { ok, fallidos };
}

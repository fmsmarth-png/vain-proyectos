// src/utils/preEntregaFotosQueue.ts — ‹FMS› Agosto 2026
// ─────────────────────────────────────────────────────────────────────────────
// Cola de fotos de Pre Entrega que suben "en segundo plano": la observación
// (texto) se guarda al toque con foto_url=null, y la foto se sube después sin
// bloquear al inspector; cuando termina, se hace UPDATE de foto_url por id.
//
// POR QUÉ SE REESCRIBIÓ (Agosto 2026)
// Esta cola vivía en localStorage (clave 'pre_entrega_fotos_pendientes') con
// la foto en base64, y si `localStorage.setItem` fallaba (cuota llena, muy
// posible guardando fotos como texto) el error se tragaba en silencio — la
// observación de texto ya estaba guardada, pero la foto se perdía para
// siempre sin que nadie se enterara. Además, solo se reintentaba al volver a
// entrar a la MISMA pantalla de ese departamento; si el inspector seguía de
// largo a otro depto, la foto quedaba abandonada.
//
// Ahora: IndexedDB (sin el límite práctico de localStorage, Blob nativo en
// vez de base64) y el flush se conecta también al ciclo global de
// sincronización de OfflineContext, no solo al reingreso a la pantalla.

import { dbGetAll, dbPut, dbDelete, type StoreName } from './offlineDB';
import { supabase } from '../supabase';

const STORE: StoreName = 'pre_entrega_fotos' as StoreName;

export interface FotoPreEntregaPendiente {
  id: string; // = obsId (una foto pendiente por observación)
  obsId: string;
  proyectoId: string;
  deptoId: string;
  foto_blob: Blob;
  intentos: number;
}

let cache: FotoPreEntregaPendiente[] = [];
let hydrated = false;
let hydratingPromise: Promise<void> | null = null;
let workerCorriendo = false;

export function initPreEntregaFotosQueue(): Promise<void> {
  if (hydratingPromise) return hydratingPromise;
  hydratingPromise = (async () => {
    try {
      cache = await dbGetAll<FotoPreEntregaPendiente>(STORE);
    } catch (e) {
      console.error('[preEntregaFotos] Error hidratando cola:', e);
      cache = [];
    } finally {
      hydrated = true;
    }
  })();
  return hydratingPromise;
}

function warnIfNotHydrated() {
  if (!hydrated) {
    console.warn('[preEntregaFotos] Se leyó la cola antes de hidratar — llama initPreEntregaFotosQueue() en el arranque.');
  }
}

export function contarFotosPendientes(): number {
  warnIfNotHydrated();
  return cache.length;
}

/**
 * Encola una foto pendiente de subir. Lanza si falla el guardado local, para
 * que quien llama pueda avisar (antes esto se tragaba en silencio y la foto
 * simplemente desaparecía).
 */
export async function encolarFotoPreEntregaPendiente(
  obsId: string,
  proyectoId: string,
  deptoId: string,
  foto_blob: Blob,
): Promise<void> {
  const item: FotoPreEntregaPendiente = { id: obsId, obsId, proyectoId, deptoId, foto_blob, intentos: 0 };
  cache = [...cache.filter(f => f.id !== obsId), item];
  try {
    await dbPut(STORE, item);
  } catch (e) {
    cache = cache.filter(f => f.id !== obsId);
    throw new Error('No se pudo guardar la foto en el dispositivo: ' + (e as Error).message);
  }
}

async function subirUnaFoto(item: FotoPreEntregaPendiente): Promise<boolean> {
  try {
    const fileName = `pre-entrega/${item.proyectoId}/${item.deptoId}/${item.obsId}.jpg`;
    const { error: upErr } = await supabase.storage
      .from('fotos-registros')
      .upload(fileName, item.foto_blob, { upsert: true, contentType: 'image/jpeg' });
    if (upErr) throw upErr;
    const { data: { publicUrl } } = supabase.storage.from('fotos-registros').getPublicUrl(fileName);
    const { error: updErr } = await supabase
      .from('observacionesinformepv')
      .update({ foto_url: publicUrl })
      .eq('id', item.obsId);
    if (updErr) throw updErr;
    return true;
  } catch (e) {
    console.warn('[preEntregaFotos] Foto no subió, se reintentará:', e);
    return false;
  }
}

/**
 * Procesa la cola de fotos DE A UNA (en serie): con red lenta, subir en
 * paralelo compite por el mismo ancho de banda y una falla no debe arrastrar
 * a las demás. `isOnline` se re-consulta en cada vuelta para cortar apenas se
 * pierde la señal, en vez de seguir reintentando a ciegas.
 */
export async function flushFotosPreEntrega(isOnline: () => boolean = () => true): Promise<{ ok: number; fallidos: number }> {
  warnIfNotHydrated();
  if (workerCorriendo) return { ok: 0, fallidos: 0 };
  if (cache.length === 0) return { ok: 0, fallidos: 0 };
  if (!isOnline()) return { ok: 0, fallidos: 0 };

  workerCorriendo = true;
  let ok = 0;
  let fallidos = 0;
  try {
    let fallosSeguidos = 0;
    while (isOnline() && cache.length > 0) {
      const item = cache[0];
      const subioOk = await subirUnaFoto(item);
      if (subioOk) {
        cache = cache.filter(f => f.id !== item.id);
        await dbDelete(STORE, item.id);
        ok++;
        fallosSeguidos = 0;
      } else {
        fallosSeguidos++;
        fallidos++;
        // Se deja en la cola (no se borra) para reintentar más tarde, ya sea
        // desde el ciclo global de OfflineContext o al reentrar a la pantalla.
        if (fallosSeguidos >= 5) break;
        const delay = Math.min(2000 * Math.pow(2, fallosSeguidos - 1), 30000);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  } finally {
    workerCorriendo = false;
  }
  return { ok, fallidos };
}

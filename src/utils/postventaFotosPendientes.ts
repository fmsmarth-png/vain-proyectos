// src/utils/postventaFotosPendientes.ts — ‹FMS› Septiembre 2026
// ─────────────────────────────────────────────────────────────────────────────
// Cola dedicada a fotos de una visita Post Venta YA CERRADA que no
// alcanzaron a subirse a Supabase Storage en el momento del cierre.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// Antes, cerrar una visita (finalizar()) bloqueaba al maestro_postventa en
// terreno —con el cliente presente— si alguna foto no terminaba de subir,
// o directamente perdía la foto en silencio si se dejaba cerrar igual (esto
// pasó de verdad con una visita real). Ninguna de las dos es aceptable:
// bloquear genera una situación incómoda con el cliente ahí mismo esperando,
// y perder la foto es peor.
//
// La solución: cerrar SIEMPRE es instantáneo — nunca espera a que las fotos
// terminen de subir. Si alguna sigue local al momento de cerrar, se guarda
// en ESTA cola (con el Blob real, no solo la referencia) y el ciclo de
// sincronización de fondo de OfflineContext la reintenta sola, cuantas
// veces haga falta, hasta lograrlo — sin tocar el estado de la visita ni
// nada más de postventa_papeletas. Deliberadamente separada del borrador
// general (postventaBorradorLocal.ts): esa cola solo existe mientras la
// visita sigue EN_PROGRESO y se descarta al cerrar; esta cola es lo
// opuesto — solo existe para visitas que YA se cerraron.

import { supabase } from '../supabase';
import { dbGetAll, dbPut, dbDelete, type StoreName } from './offlineDB';

const STORE: StoreName = 'postventa_fotos_pendientes';
const T_BORRADOR = 'postventa_obs_borrador';

export interface FotoPendiente {
  id: string; // `${papeletaId}:${filaId}:${tipo}` — idempotente, un solo pendiente por foto
  papeletaId: string;
  filaId: string;
  tipo: 'antes' | 'despues';
  dataUrl: string; // el Blob real (como data URL), a salvo aunque nunca se suba
  intentos: number;
  ultimoError?: string;
  creado_en: string;
}

let cache: FotoPendiente[] = [];
let hydrated = false;
let hydratingPromise: Promise<void> | null = null;

export function initPostventaFotosPendientes(): Promise<void> {
  if (hydratingPromise) return hydratingPromise;
  hydratingPromise = (async () => {
    try {
      cache = await dbGetAll<FotoPendiente>(STORE);
    } catch (e) {
      console.error('[fotosPendientesPV] Error hidratando cola:', e);
      cache = [];
    } finally {
      hydrated = true;
    }
  })();
  return hydratingPromise;
}

function warnIfNotHydrated() {
  if (!hydrated) {
    console.warn('[fotosPendientesPV] Se leyó antes de hidratar — llama initPostventaFotosPendientes() en el arranque.');
  }
}

/** Cuántas fotos siguen pendientes para una visita puntual (para el indicador en pantalla). */
export function contarFotosPendientes(papeletaId: string): number {
  warnIfNotHydrated();
  return cache.filter(f => f.papeletaId === papeletaId).length;
}

export function contarTodasLasFotosPendientes(): number {
  warnIfNotHydrated();
  return cache.length;
}

/**
 * Encola una foto que no alcanzó a subirse al momento de cerrar la visita.
 * Idempotente por (papeletaId, filaId, tipo): si ya había una encolada para
 * esa misma foto, la reemplaza (no acumula duplicados).
 */
export async function encolarFotoPendiente(
  papeletaId: string, filaId: string, tipo: 'antes' | 'despues', dataUrl: string,
): Promise<void> {
  const id = `${papeletaId}:${filaId}:${tipo}`;
  const registro: FotoPendiente = {
    id, papeletaId, filaId, tipo, dataUrl,
    intentos: 0,
    creado_en: new Date().toISOString(),
  };
  cache = [...cache.filter(f => f.id !== id), registro];
  try {
    await dbPut(STORE, registro);
  } catch (e) {
    cache = cache.filter(f => f.id !== id);
    throw new Error('No se pudo guardar la foto pendiente en el dispositivo: ' + (e as Error).message);
  }
}

/**
 * Reintenta subir TODAS las fotos pendientes de todas las visitas. Pensada
 * para el ciclo global de OfflineContext (al reconectar y cada 30s). Cada
 * foto exitosa se sube a Storage y ahí mismo actualiza SOLO su columna
 * (foto_antes o foto_despues) en postventa_obs_borrador — nunca toca estado
 * ni ningún otro campo de la visita.
 */
export async function flushFotosPendientesPostventa(): Promise<{ ok: number; fallidos: number }> {
  warnIfNotHydrated();
  if (cache.length === 0) return { ok: 0, fallidos: 0 };

  let ok = 0;
  let fallidos = 0;

  for (const pendiente of [...cache]) {
    try {
      const blob = await fetch(pendiente.dataUrl).then(r => r.blob());
      const nombre = `pv_${pendiente.papeletaId}_${pendiente.filaId}_${pendiente.tipo}_${Date.now()}.jpg`;
      const path = `postventa-borradores/${nombre}`;
      const { error: upErr } = await supabase.storage
        .from('fotos-registros')
        .upload(path, new File([blob], nombre, { type: 'image/jpeg' }), { upsert: true });
      if (upErr) throw upErr;

      const url = supabase.storage.from('fotos-registros').getPublicUrl(path).data.publicUrl;
      const columna = pendiente.tipo === 'antes' ? 'foto_antes' : 'foto_despues';
      const { error: updErr } = await supabase
        .from(T_BORRADOR)
        .update({ [columna]: url })
        .eq('id', pendiente.filaId);
      if (updErr) throw updErr;

      cache = cache.filter(f => f.id !== pendiente.id);
      await dbDelete(STORE, pendiente.id);
      ok++;
      console.log('[fotosPendientesPV] Foto sincronizada:', pendiente.id);
    } catch (e: any) {
      pendiente.intentos++;
      pendiente.ultimoError = e?.message ?? String(e);
      cache = cache.map(f => f.id === pendiente.id ? pendiente : f);
      await dbPut(STORE, pendiente).catch(() => {});
      fallidos++;
      console.warn('[fotosPendientesPV] Foto sigue sin subir, se reintenta luego:', pendiente.id, pendiente.ultimoError);
    }
  }

  return { ok, fallidos };
}

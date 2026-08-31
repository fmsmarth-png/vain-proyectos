// src/utils/postventaOfflineQueue.ts — ‹FMS› Agosto 2026
// ─────────────────────────────────────────────────────────────────────────────
// Cola offline para el CIERRE de una visita de Post Venta (PostVenta.tsx).
//
// POR QUÉ EXISTE ESTE ARCHIVO
// A diferencia de Pre Entrega / Zona Común / Obra Gruesa (que ya guardaban
// cada observación en una cola offline), el botón "Finalizar" de Post Venta
// dependía 100% de tener conexión en ese instante exacto: hacía un INSERT
// directo a `observacionesinformepv`, subía la firma, actualizaba la
// papeleta a COMPLETADA y generaba el PDF, todo en una sola función.
// Si no había señal justo en ese momento, la función lanzaba una excepción
// y TODA la visita se perdía — incluida la firma del cliente ya capturada,
// después de potencialmente 30+ minutos de trabajo en terreno.
//
// Esta cola resuelve exactamente eso: si falla la conexión al finalizar,
// el cierre completo (observaciones + firma + datos del receptor) se guarda
// en IndexedDB y se reintenta solo al reconectar. El PDF, en cambio, se
// genera y se guarda/comparte SIEMPRE de inmediato — no depende de red — así
// el técnico nunca se queda sin su informe aunque no haya señal.

import { supabase } from '../supabase';
import { dbGetAll, dbPut, dbDelete, type StoreName } from './offlineDB';

// Reutilizamos el mismo objectStore genérico agregándolo a offlineDB.ts
// (ver STORE_CONFIG) bajo el nombre 'postventa'.
const STORE: StoreName = 'postventa' as StoreName;

export interface FilaPostventaPendiente {
  id?: string; // asignado en encolarFinalizacionPostventa si falta: hace el upsert idempotente
  proyecto_id: string;
  proyecto_codigo: string;
  torre_codigo: string;
  depto_numero: string | number;
  departamento_id: string;
  tipo: 'PV';
  estado: string;
  n_requerimiento: string | null;
  solicitud_cliente: string | null;
  observacion: string;
  ambiente: string;
  partida_afectada: string | null;
  causa: string | null;
  receptor_nombre: string;
  receptor_rut: string;
  usuario_id: string;
  usuario_email: string;
  usuario_nombre: string | null;
  fecha_creacion: string;
  semana_creacion: string | null;
}

export interface PostventaFinalizacionPendiente {
  id: string;              // id idempotente (también sirve de _id_local)
  _creado_local: string;
  papeletaId: string | null;
  filas: FilaPostventaPendiente[];
  firma_blob: Blob | null; // firma capturada, pendiente de subir
  intentos: number;
  ultimoError?: string;
}

let cache: PostventaFinalizacionPendiente[] = [];
let hydrated = false;
let hydratingPromise: Promise<void> | null = null;

export function initPostventaQueue(): Promise<void> {
  if (hydratingPromise) return hydratingPromise;
  hydratingPromise = (async () => {
    try {
      cache = await dbGetAll<PostventaFinalizacionPendiente>(STORE);
    } catch (e) {
      console.error('[postventaQueue] Error hidratando cola:', e);
      cache = [];
    } finally {
      hydrated = true;
    }
  })();
  return hydratingPromise;
}

function warnIfNotHydrated() {
  if (!hydrated) {
    console.warn('[postventaQueue] Se leyó la cola antes de hidratar — llama initPostventaQueue() en el arranque.');
  }
}

export function contarPendientesPostventa(): number {
  warnIfNotHydrated();
  return cache.length;
}

export function getPendientesPostventa(): PostventaFinalizacionPendiente[] {
  warnIfNotHydrated();
  return cache;
}

/**
 * Encola el cierre completo de una visita. Lanza si falla el guardado local
 * (IndexedDB), para que la pantalla pueda avisar al usuario en vez de que la
 * visita completa desaparezca en silencio.
 */
export async function encolarFinalizacionPostventa(
  papeletaId: string | null,
  filas: FilaPostventaPendiente[],
  firma_blob: Blob | null,
): Promise<void> {
  const nuevo: PostventaFinalizacionPendiente = {
    id: (crypto as any)?.randomUUID?.() ?? `pv_fin_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    _creado_local: new Date().toISOString(),
    papeletaId,
    // Cada fila necesita un id propio (no solo el id de la finalización) para
    // que el upsert a observacionesinformepv sea idempotente por fila.
    filas: filas.map(f => ({
      ...f,
      id: f.id ?? (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    })),
    firma_blob,
    intentos: 0,
  };

  cache = [...cache, nuevo];
  try {
    await dbPut(STORE, nuevo);
  } catch (e) {
    cache = cache.filter(r => r.id !== nuevo.id);
    throw new Error('No se pudo guardar la visita en el dispositivo: ' + (e as Error).message);
  }
  console.log('[postventaQueue] Visita encolada offline:', nuevo.id);
}

/** Sincroniza toda la cola con Supabase. Devuelve { ok, fallidos }. */
export async function flushColaPostventa(): Promise<{ ok: number; fallidos: number }> {
  warnIfNotHydrated();
  if (cache.length === 0) return { ok: 0, fallidos: 0 };

  console.log(`[postventaQueue] Iniciando flush de ${cache.length} visitas pendientes`);
  let ok = 0;
  let fallidos = 0;

  for (const pendiente of [...cache]) {
    try {
      // 1. Firma → Storage (si aún no se subió)
      let firmaUrl: string | null = null;
      if (pendiente.firma_blob) {
        try {
          const nombre = `firma_pv_offline_${pendiente.id}.png`;
          const { error: upErr } = await supabase.storage
            .from('fotos-registros')
            .upload(`firmas/${nombre}`, pendiente.firma_blob, { contentType: 'image/png', upsert: true });
          if (!upErr) {
            firmaUrl = supabase.storage.from('fotos-registros').getPublicUrl(`firmas/${nombre}`).data.publicUrl;
          }
        } catch (e) {
          console.warn('[postventaQueue] Error subiendo firma:', e);
          // No bloquea: mejor guardar las observaciones sin firma_url que perderlas.
        }
      }

      // 2. Observaciones → observacionesinformepv (con id ya asignado en cada
      //    fila desde el momento de encolar, para que un upsert sea idempotente
      //    si el intento anterior sí llegó pero la respuesta se perdió).
      const filasConFirma = pendiente.filas.map(f => ({ ...f, receptor_firma_url: firmaUrl }));
      const { error: insErr } = await supabase.from('observacionesinformepv').upsert(filasConFirma, {
        onConflict: 'id',
        ignoreDuplicates: true,
      });
      if (insErr) throw new Error(insErr.message);

      // 3. Cerrar la papeleta (si existía un borrador asociado)
      if (pendiente.papeletaId) {
        await supabase.from('postventa_papeletas').update({
          estado: 'COMPLETADA',
          fecha_completada: new Date().toISOString(),
          receptor_firma_url: firmaUrl,
          updated_at: new Date().toISOString(),
        }).eq('id', pendiente.papeletaId);
      }

      cache = cache.filter(r => r.id !== pendiente.id);
      await dbDelete(STORE, pendiente.id);
      ok++;
      console.log('[postventaQueue] Visita sincronizada:', pendiente.id);
    } catch (e: any) {
      pendiente.intentos++;
      pendiente.ultimoError = e.message;
      cache = cache.map(r => r.id === pendiente.id ? pendiente : r);
      await dbPut(STORE, pendiente).catch(() => {});
      fallidos++;
      console.warn('[postventaQueue] Error sincronizando visita:', pendiente.id, e.message);
    }
  }

  console.log(`[postventaQueue] Flush completo — ok: ${ok}, fallidos: ${fallidos}`);
  return { ok, fallidos };
}

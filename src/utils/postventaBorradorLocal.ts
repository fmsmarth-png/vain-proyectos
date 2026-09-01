// src/utils/postventaBorradorLocal.ts — ‹FMS› Agosto 2026
// ─────────────────────────────────────────────────────────────────────────────
// Borrador LOCAL de una visita de Post Venta en progreso.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// Antes, cada campo que el técnico tecleaba durante la visita (observación,
// ambiente, causa, receptor...) se guardaba con un UPDATE directo a Supabase,
// con 700ms de debounce. Si la señal se cortaba justo antes de que ese
// debounce disparara, o el UPDATE fallaba por falta de red, lo tecleado no
// quedaba en ningún lado más que en el estado de React — si la app se
// cerraba antes de reconectar, se perdía sin aviso.
//
// Ahora la fuente de verdad INMEDIATA es este borrador local en IndexedDB:
// cada cambio se guarda aquí primero (siempre funciona, no depende de red),
// y por separado — con su propio debounce — se intenta reflejar en Supabase
// (para que la tarjeta de "visita en progreso" en DetalleDepto se vea
// actualizada). Si ese reflejo falla, no importa: el dato ya está a salvo
// acá y el ciclo global de sincronización de OfflineContext lo reintenta
// solo, esté o no abierta la pantalla de Post Venta.
//
// Los ids de papeleta y de cada fila se generan EN EL CLIENTE (UUID) desde
// el instante en que se crean, en vez de esperar a que Supabase los asigne.
// Esto permite además iniciar una visita completamente offline (antes, sin
// conexión en ese primer instante, no se guardaba nada hasta reconectar).

// RESUELTO (ver PostVenta.tsx): el bug "fecha_atencion se pone null sola"
// que se estaba diagnosticando con logs temporales en este archivo tenía su
// causa en PostVenta.tsx, no acá — datosRef/recNombreRef/recRutRef/
// sinPapeletaRef se sincronizaban con un useEffect (un ciclo de render
// tarde), así que cualquier código que llamara a construirBorrador() justo
// después de un setDatos(...) sin pasar overrides explícitos leía el valor
// VIEJO. Se corrigió con setters *Sync que actualizan el ref en el mismo
// tick. Este archivo (el borrador local en sí) siempre guardó exactamente
// lo que se le pasó — el bug era de dónde salían esos datos, no de acá.

import { supabase } from '../supabase';
import { dbGetAll, dbPut, dbDelete, type StoreName } from './offlineDB';

const STORE: StoreName = 'postventa_borrador' as StoreName;
const T_PAPELETA = 'postventa_papeletas';
const T_BORRADOR = 'postventa_obs_borrador';

export interface BorradorLocalFila {
  id: string; // uuid cliente, el mismo id que la fila tendrá en Supabase
  orden: number;
  origen: 'papeleta' | 'derivada' | 'adicional';
  solicitud_cliente: string | null;
  solicitud_ambiente: string | null;
  ambiente: string | null;
  observacion: string | null;
  partida_afectada: string | null;
  causa: string | null;
  estado: string;
  foto_antes: string | null;
  foto_despues: string | null;
}

export interface BorradorLocal {
  id: string; // papeletaId (uuid cliente)
  depto_id: string;
  proyecto_id: string;
  proyecto_codigo: string | null;
  torre_codigo: string;
  depto_numero: string | number;
  sin_papeleta: boolean;
  n_requerimiento: string | null;
  fecha_registro: string | null;
  fecha_atencion: string | null;
  hora_atencion: string | null;
  condominio: string | null;
  receptor_nombre: string;
  receptor_rut: string;
  usuario_id: string | null;
  usuario_email: string | null;
  usuario_nombre: string | null;
  filas: BorradorLocalFila[];
  estado: 'EN_PROGRESO' | 'COMPLETADA';
  creadoEnServidor: boolean;
  actualizado_en: string;
}

let cache: BorradorLocal[] = [];
let hydrated = false;
let hydratingPromise: Promise<void> | null = null;

export function initPostventaBorradorLocal(): Promise<void> {
  if (hydratingPromise) return hydratingPromise;
  hydratingPromise = (async () => {
    try {
      cache = await dbGetAll<BorradorLocal>(STORE);
    } catch (e) {
      console.error('[postventaBorrador] Error hidratando borradores locales:', e);
      cache = [];
    } finally {
      hydrated = true;
    }
  })();
  return hydratingPromise;
}

function warnIfNotHydrated() {
  if (!hydrated) {
    console.warn('[postventaBorrador] Se leyó antes de hidratar — llama initPostventaBorradorLocal() en el arranque.');
  }
}

/** Lectura síncrona desde el espejo en memoria (ya hidratado en el arranque). */
export function leerBorradorLocal(id: string): BorradorLocal | null {
  warnIfNotHydrated();
  return cache.find(b => b.id === id) ?? null;
}

export function listarBorradoresLocales(): BorradorLocal[] {
  warnIfNotHydrated();
  return cache;
}

/**
 * Guarda (o reemplaza) el borrador completo. Es la operación que protege
 * cada tecleo: se llama en CADA edición, sin debounce — un guardado en
 * IndexedDB de un registro de texto pesa nada y nunca depende de la red.
 * Lanza si falla (disco lleno, etc.) para que la pantalla pueda avisar.
 */
export async function guardarBorradorLocal(borrador: BorradorLocal): Promise<void> {
  cache = [...cache.filter(b => b.id !== borrador.id), borrador];
  try {
    await dbPut(STORE, borrador);
  } catch (e) {
    throw new Error('No se pudo guardar el borrador en el dispositivo: ' + (e as Error).message);
  }
}

export async function eliminarBorradorLocal(id: string): Promise<void> {
  cache = cache.filter(b => b.id !== id);
  try {
    await dbDelete(STORE, id);
  } catch (e) {
    console.error('[postventaBorrador] Error eliminando borrador local:', e);
  }
}

/**
 * Refleja el borrador completo en Supabase (upsert de la papeleta + cada
 * fila, todo idempotente por id). Es best-effort: si falla, el borrador
 * sigue intacto en IndexedDB y se reintenta en la próxima llamada — nunca se
 * pierde nada por que esto falle.
 */
export async function sincronizarBorradorConServidor(borrador: BorradorLocal): Promise<boolean> {
  try {
    const { error: errPap } = await supabase.from(T_PAPELETA).upsert({
      id: borrador.id,
      proyecto_id: borrador.proyecto_id,
      proyecto_codigo: borrador.proyecto_codigo,
      torre_codigo: borrador.torre_codigo,
      depto_numero: borrador.depto_numero,
      departamento_id: borrador.depto_id,
      sin_papeleta: borrador.sin_papeleta,
      n_requerimiento: borrador.n_requerimiento,
      fecha_registro: borrador.fecha_registro,
      fecha_atencion: borrador.fecha_atencion,
      hora_atencion: borrador.hora_atencion,
      condominio: borrador.condominio,
      estado: borrador.estado,
      receptor_nombre: borrador.receptor_nombre.trim() || null,
      receptor_rut: borrador.receptor_rut.trim() || null,
      usuario_id: borrador.usuario_id,
      usuario_email: borrador.usuario_email,
      usuario_nombre: borrador.usuario_nombre,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (errPap) throw errPap;

    if (borrador.filas.length > 0) {
      const { error: errFilas } = await supabase.from(T_BORRADOR).upsert(
        borrador.filas.map(f => ({
          id: f.id,
          papeleta_id: borrador.id,
          orden: f.orden,
          origen: f.origen,
          solicitud_cliente: f.solicitud_cliente,
          solicitud_ambiente: f.solicitud_ambiente,
          ambiente: f.ambiente,
          observacion: f.observacion,
          partida_afectada: f.partida_afectada,
          causa: f.causa,
          estado: f.estado,
          foto_antes: f.foto_antes,
          foto_despues: f.foto_despues,
        })),
        { onConflict: 'id' },
      );
      if (errFilas) throw errFilas;
    }

    const actualizado = { ...borrador, creadoEnServidor: true };
    cache = cache.map(b => b.id === borrador.id ? actualizado : b);
    await dbPut(STORE, actualizado).catch(() => {});
    return true;
  } catch (e) {
    console.warn('[postventaBorrador] No se pudo sincronizar con el servidor (se reintenta luego):', e);
    return false;
  }
}

/**
 * Sincroniza TODOS los borradores locales EN_PROGRESO con el servidor.
 * Pensada para el ciclo global de reconexión (OfflineContext): así, si el
 * técnico cerró la app a mitad de una visita sin señal, en cuanto vuelve la
 * conexión el avance se refleja solo en Supabase, sin depender de que vuelva
 * a abrir esa pantalla.
 */
export async function sincronizarTodosLosBorradoresLocales(): Promise<{ ok: number; fallidos: number }> {
  warnIfNotHydrated();
  const pendientes = cache.filter(b => b.estado === 'EN_PROGRESO');
  let ok = 0;
  let fallidos = 0;
  for (const b of pendientes) {
    const exito = await sincronizarBorradorConServidor(b);
    if (exito) ok++; else fallidos++;
  }
  return { ok, fallidos };
}
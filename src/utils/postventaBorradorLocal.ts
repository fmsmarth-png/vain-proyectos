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
const T_ELIMINADAS = 'postventa_papeletas_eliminadas';

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
  fecha_atencion_programada: string | null;
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

// IDs de papeleta cuyo cierre (finalizar()) está en curso AHORA MISMO en esta
// misma pestaña/dispositivo. Es un guardia en memoria (no persiste, no hace
// falta: dura literalmente los segundos que toma cerrar la visita) para que
// sincronizarTodosLosBorradoresLocales (el ciclo de fondo de OfflineContext)
// no intente re-subir estado: 'EN_PROGRESO' justo mientras el cierre está
// escribiendo estado: 'COMPLETADA' — sin esto, ambas escrituras compiten
// (revisar estado remoto y luego escribir NO es atómico) y la que gane al
// final puede dejar la visita "resucitada" como EN_PROGRESO.
// Antes esto se evitaba borrando el borrador local apenas empezaba el cierre
// — pero eso significa que si algo más falla a mitad de camino (sesión
// vencida, error inesperado, etc.), el borrador ya no está en ningún lado:
// se pierde la visita completa. Con este guardia, el borrador local se
// mantiene intacto hasta que el cierre termina de verdad (en el servidor o
// en la cola offline) — solo entonces se lo borra.
const finalizando = new Set<string>();

/** Marca que el cierre de esta papeleta está en curso: ver comentario arriba. */
export function marcarFinalizando(id: string): void {
  finalizando.add(id);
}

/** Quita la marca — SIEMPRE se debe llamar al terminar finalizar(), haya
 * salido bien o mal, o el borrador queda invisible para el ciclo de fondo
 * para siempre (nunca más se reintentaría su sincronización). */
export function desmarcarFinalizando(id: string): void {
  finalizando.delete(id);
}

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
 * Revisa el estado REAL en el servidor antes de subir nada. Cubre el caso
 * de un SEGUNDO dispositivo que abrió esta visita mientras seguía en
 * progreso (hidratarBorrador la "protege" localmente en cualquier
 * dispositivo que la abra, no solo en el que la creó) y se quedó con su
 * propia copia en IndexedDB. Si esa visita después se finaliza o se borra
 * desde OTRO dispositivo, esta copia nunca se entera — y sin este chequeo,
 * cada ciclo de sincronización de fondo de ESTE dispositivo la volvía a
 * subir como EN_PROGRESO, pisando para siempre el cierre real.
 *
 * Devuelve 'completada' | 'eliminada' | 'seguir' (nada raro: se sigue con
 * el upsert normal, ya sea porque de verdad sigue en progreso o porque
 * todavía no se ha creado por primera vez en el servidor).
 */
async function estadoRemoto(borrador: BorradorLocal): Promise<'completada' | 'eliminada' | 'seguir'> {
  try {
    const { data, error } = await supabase
      .from(T_PAPELETA)
      .select('estado')
      .eq('id', borrador.id)
      .maybeSingle();
    if (error) return 'seguir'; // sin señal / RLS sin resolver: no bloquea el flujo normal

    if (data) {
      return data.estado === 'COMPLETADA' ? 'completada' : 'seguir';
    }
    // No existe la fila en el servidor. Si esta copia local YA había
    // logrado crearse ahí antes (creadoEnServidor === true), es que alguien
    // la borró después — no es "todavía no creada". Si nunca se había
    // creado, es el caso normal de una visita nueva recién iniciada.
    return borrador.creadoEnServidor ? 'eliminada' : 'seguir';
  } catch {
    return 'seguir';
  }
}

/**
 * Revisa si esta papeleta fue eliminada A PROPÓSITO desde algún dispositivo
 * (ver `postventa_papeletas_eliminadas`, poblada por VisitasPostVenta.tsx al
 * borrar). Es la única forma de evitar que el ciclo global de sincronización
 * de OTRO dispositivo (que todavía tiene esta visita como EN_PROGRESO en su
 * IndexedDB local) la resucite con un upsert silencioso justo después de que
 * alguien la borró — antes de esto, borrar una visita en un dispositivo no
 * evitaba que reapareciera en cuanto sincronizara otro.
 */
async function fueEliminadaRemotamente(papeletaId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from(T_ELIMINADAS)
      .select('id')
      .eq('id', papeletaId)
      .maybeSingle();
    if (error) return false; // sin señal / tabla no accesible: no bloquea el flujo normal
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Refleja el borrador completo en Supabase (upsert de la papeleta + cada
 * fila, todo idempotente por id). Es best-effort: si falla, el borrador
 * sigue intacto en IndexedDB y se reintenta en la próxima llamada — nunca se
 * pierde nada por que esto falle.
 */
export async function sincronizarBorradorConServidor(borrador: BorradorLocal): Promise<boolean> {
  const estado = await estadoRemoto(borrador);
  if (estado === 'completada' || estado === 'eliminada') {
    // Ya se cerró o se borró de verdad en el servidor (desde este u otro
    // dispositivo): se descarta la copia local en vez de resucitarla.
    await eliminarBorradorLocal(borrador.id);
    return true;
  }

  if (await fueEliminadaRemotamente(borrador.id)) {
    // Alguien la borró a propósito desde otro dispositivo: se descarta la
    // copia local en vez de subirla, y se marca como "resuelta" (no es un
    // error que deba reintentarse).
    await eliminarBorradorLocal(borrador.id);
    return true;
  }
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
      fecha_atencion_programada: borrador.fecha_atencion_programada,
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
  const pendientes = cache.filter(b => b.estado === 'EN_PROGRESO' && !finalizando.has(b.id));
  let ok = 0;
  let fallidos = 0;
  for (const b of pendientes) {
    const exito = await sincronizarBorradorConServidor(b);
    if (exito) ok++; else fallidos++;
  }
  return { ok, fallidos };
}
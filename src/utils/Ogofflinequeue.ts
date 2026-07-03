// src/utils/ogOfflineQueue.ts — FMS
// Cola de registros OG pendientes cuando no hay conexión.
// Las fotos se guardan en base64 (comprimidas) y se suben a Storage al reconectarse.
// Al hacer flush se INSERT en og_registros con la foto_url real.

import { supabase } from '../supabase';

// ─── Clave localStorage ──────────────────────────────────────────────────────
const KEY_COLA = 'og_registros_pendientes';

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface OgRegistroPendiente {
  // id local (nunca va a Supabase, solo para identificar en cola)
  _id_local: string;
  _creado_local: string; // ISO string

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

  // Foto — puede ser null, URL real (ya subida) o base64 (pendiente de subir)
  foto_url: string | null;
  foto_base64: string | null; // 'data:image/jpeg;base64,...' — solo offline
}

// ─── Helpers de cola ─────────────────────────────────────────────────────────
function leerCola(): OgRegistroPendiente[] {
  try {
    const raw = localStorage.getItem(KEY_COLA);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function escribirCola(cola: OgRegistroPendiente[]): void {
  try {
    localStorage.setItem(KEY_COLA, JSON.stringify(cola));
  } catch (e) {
    console.warn('[ogQueue] Error escribiendo cola:', e);
  }
}

function idLocal(): string {
  return `og_local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── API pública ──────────────────────────────────────────────────────────────

/** Cuántos registros hay esperando sync */
export function contarPendientesOG(): number {
  return leerCola().length;
}

/** Agrega un registro a la cola local */
export function encolarRegistroOG(registro: Omit<OgRegistroPendiente, '_id_local' | '_creado_local'>): void {
  const cola = leerCola();
  cola.push({
    ...registro,
    _id_local: idLocal(),
    _creado_local: new Date().toISOString(),
  });
  escribirCola(cola);
  console.log(`[ogQueue] Encolado offline. Total en cola: ${cola.length}`);
}

/** Elimina un registro local por su _id_local (ej: si el usuario lo cancela) */
export function eliminarPendienteOG(idLocal: string): void {
  const cola = leerCola().filter(r => r._id_local !== idLocal);
  escribirCola(cola);
}

/** Retorna todos los pendientes (para mostrar en la UI con badge) */
export function getPendientesOG(): OgRegistroPendiente[] {
  return leerCola();
}

/**
 * Convierte un Blob/File comprimido a base64 para guardar offline.
 * Usar después de comprimirImagen().
 */
export function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convierte base64 de vuelta a Blob JPEG (para subir a Storage al reconectarse).
 */
function base64ABlob(base64: string): Blob {
  const [, data] = base64.split(',');
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/jpeg' });
}

/**
 * Sube la foto de un registro pendiente a Supabase Storage.
 * Retorna la foto_url pública o null si falla.
 */
async function subirFotoOffline(
  base64: string,
  departamentoId: string
): Promise<string | null> {
  try {
    const blob = base64ABlob(base64);
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
  const cola = leerCola();
  if (cola.length === 0) return { ok: 0, fallidos: 0 };

  console.log(`[ogQueue] Iniciando flush de ${cola.length} registros OG pendientes`);

  let ok = 0;
  let fallidos = 0;
  const colaRestante: OgRegistroPendiente[] = [];

  for (const pendiente of cola) {
    try {
      let foto_url = pendiente.foto_url ?? null;

      // Si tiene foto base64 pendiente, subirla primero
      if (pendiente.foto_base64 && !foto_url) {
        foto_url = await subirFotoOffline(pendiente.foto_base64, pendiente.departamento_id);
        // Si falla la subida de foto, igual intentamos guardar el registro sin foto
        // (mejor un registro sin foto que perder la observación)
      }

      // INSERT en og_registros
      // Sanitizar: strings vacíos en campos UUID deben ser null, no ""
      // Supabase rechaza uuid = "" con error de sintaxis
      const uuid = (v: string | null | undefined) =>
        v && v.trim().length > 0 ? v.trim() : null;

      const { error } = await supabase.from('og_registros').insert({
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
      });

      if (error) {
        console.warn('[ogQueue] Error insertando registro:', error.message);
        colaRestante.push(pendiente);
        fallidos++;
      } else {
        ok++;
      }
    } catch (e) {
      console.warn('[ogQueue] Error de red en flush:', e);
      colaRestante.push(pendiente);
      fallidos++;
    }
  }

  escribirCola(colaRestante);
  console.log(`[ogQueue] Flush completo — ok: ${ok}, fallidos: ${fallidos}`);
  return { ok, fallidos };
}
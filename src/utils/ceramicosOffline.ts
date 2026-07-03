// src/utils/ceramicosOffline.ts
// Cola offline independiente de OfflineContext (pantalla provisoria y autocontenida).
// Mismo patrón que registros_pendientes: localStorage + sync al reconectar.

import { supabase } from '../supabase';
import { ChecklistCeramicos } from './ceramicosConfig';

const QUEUE_KEY = 'ceramicos_levantamiento_pendientes';
const CACHE_DEPTOS_KEY = 'ceramicos_levantamiento_cache_deptos_';

export interface RegistroCeramicoPendiente {
  proyecto_id: string;
  torre_id: string;
  departamento_id: string;
  checklist: ChecklistCeramicos;
  comentario: string | null;
  usuario_id: string | null;
  creado_en: string;
}

export function obtenerCola(): RegistroCeramicoPendiente[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarCola(cola: RegistroCeramicoPendiente[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(cola));
}

// Reemplaza cualquier pendiente previo del mismo depto por el nuevo (siempre el estado más reciente)
export function encolarRegistro(registro: RegistroCeramicoPendiente) {
  const cola = obtenerCola().filter((r) => r.departamento_id !== registro.departamento_id);
  cola.push(registro);
  guardarCola(cola);
}

export function contarPendientes(): number {
  return obtenerCola().length;
}

export async function sincronizarCola(): Promise<{ ok: number; error: number }> {
  const cola = obtenerCola();
  if (cola.length === 0) return { ok: 0, error: 0 };

  let ok = 0;
  let error = 0;
  const restantes: RegistroCeramicoPendiente[] = [];

  for (const registro of cola) {
    const { error: err } = await supabase
      .from('ceramicos_levantamiento')
      .upsert(
        {
          proyecto_id: registro.proyecto_id,
          torre_id: registro.torre_id,
          departamento_id: registro.departamento_id,
          checklist: registro.checklist,
          comentario: registro.comentario,
          usuario_id: registro.usuario_id,
        },
        { onConflict: 'departamento_id' }
      );

    if (err) {
      error++;
      restantes.push(registro);
    } else {
      ok++;
    }
  }

  guardarCola(restantes);
  return { ok, error };
}

// --- Cache de torres/deptos por proyecto para navegar offline ---

export function guardarCacheDeptos(proyectoId: string, data: unknown) {
  try {
    localStorage.setItem(CACHE_DEPTOS_KEY + proyectoId, JSON.stringify(data));
  } catch {
    // almacenamiento lleno u otro error: ignorar, no es crítico
  }
}

export function leerCacheDeptos<T = unknown>(proyectoId: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_DEPTOS_KEY + proyectoId);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
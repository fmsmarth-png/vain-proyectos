// src/utils/logger.ts
// FMS — Septiembre 2026
// Logger centralizado — reemplaza catch {} vacíos (OWASP A09)
//
// Uso:
//   import { logger } from '../utils/logger';
//   } catch (e) { logger.error('Bodega', 'crear vale', e); }
//
// Futuro: enviar a tabla audit_log de Supabase o servicio externo.

const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

export const logger = {
  /** Error que debería investigarse */
  error: (modulo: string, operacion: string, err: unknown) => {
    console.error(`[${modulo}] ${operacion}:`, err);
    // TODO: enviar a Supabase audit_log o Sentry en producción
  },

  /** Advertencia no-bloqueante */
  warn: (modulo: string, msg: string, extra?: unknown) => {
    console.warn(`[${modulo}] ${msg}`, extra ?? '');
  },

  /** Info de diagnóstico — solo en desarrollo */
  debug: (modulo: string, msg: string, extra?: unknown) => {
    if (IS_DEV) {
      console.log(`[${modulo}] ${msg}`, extra ?? '');
    }
  },
};

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://swjmqtnhdtiwopexbezx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3am1xdG5oZHRpd29wZXhiZXp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzI1NjEsImV4cCI6MjA5NDkwODU2MX0.j_hdhVHQdap5JvL4iRQc2WdySrKV768Y7Jf9sc4pz7A';

// ============================================================================
// CAPTURA TEMPRANA DEL TOKEN DE RECUPERACIÓN
// ----------------------------------------------------------------------------
// Este módulo se importa muy temprano (antes de que el router de Ionic arranque
// y reescriba la URL, botando los parámetros). Guardamos lo que venga del enlace
// de recovery en sessionStorage, para que la pantalla de restablecer lo use
// aunque la URL quede limpia después.
//
// Supabase puede mandar el enlace en 3 formatos según configuración:
//   1. ?token=XXXX&type=recovery   -> se canjea con verifyOtp({ token_hash })
//   2. ?code=XXXX                  -> se canjea con exchangeCodeForSession(code)
//   3. #access_token=...&type=recovery -> se setea con setSession(...)
// ============================================================================
(() => {
  try {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const s = new URLSearchParams(search);

    // Formato 1: ?token=...&type=recovery  (token OTP / token_hash)
    const token = s.get('token') || s.get('token_hash');
    if (token) {
      const type = s.get('type') || 'recovery';
      sessionStorage.setItem('recovery_otp', JSON.stringify({ token, type }));
    }

    // Formato 2: ?code=...  (PKCE)
    const code = s.get('code');
    if (code) {
      sessionStorage.setItem('recovery_code', code);
    }

    // Formato 3: #access_token=...&refresh_token=...&type=recovery  (implícito)
    if (hash.includes('access_token')) {
      const h = new URLSearchParams(hash.replace(/^#/, ''));
      const access_token = h.get('access_token');
      const refresh_token = h.get('refresh_token');
      if (access_token && refresh_token) {
        sessionStorage.setItem('recovery_tokens', JSON.stringify({ access_token, refresh_token }));
      }
    }
  } catch {
    /* no-op */
  }
})();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Nosotros controlamos el canje del token en la pantalla de restablecer.
    detectSessionInUrl: false,
    // ------------------------------------------------------------------------
    // FIX (ago 2026): deadlock de getSession() con React 19 StrictMode.
    // Por defecto GoTrue usa el Navigator LockManager (navigator.locks) para
    // serializar el acceso a la sesión. En dev, StrictMode monta→desmonta→monta
    // los efectos muy rápido; el primer getSession() adquiere el lock y queda
    // abortado a mitad por el desmontaje sin soltarlo, y el segundo getSession()
    // espera ese lock para siempre → nunca resuelve → "cargando permisos" infinito
    // y pantalla en blanco.
    //
    // Este lock no-op ejecuta la función directamente sin adquirir ningún lock
    // del navegador. Es seguro en una SPA de un solo tab como esta (no hay varias
    // pestañas compitiendo por refrescar el token al mismo tiempo).
    // ------------------------------------------------------------------------
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn();
    },
  },
});
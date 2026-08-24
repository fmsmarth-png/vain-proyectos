// src/helpers/deepLinkRecovery.ts
// Maneja el enlace de recuperación de contraseña cuando llega por deep link
// nativo (Android/iOS) vía el evento appUrlOpen de Capacitor.
//
// En web el token llega en la URL del navegador y lo captura supabase.ts.
// En nativo NO hay URL de navegador: el enlace del correo abre la app y el
// token llega dentro de event.url (ej. vainproyectos://restablecer-contrasena?token=XXXX&type=recovery).
// Aquí lo extraemos, lo guardamos en sessionStorage con el mismo formato que
// usa la pantalla RestablecerContrasena, y navegamos a esa ruta.

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Registra el listener de deep links para recuperación de contraseña.
 * Llamar una sola vez al arrancar la app (en nativo).
 *
 * @param onRecovery callback que se ejecuta cuando llega un enlace de recovery
 *                   válido, para que la app muestre la pantalla de nueva contraseña.
 */
export const registrarDeepLinkRecovery = (onRecovery: () => void) => {
  if (!Capacitor.isNativePlatform()) return;

  const procesarUrl = (rawUrl: string) => {
    try {
      // rawUrl ej: vainproyectos://restablecer-contrasena?token=XXXX&type=recovery
      // o:        vainproyectos://restablecer-contrasena?code=XXXX
      const url = new URL(rawUrl);
      const params = url.searchParams;

      const token = params.get('token') || params.get('token_hash');
      const code = params.get('code');
      const type = params.get('type') || 'recovery';

      // Algunos proveedores mandan el token en el hash en vez de la query.
      const hash = rawUrl.includes('#') ? rawUrl.split('#')[1] : '';
      const h = new URLSearchParams(hash);
      const access_token = h.get('access_token');
      const refresh_token = h.get('refresh_token');

      let esRecovery = false;

      if (token) {
        sessionStorage.setItem('recovery_otp', JSON.stringify({ token, type }));
        esRecovery = true;
      }
      if (code) {
        sessionStorage.setItem('recovery_code', code);
        esRecovery = true;
      }
      if (access_token && refresh_token) {
        sessionStorage.setItem('recovery_tokens', JSON.stringify({ access_token, refresh_token }));
        esRecovery = true;
      }

      if (esRecovery) {
        onRecovery();
      }
    } catch (e) {
      console.error('[deepLinkRecovery] no se pudo parsear la URL:', rawUrl, e);
    }
  };

  // App abierta desde cero con el enlace.
  App.getLaunchUrl().then((res) => {
    if (res?.url) procesarUrl(res.url);
  }).catch(() => {});

  // App ya abierta que recibe el enlace.
  App.addListener('appUrlOpen', (event) => {
    if (event?.url) procesarUrl(event.url);
  });
};

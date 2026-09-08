// src/helpers/validarContrasena.ts
// FMS — Septiembre 2026
// Validación de política de contraseña centralizada (OWASP A04/A07)

/**
 * Valida que la contraseña cumpla requisitos mínimos de seguridad.
 * Retorna `null` si es válida, o un mensaje de error descriptivo.
 */
export function validarContrasena(pw: string): string | null {
  if (pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(pw)) return 'Debe incluir al menos una letra mayúscula';
  if (!/[a-z]/.test(pw)) return 'Debe incluir al menos una letra minúscula';
  if (!/[0-9]/.test(pw)) return 'Debe incluir al menos un número';
  return null;
}

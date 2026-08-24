import { supabase } from '../supabase'

export interface ResultadoAuth {
  success: boolean
  message?: string
  error?: string
}

/**
 * Cambia la contraseña del usuario logueado.
 * Verifica la actual reintentando el login antes de cambiarla.
 */
export const cambiarContrasena = async (
  contrasenaActual: string,
  contrasenaNueva: string
): Promise<ResultadoAuth> => {
  try {
    const { data: sesion } = await supabase.auth.getSession()
    const email = sesion.session?.user.email

    if (!email) {
      return { success: false, error: 'No hay sesión activa. Vuelve a iniciar sesión.' }
    }

    // Verificar la contraseña actual
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password: contrasenaActual,
    })

    if (loginError) {
      return { success: false, error: 'La contraseña actual es incorrecta.' }
    }

    // Cambiar a la nueva
    const { error } = await supabase.auth.updateUser({ password: contrasenaNueva })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, message: 'Contraseña actualizada correctamente.' }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error inesperado.' }
  }
}

/**
 * Solicita el email de recuperación.
 */
export const solicitarResetContrasena = async (
  email: string,
  redirectTo: string
): Promise<ResultadoAuth> => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, message: 'Si el correo está registrado, recibirás el enlace de recuperación.' }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al solicitar la recuperación.' }
  }
}

/**
 * Establece la nueva contraseña con token de recovery.
 */
export const restablecerContrasena = async (
  contrasenaNueva: string
): Promise<ResultadoAuth> => {
  try {
    const { error } = await supabase.auth.updateUser({ password: contrasenaNueva })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, message: 'Contraseña restablecida correctamente.' }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al restablecer.' }
  }
}
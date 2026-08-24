import { IonPage, IonContent, IonInput, IonButton, IonSpinner, IonAlert, IonIcon } from '@ionic/react'
import { lockClosedOutline } from 'ionicons/icons'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { restablecerContrasena } from '../helpers/authContrasena'

const RestablecerContrasena: React.FC = () => {
  const [sesionLista, setSesionLista] = useState(false)
  const [verificando, setVerificando] = useState(true)
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [cargando, setCargando] = useState(false)
  const [alerta, setAlerta] = useState<{ abierto: boolean; msg: string; ok: boolean }>({
    abierto: false, msg: '', ok: false,
  })

  useEffect(() => {
    let cancelado = false

    const marcarListo = () => {
      if (cancelado) return
      setSesionLista(true)
      setVerificando(false)
    }

    const establecerSesion = async () => {
      // Leemos lo que capturó supabase.ts apenas cargó la página (antes de que
      // el router de Ionic limpiara la URL).
      const otpRaw = sessionStorage.getItem('recovery_otp')
      const code = sessionStorage.getItem('recovery_code')
      const tokensRaw = sessionStorage.getItem('recovery_tokens')

      // ===== LOGS DIAGNÓSTICO =====
      console.log('[RESET] otpRaw:', otpRaw)
      console.log('[RESET] code:', code)
      console.log('[RESET] tokensRaw:', tokensRaw)
      console.log('[RESET] URL actual:', window.location.href)
      // ============================

      // Formato 1: ?token=...&type=recovery  -> verifyOtp({ token_hash, type })
      if (otpRaw) {
        try {
          const { token, type } = JSON.parse(otpRaw)
          console.log('[RESET] Intentando verifyOtp con token_hash:', token, 'type:', type)
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: (type || 'recovery') as any,
          })
          console.log('[RESET] verifyOtp resultado →', { data, error })
          if (!error) {
            sessionStorage.removeItem('recovery_otp')
            marcarListo()
            return
          }
          console.error('[RESET] verifyOtp error:', error)
        } catch (e) {
          console.error('[RESET] verifyOtp excepción:', e)
        }
      }

      // Formato 2: ?code=...  -> exchangeCodeForSession(code)
      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (!error) {
            sessionStorage.removeItem('recovery_code')
            marcarListo()
            return
          }
          console.error('[RESET] exchangeCodeForSession error:', error)
        } catch (e) {
          console.error('[RESET] exchangeCodeForSession excepción:', e)
        }
      }

      // Formato 3: #access_token=...&refresh_token=...  -> setSession(...)
      if (tokensRaw) {
        try {
          const { access_token, refresh_token } = JSON.parse(tokensRaw)
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (!error) {
            sessionStorage.removeItem('recovery_tokens')
            marcarListo()
            return
          }
          console.error('[RESET] setSession error:', error)
        } catch (e) {
          console.error('[RESET] setSession excepción:', e)
        }
      }

      // ¿Ya había una sesión de recovery activa?
      const { data } = await supabase.auth.getSession()
      if (data.session) { marcarListo(); return }

      // Nada funcionó: enlace inválido o expirado.
      if (!cancelado) setVerificando(false)
    }

    // Escucha directa del evento por si dispara mientras canjeamos.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        marcarListo()
      }
    })

    establecerSesion()

    return () => { cancelado = true; sub.subscription.unsubscribe() }
  }, [])

  const mostrar = (msg: string, ok: boolean) => setAlerta({ abierto: true, msg, ok })

  const handleGuardar = async () => {
    if (nueva.length < 6) { mostrar('La contraseña debe tener al menos 6 caracteres.', false); return }
    if (nueva !== confirmar) { mostrar('Las contraseñas no coinciden.', false); return }

    setCargando(true)
    const r = await restablecerContrasena(nueva)
    setCargando(false)

    if (r.success) {
      mostrar('✓ Contraseña restablecida. Ya puedes iniciar sesión.', true)
    } else {
      mostrar(r.error || 'No se pudo restablecer.', false)
    }
  }

  // Al confirmar el éxito: cerrar la sesión de recovery, limpiar el token de la
  // URL y recargar a /home para volver al login desde cero (limpia recoveryMode).
  const finalizar = async () => {
    await supabase.auth.signOut()
    window.location.replace('/home')
  }

  const inputStyle: React.CSSProperties = {
    background: '#16233B', border: '1px solid #243550', borderRadius: 8, marginTop: 6, marginBottom: 18,
    '--padding-start': '14px', '--padding-end': '14px', '--color': '#f9fafb',
  } as any

  return (
    <IonPage>
      <IonContent style={{ '--background': '#0B1220' } as any}>
        <div style={{
          minHeight: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: 28, maxWidth: 460, margin: '0 auto',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <IonIcon icon={lockClosedOutline} style={{ fontSize: 52, color: '#3b82f6' }} />
            <h2 style={{ color: '#f9fafb', margin: '16px 0 6px' }}>Nueva contraseña</h2>
            <p style={{ color: '#8296B0', fontSize: 14, margin: 0 }}>
              Crea una contraseña nueva para tu cuenta.
            </p>
          </div>

          {sesionLista ? (
            <>
              <span style={{ color: '#cbd5e1', fontSize: 14 }}>Nueva contraseña</span>
              <IonInput
                type="password"
                value={nueva}
                placeholder="Mínimo 6 caracteres"
                onIonInput={(e) => setNueva(e.detail.value || '')}
                style={inputStyle}
              />

              <span style={{ color: '#cbd5e1', fontSize: 14 }}>Confirmar contraseña</span>
              <IonInput
                type="password"
                value={confirmar}
                placeholder="Repite la contraseña"
                onIonInput={(e) => setConfirmar(e.detail.value || '')}
                style={inputStyle}
              />

              <IonButton
                expand="block"
                onClick={handleGuardar}
                disabled={cargando}
                style={{ '--background': '#2563eb', height: 48, fontWeight: 600 } as any}
              >
                {cargando ? <IonSpinner name="crescent" /> : 'Guardar contraseña'}
              </IonButton>
            </>
          ) : verificando ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <IonSpinner name="crescent" style={{ color: '#3b82f6' }} />
              <p style={{ color: '#8296B0', fontSize: 14, marginTop: 12 }}>Verificando enlace...</p>
            </div>
          ) : (
            <div style={{
              background: 'rgba(239,68,68,0.10)', color: '#fca5a5',
              borderLeft: '4px solid #ef4444', padding: '14px', borderRadius: 6, fontSize: 14,
            }}>
              Enlace inválido o expirado. Vuelve a solicitar la recuperación desde el login.
              <IonButton
                fill="clear"
                onClick={() => window.location.replace('/home')}
                style={{ '--color': '#3b82f6', marginTop: 8 } as any}
              >
                Volver al login
              </IonButton>
            </div>
          )}
        </div>
      </IonContent>

      <IonAlert
        isOpen={alerta.abierto}
        onDidDismiss={() => {
          const eraOk = alerta.ok
          setAlerta({ ...alerta, abierto: false })
          if (eraOk) finalizar()
        }}
        header={alerta.ok ? 'Listo' : 'Atención'}
        message={alerta.msg}
        buttons={['OK']}
      />
    </IonPage>
  )
}

export default RestablecerContrasena
import { IonPage, IonContent, IonInput, IonButton, IonSpinner, IonAlert, IonIcon } from '@ionic/react'
import { keyOutline, arrowBackOutline, mailOutline } from 'ionicons/icons'
import { useState } from 'react'
import { useHistory } from 'react-router'
import { solicitarResetContrasena } from '../helpers/authContrasena'
import { Capacitor } from '@capacitor/core'

const getRedirectTo = (): string => {
  if (Capacitor.isNativePlatform()) {
    return 'vainproyectos://restablecer-contrasena'
  }
  return `${window.location.origin}/restablecer-contrasena`
}

const RecuperarContrasena: React.FC = () => {
  const history = useHistory()
  const [email, setEmail] = useState('')
  const [cargando, setCargando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [alerta, setAlerta] = useState<{ abierto: boolean; msg: string }>({ abierto: false, msg: '' })

  const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

  const handleSolicitar = async () => {
    if (!emailValido(email)) {
      setAlerta({ abierto: true, msg: 'Ingresa un correo electrónico válido.' })
      return
    }
    setCargando(true)
    const r = await solicitarResetContrasena(email, getRedirectTo())
    setCargando(false)

    if (r.success) {
      setEnviado(true)
    } else {
      setAlerta({ abierto: true, msg: r.error || 'No se pudo enviar el correo.' })
    }
  }

  const inputStyle: React.CSSProperties = {
    background: '#16233B', border: '1px solid #243550', borderRadius: 8, marginTop: 6,
    '--padding-start': '14px', '--padding-end': '14px', '--color': '#f9fafb',
  } as any

  return (
    <IonPage>
      <IonContent style={{ '--background': '#0B1220' } as any}>
        <div style={{
          minHeight: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: 28, maxWidth: 460, margin: '0 auto',
        }}>
          <IonButton
            fill="clear"
            onClick={() => history.push('/home')}
            style={{ '--color': '#8296B0', alignSelf: 'flex-start', marginBottom: 8 } as any}
          >
            <IonIcon icon={arrowBackOutline} slot="start" />
            Volver al login
          </IonButton>

          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <IonIcon icon={keyOutline} style={{ fontSize: 52, color: '#3b82f6' }} />
            <h2 style={{ color: '#f9fafb', margin: '16px 0 6px' }}>¿Olvidaste tu contraseña?</h2>
            <p style={{ color: '#8296B0', fontSize: 14, margin: 0 }}>
              Te enviaremos un enlace para restablecerla.
            </p>
          </div>

          {!enviado ? (
            <>
              <span style={{ color: '#cbd5e1', fontSize: 14 }}>Correo electrónico</span>
              <IonInput
                type="email"
                value={email}
                placeholder="tu.correo@vain.cl"
                onIonInput={(e) => setEmail(e.detail.value || '')}
                style={{ ...inputStyle, marginBottom: 20 }}
              />
              <IonButton
                expand="block"
                onClick={handleSolicitar}
                disabled={cargando}
                style={{ '--background': '#2563eb', height: 48, fontWeight: 600 } as any}
              >
                {cargando ? <IonSpinner name="crescent" /> : 'Enviar enlace de recuperación'}
              </IonButton>

              <div style={{
                marginTop: 20, background: 'rgba(37,99,235,0.10)', color: '#93c5fd',
                borderLeft: '4px solid #2563eb', padding: '12px 14px', borderRadius: 6, fontSize: 13,
              }}>
                Si no ves el correo en unos minutos, revisa la carpeta de spam.
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#f9fafb' }}>
              <IonIcon icon={mailOutline} style={{ fontSize: 48, color: '#22c55e', marginBottom: 12 }} />
              <h3 style={{ margin: '0 0 8px' }}>Correo enviado</h3>
              <p style={{ color: '#8296B0', fontSize: 14, margin: '0 0 20px' }}>
                Revisa <strong style={{ color: '#cbd5e1' }}>{email}</strong> y sigue el enlace.
              </p>
              <IonButton
                fill="clear"
                onClick={() => history.push('/home')}
                style={{ '--color': '#3b82f6' } as any}
              >
                ← Volver al login
              </IonButton>
            </div>
          )}
        </div>
      </IonContent>

      <IonAlert
        isOpen={alerta.abierto}
        onDidDismiss={() => setAlerta({ abierto: false, msg: '' })}
        header="Atención"
        message={alerta.msg}
        buttons={['OK']}
      />
    </IonPage>
  )
}

export default RecuperarContrasena
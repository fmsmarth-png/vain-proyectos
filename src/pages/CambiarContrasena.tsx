import { IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonInput, IonButton, IonSpinner, IonAlert, IonIcon } from '@ionic/react'
import { lockClosedOutline } from 'ionicons/icons'
import { useState } from 'react'
import { useHistory } from 'react-router'
import { cambiarContrasena } from '../helpers/authContrasena'
import { useTheme } from '../Context/ThemeContext'

const CambiarContrasena: React.FC = () => {
  const history = useHistory()
  const { palette } = useTheme()

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [cargando, setCargando] = useState(false)
  const [alerta, setAlerta] = useState<{ abierto: boolean; msg: string; ok: boolean }>({
    abierto: false, msg: '', ok: false,
  })

  const mostrar = (msg: string, ok: boolean) => setAlerta({ abierto: true, msg, ok })

  const validar = (): boolean => {
    if (!actual.trim()) { mostrar('Ingresa tu contraseña actual.', false); return false }
    if (nueva.length < 6) { mostrar('La nueva contraseña debe tener al menos 6 caracteres.', false); return false }
    if (nueva !== confirmar) { mostrar('Las contraseñas no coinciden.', false); return false }
    if (actual === nueva) { mostrar('La nueva contraseña debe ser distinta a la actual.', false); return false }
    return true
  }

  const handleCambiar = async () => {
    if (!validar()) return
    setCargando(true)
    const r = await cambiarContrasena(actual, nueva)
    setCargando(false)

    if (r.success) {
      mostrar('✓ ' + (r.message || 'Contraseña actualizada.'), true)
      setActual(''); setNueva(''); setConfirmar('')
    } else {
      mostrar(r.error || 'Error al cambiar la contraseña.', false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: palette.card2,
    border: `1px solid ${palette.line}`,
    borderRadius: 8,
    marginTop: 6,
    '--padding-start': '14px',
    '--padding-end': '14px',
    '--color': palette.textPrimary,
  } as any

  const labelStyle: React.CSSProperties = {
    fontSize: 14, fontWeight: 500, color: palette.textPrimary, display: 'block', marginBottom: 6,
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': palette.panel, '--color': palette.textPrimary } as any}>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" text="" />
          </IonButtons>
          <IonTitle>Cambiar contraseña</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': palette.bg } as any}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <IonIcon icon={lockClosedOutline} style={{ fontSize: 44, color: palette.accent2 }} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <span style={labelStyle}>Contraseña actual</span>
            <IonInput
              type="password"
              value={actual}
              placeholder="Tu contraseña actual"
              onIonInput={(e) => setActual(e.detail.value || '')}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <span style={labelStyle}>Nueva contraseña</span>
            <IonInput
              type="password"
              value={nueva}
              placeholder="Mínimo 6 caracteres"
              onIonInput={(e) => setNueva(e.detail.value || '')}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <span style={labelStyle}>Confirmar nueva contraseña</span>
            <IonInput
              type="password"
              value={confirmar}
              placeholder="Repite la nueva contraseña"
              onIonInput={(e) => setConfirmar(e.detail.value || '')}
              style={inputStyle}
            />
          </div>

          <div style={{
            background: palette.card2, color: palette.accent2, borderLeft: `4px solid ${palette.accent2}`,
            padding: '12px 14px', borderRadius: 6, fontSize: 13, margin: '20px 0',
          }}>
            💡 Usa letras, números y símbolos para una contraseña más segura.
          </div>

          <IonButton
            expand="block"
            onClick={handleCambiar}
            disabled={cargando}
            style={{ '--background': palette.accent2, height: 48, fontWeight: 600 } as any}
          >
            {cargando ? <IonSpinner name="crescent" /> : 'Cambiar contraseña'}
          </IonButton>
        </div>
      </IonContent>

      <IonAlert
        isOpen={alerta.abierto}
        onDidDismiss={() => {
          const eraOk = alerta.ok
          setAlerta({ ...alerta, abierto: false })
          if (eraOk) history.goBack()
        }}
        header={alerta.ok ? 'Listo' : 'Atención'}
        message={alerta.msg}
        buttons={['OK']}
      />
    </IonPage>
  )
}

export default CambiarContrasena
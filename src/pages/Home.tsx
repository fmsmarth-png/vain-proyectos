import {
  IonContent, IonPage, IonSpinner
} from '@ionic/react';
import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { sincronizarCache } from '../Context/CacheContext';
import './Home.css';

const ROLES = [
  { value: 'jefe_terreno',          label: 'Jefe de Terreno' },
  { value: 'prof_terminaciones',    label: 'Prof. Terminaciones' },
  { value: 'director_obra',         label: 'Director de Obra' },
  { value: 'Staff', label: 'Staff' },
  { value: 'ayudante_bodega',       label: 'Ayudante de Bodega' },
  { value: 'jefe_bodega',           label: 'Jefe de Bodega' },
];

const Home: React.FC = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [vista, setVista]       = useState<'login' | 'registro' | 'exito'>('login');

  const [regNombre, setRegNombre]     = useState('');
  const [regApellido, setRegApellido] = useState('');
  const [regEmail, setRegEmail]       = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRol, setRegRol]           = useState('');
  const [regProyecto, setRegProyecto] = useState('');
  const [regError, setRegError]       = useState('');
  const [regLoading, setRegLoading]   = useState(false);

  const history = useHistory();
  const { theme } = useTheme();

  const inputBg       = '#1a1a1a';
  const inputBorder   = '#333333';
  const textPrimary   = '#f9fafb';
  const textSecondary = '#6b7280';
  const card          = '#111111';
  const border        = '#222222';

  const login = async () => {
    if (!email.trim() || !password.trim()) { setError('Ingresa tu correo y contraseña'); return; }
    setLoading(true); setError('');
    let lastError = '';
    for (let intento = 0; intento < 3; intento++) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });
        if (error) {
          lastError = error.message;
          if (error.message.includes('Invalid login') || error.message.includes('invalid')) break;
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        if (data.session) {
          setSincronizando(true);
          await sincronizarCache();
          setSincronizando(false);
          history.push('/dashboard');
          setLoading(false);
          return;
        }
      } catch (e: any) {
        lastError = e.message;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    setError(lastError || 'Error al iniciar sesión');
    setLoading(false);
    setSincronizando(false);
  };

  const registrar = async () => {
    if (!regNombre.trim() || !regApellido.trim() || !regEmail.trim() ||
        !regPassword.trim() || !regRol || !regProyecto.trim()) {
      setRegError('Todos los campos son obligatorios'); return;
    }
    if (regPassword.length < 6) { setRegError('La contraseña debe tener al menos 6 caracteres'); return; }
    setRegLoading(true); setRegError('');

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: regEmail.trim(),
        password: regPassword.trim(),
      });
      if (authError) { setRegError(authError.message); setRegLoading(false); return; }

      if (data.user) {
        const { error: perfilError } = await supabase.from('usuarios').insert({
          id:                  data.user.id,
          email:               regEmail.trim(),
          nombre:              `${regNombre.trim()} ${regApellido.trim()}`,
          rol:                 regRol,
          estado:              'pendiente',
          proyecto_solicitado: regProyecto.trim(),
        });

        if (perfilError) {
          setRegError('Error al guardar perfil: ' + perfilError.message);
          await supabase.auth.signOut();
          setRegLoading(false);
          return;
        }

        // Mostrar éxito ANTES de hacer signOut
        setVista('exito');
        setRegLoading(false);

        // SignOut en background para no interrumpir la pantalla de éxito
        setTimeout(() => { supabase.auth.signOut(); }, 500);
        return;

      } else {
        setRegError('No se pudo crear el usuario. Intenta nuevamente.');
      }
    } catch (e: any) {
      setRegError('Error inesperado: ' + e.message);
      await supabase.auth.signOut();
    }
    setRegLoading(false);
  };

  const volverLogin = () => {
    setVista('login');
    setRegNombre(''); setRegApellido(''); setRegEmail('');
    setRegPassword(''); setRegRol(''); setRegProyecto('');
    setRegError('');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, borderRadius: 10, padding: '0 14px',
    background: inputBg, border: `0.5px solid ${inputBorder}`,
    color: textPrimary, fontSize: 14, boxSizing: 'border-box', outline: 'none'
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: textSecondary, textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: 6, display: 'block'
  };

  return (
    <IonPage>
      <IonContent style={{ '--background': '#000000' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: '40px 24px' }}>

          {/* Logo */}
          <div style={{ marginBottom: 40, textAlign: 'center' }}>
            <img src="/logo-vain-blanco.png" style={{ height: 180, objectFit: 'contain' }} alt="VAIN" />
          </div>

          {/* LOGIN */}
          {vista === 'login' && (
            <div style={{ background: card, borderRadius: 14, padding: 24, border: `0.5px solid ${border}`, width: '100%', maxWidth: 400 }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 20, fontWeight: 500, color: textPrimary, marginBottom: 4 }}>Bienvenido</div>
                <div style={{ fontSize: 13, color: textSecondary }}>Información de Proyectos</div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>correo electrónico</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" style={inputStyle} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyPress={e => e.key === 'Enter' && login()} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 24, textAlign: 'right' }}>
                <button
                  onClick={() => history.push('/recuperar-contrasena')}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {error && (
                <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16, background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8, border: '0.5px solid rgba(239,68,68,0.2)' }}>
                  {error.includes('Invalid login') ? 'Correo o contraseña incorrectos' : error}
                </div>
              )}

              <button onClick={login} disabled={loading} style={{ width: '100%', height: 48, borderRadius: 10, background: loading ? '#1d4ed8' : '#2563eb', border: 'none', color: '#fff', fontSize: 15, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                {sincronizando ? (
                  <><IonSpinner name="crescent" style={{ width: 18, height: 18, color: '#fff' }} /><span>Preparando datos...</span></>
                ) : loading ? (
                  <><IonSpinner name="crescent" style={{ width: 18, height: 18, color: '#fff' }} /><span>Ingresando...</span></>
                ) : 'Ingresar'}
              </button>

              <button onClick={() => setVista('registro')} style={{ width: '100%', height: 44, borderRadius: 10, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>
                ¿No tienes cuenta? Solicitar acceso
              </button>

              {sincronizando && (
                <div style={{ marginTop: 12, fontSize: 11, color: textSecondary, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80' }} />
                  Descargando proyectos y datos para uso sin conexión...
                </div>
              )}
            </div>
          )}

          {/* REGISTRO */}
          {vista === 'registro' && (
            <div style={{ background: card, borderRadius: 14, padding: 24, border: `0.5px solid ${border}`, width: '100%', maxWidth: 400 }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 20, fontWeight: 500, color: textPrimary, marginBottom: 4 }}>Solicitar acceso</div>
                <div style={{ fontSize: 13, color: textSecondary }}>Un administrador revisará tu solicitud</div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>nombre *</label>
                  <input value={regNombre} onChange={e => setRegNombre(e.target.value)} placeholder="Juan" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>apellido *</label>
                  <input value={regApellido} onChange={e => setRegApellido(e.target.value)} placeholder="Pérez" style={inputStyle} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>correo electrónico *</label>
                <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="tu@correo.com" style={inputStyle} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>contraseña *</label>
                <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="Mínimo 6 caracteres" style={inputStyle} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>cargo *</label>
                <select value={regRol} onChange={e => setRegRol(e.target.value)} style={{ ...inputStyle, color: regRol ? textPrimary : textSecondary }}>
                  <option value="">Seleccionar cargo...</option>
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value} style={{ background: '#111111', color: textPrimary }}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>proyecto en el que trabajas *</label>
                <input value={regProyecto} onChange={e => setRegProyecto(e.target.value)} placeholder="Ej: Parque Eyzaguirre, VGR4..." style={inputStyle} />
                <div style={{ fontSize: 11, color: '#4b5563', marginTop: 6 }}>El administrador te asignará acceso a tu proyecto</div>
              </div>

              {regError && (
                <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16, background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8, border: '0.5px solid rgba(239,68,68,0.2)' }}>{regError}</div>
              )}

              <button onClick={registrar} disabled={regLoading} style={{ width: '100%', height: 48, borderRadius: 10, background: regLoading ? '#1d4ed8' : '#2563eb', border: 'none', color: '#fff', fontSize: 15, fontWeight: 500, cursor: regLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                {regLoading
                  ? <><IonSpinner name="crescent" style={{ width: 18, height: 18, color: '#fff' }} /><span>Enviando...</span></>
                  : 'Enviar solicitud'}
              </button>

              <button onClick={volverLogin} style={{ width: '100%', height: 44, borderRadius: 10, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>
                ← Volver al inicio de sesión
              </button>
            </div>
          )}

          {/* ÉXITO */}
          {vista === 'exito' && (
            <div style={{ background: card, borderRadius: 14, padding: 32, border: `0.5px solid ${border}`, width: '100%', maxWidth: 400, textAlign: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 26, color: '#4ade80' }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: textPrimary, marginBottom: 8 }}>Solicitud enviada</div>
              <div style={{ fontSize: 13, color: textSecondary, lineHeight: 1.6, marginBottom: 28 }}>
                Tu solicitud fue recibida correctamente. Un administrador revisará tu acceso y te notificará cuando esté listo.
              </div>

              <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '12px 16px', textAlign: 'left', marginBottom: 24, border: `0.5px solid ${border}` }}>
                <div style={{ fontSize: 10, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Datos enviados</div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>👤 {regNombre} {regApellido}</div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>📧 {regEmail}</div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>💼 {ROLES.find(r => r.value === regRol)?.label}</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>🏗️ {regProyecto}</div>
              </div>

              <button onClick={volverLogin} style={{ width: '100%', height: 44, borderRadius: 10, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>
                ← Volver al inicio de sesión
              </button>
            </div>
          )}

          <div style={{ marginTop: 32, fontSize: 11, color: textSecondary, textAlign: 'center' }}>{'<FMS>'} · 2026</div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Home;
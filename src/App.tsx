import { PermisosProvider } from './Context/PermisosContext';
import { Redirect, Route } from 'react-router-dom';
import { IonApp, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { SplashScreen } from '@capacitor/splash-screen';
import Home from './pages/Home';
import RecuperarContrasena from './pages/RecuperarContrasena';
import RestablecerContrasena from './pages/RestablecerContrasena';
import { ThemeProvider } from './Context/ThemeContext';
import { OfflineProvider } from './Context/OfflineContext';
import { CacheProvider } from './Context/CacheContext';
import ProtectedRoutes from './components/ProtectedRoutes';
import InformePV from './components/InformePV';
import { registrarDeepLinkRecovery } from './helpers/deepLinkRecovery';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

import './theme/variables.css';

setupIonicReact();

// Levantamiento Cerámicos: pantalla provisoria, acceso restringido a estos dos correos
const EMAILS_CERAMICOS = ['jcaballero@vain.cl', 'cgarces@vain.cl', 'fmsmarth@gmail.com'];

// Detección SÍNCRONA del enlace de recuperación (antes del primer render).
// Supabase, tras verificar el token, redirige a /restablecer-contrasena con el
// token en el hash (#access_token=...&type=recovery). Hay que detectarlo aquí
// y no dentro de un useEffect, porque para cuando el efecto corre el router ya
// pudo haber resuelto el <Redirect to="/home" /> y limpiado el hash.
const esEnlaceRecovery = (): boolean => {
  const h = window.location.hash || '';
  const s = window.location.search || '';
  const p = window.location.pathname || '';
  return (
    h.includes('type=recovery') ||
    s.includes('type=recovery') ||
    p.includes('/restablecer-contrasena')
  );
};

const App: React.FC = () => {
  const [session, setSession]     = useState<any>(null);
  const [usuario, setUsuario]     = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [pendiente, setPendiente] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<boolean>(() => esEnlaceRecovery());

  const cargarUsuario = async (id: string) => {
    try {
      const { data } = await Promise.race([
        supabase.from('usuarios').select('*').eq('id', id).single(),
        new Promise<any>((_, reject) => setTimeout(() => reject('timeout'), 5000))
      ]);
      if (data) {
        if (data.estado === 'pendiente') {
          setPendiente(true);
          setUsuario(null);
          setLoading(false);
          return;
        }
        setPendiente(false);
        setUsuario(data);
        localStorage.setItem('cache_usuario', JSON.stringify(data));
      } else {
        const cached = localStorage.getItem('cache_usuario');
        if (cached) setUsuario(JSON.parse(cached));
      }
    } catch {
      const cached = localStorage.getItem('cache_usuario');
      if (cached) setUsuario(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    SplashScreen.hide().catch(() => {});

    // Deep link de recuperación de contraseña en nativo (Android/iOS): cuando
    // el correo abre la app con el token, activamos el modo recuperación y
    // navegamos a la pantalla de nueva contraseña.
    registrarDeepLinkRecovery(() => {
      setRecoveryMode(true);
      setLoading(false);
      window.location.hash = '#/restablecer-contrasena';
    });
    const splashMinimo = new Promise(r => setTimeout(r, 2000));
    const timeout = setTimeout(() => {
      const cached = localStorage.getItem('cache_usuario');
      if (cached && !usuario) setUsuario(JSON.parse(cached));
      setLoading(false);
    }, 7000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const cached = localStorage.getItem('cache_usuario');
        if (cached && !usuario) setUsuario(JSON.parse(cached));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // Si llegamos por un enlace de recuperación, no cargamos usuario ni
      // dejamos que la sesión temporal nos lleve al Dashboard.
      if (esEnlaceRecovery()) {
        setSession(session);
        setRecoveryMode(true);
        setLoading(false);
        return;
      }
      setSession(session);
      if (session?.user) {
        await Promise.all([cargarUsuario(session.user.id), splashMinimo]);
      } else {
        await splashMinimo;
        setLoading(false);
      }
    });

    // Si la URL trae el token de recovery (llegó desde el link del email),
    // activamos el modo recuperación de inmediato y cortamos el loading para
    // no quedarnos en el spinner ni caer al Dashboard/Home.
    if (esEnlaceRecovery()) {
      setRecoveryMode(true);
      setLoading(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // Supabase dispara PASSWORD_RECOVERY cuando el usuario llega desde el
      // link del email. En ese caso NO lo mandamos al Dashboard: mostramos la
      // pantalla para crear una nueva contraseña.
      if (_event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setSession(session);
        setLoading(false);
        return;
      }
      // Si ya estamos en modo recuperación, ignoramos el resto de eventos de
      // auth (la sesión temporal de recovery no debe llevarnos al Dashboard).
      if (recoveryMode) {
        setSession(session);
        setLoading(false);
        return;
      }
      setSession(session);
      if (session?.user) await cargarUsuario(session.user.id);
      else { setUsuario(null); setPendiente(false); setLoading(false); }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (loading && !recoveryMode) return (
    <div style={{ background: '#0a1628', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <img src="/logo-vain-blanco.png" style={{ height: 120, objectFit: 'contain' }} alt="VAIN" />
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }`}</style>
    </div>
  );

  if (pendiente) return (
    <div style={{ background: '#0B1220', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <img src="/logo-vain-blanco.png" style={{ height: 100, objectFit: 'contain', marginBottom: 32 }} alt="VAIN" />
      <div style={{ background: '#1B2C48', borderRadius: 14, padding: 28, border: '0.5px solid #222222', maxWidth: 340, width: '100%' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: '#f9fafb', marginBottom: 8 }}>Solicitud en revisión</div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
          Tu solicitud de acceso fue recibida. Un administrador la revisará y te dará acceso pronto.
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); setPendiente(false); }}
          style={{ width: '100%', height: 44, borderRadius: 10, background: 'transparent', border: '0.5px solid #222222', color: '#6b7280', fontSize: 14, cursor: 'pointer' }}>
          Volver al inicio
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#374151', marginTop: 24 }}>&lt;FMS&gt; · VAIN Detalles</div>
    </div>
  );

  return (
    <ThemeProvider>
      <OfflineProvider>
        <CacheProvider>
          <PermisosProvider>
            <IonApp>
              <IonReactRouter>
                {recoveryMode ? (
                  // Llegó desde el link del email: crear nueva contraseña,
                  // aunque exista una sesión de recovery activa.
                  <>
                    <Route exact path="/restablecer-contrasena" component={RestablecerContrasena} />
                    <Redirect to="/restablecer-contrasena" />
                  </>
                ) : session && usuario ? (
                  <ProtectedRoutes usuario={usuario} />
                ) : (
                  <>
                    <Route exact path="/home" component={Home} />
                    <Route exact path="/recuperar-contrasena" component={RecuperarContrasena} />
                    <Route exact path="/restablecer-contrasena" component={RestablecerContrasena} />
                    <Redirect to="/home" />
                  </>
                )}
              </IonReactRouter>
            </IonApp>
          </PermisosProvider>
        </CacheProvider>
      </OfflineProvider>
    </ThemeProvider>
  );
};

export default App;
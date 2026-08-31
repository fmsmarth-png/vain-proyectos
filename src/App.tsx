import { PermisosProvider } from './Context/PermisosContext';
import { Redirect, Route } from 'react-router-dom';
import { IonApp, setupIonicReact, IonSpinner } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { useEffect, useState, lazy, Suspense } from 'react';
import { supabase } from './supabase';
import { SplashScreen } from '@capacitor/splash-screen';
import { ThemeProvider } from './Context/ThemeContext';
import { OfflineProvider } from './Context/OfflineContext';
import { CacheProvider } from './Context/CacheContext';
import { registrarDeepLinkRecovery } from './helpers/deepLinkRecovery';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

import './theme/variables.css';

setupIonicReact();

// Todo lazy: ninguna página se evalúa al arrancar (evita el congelamiento por
// módulos pesados como pdfjs-dist v6).
const Home = lazy(() => import('./pages/Home'));
const RecuperarContrasena = lazy(() => import('./pages/RecuperarContrasena'));
const RestablecerContrasena = lazy(() => import('./pages/RestablecerContrasena'));
const ProtectedRoutes = lazy(() => import('./components/ProtectedRoutes'));

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

const Cargando: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <IonSpinner name="crescent" />
  </div>
);

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

    registrarDeepLinkRecovery(() => {
      setRecoveryMode(true);
      setLoading(false);
      window.location.hash = '#/restablecer-contrasena';
    });

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

    // getUser() en vez de getSession(): getSession se cuelga por el deadlock
    // del LockManager bajo React 19 StrictMode; getUser resuelve siempre.
    supabase.auth.getUser().then(async ({ data }) => {
      if (esEnlaceRecovery()) {
        setRecoveryMode(true);
        setLoading(false);
        return;
      }
      if (data?.user) {
        setSession({ user: data.user });
        await cargarUsuario(data.user.id);
      } else {
        setLoading(false);
      }
    }).catch(() => {
      setLoading(false);
    });

    if (esEnlaceRecovery()) {
      setRecoveryMode(true);
      setLoading(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setSession(sess);
        setLoading(false);
        return;
      }
      if (recoveryMode) {
        setSession(sess);
        setLoading(false);
        return;
      }
      setSession(sess);
      if (sess?.user) await cargarUsuario(sess.user.id);
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
          {/* FIX: PermisosProvider obtiene usuarioId internamente de Supabase, no lo acepte como prop */}
          <PermisosProvider>
            <IonApp>
              <IonReactRouter>
                <Suspense fallback={<Cargando />}>
                  {recoveryMode ? (
                    <>
                      <Route exact path="/restablecer-contrasena" component={RestablecerContrasena} />
                      <Redirect to="/restablecer-contrasena" />
                    </>
                  ) : session && usuario ? (
                    <>
                      {/* El Redirect de "/" vive aquí, a nivel del router de App,
                          NO dentro del IonRouterOutlet de ProtectedRoutes (ahí
                          RR v5 + Ionic no lo dispara de forma confiable). */}
                      <Route exact path="/" render={() => <Redirect to="/dashboard" />} />
                      <ProtectedRoutes usuario={usuario} />
                    </>
                  ) : (
                    <>
                      <Route exact path="/home" component={Home} />
                      <Route exact path="/recuperar-contrasena" component={RecuperarContrasena} />
                      <Route exact path="/restablecer-contrasena" component={RestablecerContrasena} />
                      <Redirect to="/home" />
                    </>
                  )}
                </Suspense>
              </IonReactRouter>
            </IonApp>
          </PermisosProvider>
        </CacheProvider>
      </OfflineProvider>
    </ThemeProvider>
  );
};

export default App;
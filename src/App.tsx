import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, IonSplitPane, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { SplashScreen } from '@capacitor/splash-screen';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Proyectos from './pages/Proyectos';
import DetalleProyecto from './pages/DetalleProyecto';
import DetalleRegistro from './pages/DetalleRegistro';
import Admin from './pages/Admin';
import Reportes from './pages/Reportes';
import Inspeccion from './pages/Inspeccion';
import InspeccionDepto from './pages/InspeccionDepto';
import Revision from './pages/Revision';
import ZonasComunes from './pages/ZonasComunes';
import VisitaObra from './pages/VisitaObra';
import PostVenta from './pages/PostVenta';
import MenuLateral from './components/MenuLateral';
import { ThemeProvider } from './Context/ThemeContext';
import { OfflineProvider } from './Context/OfflineContext';
import { CacheProvider } from './Context/CacheContext';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import RevisionOG         from './pages/RevisionOG';
import RevisionOGDetalle  from './pages/RevisionOGDetalle';
import RevisionOGAmbiente from './pages/RevisionOGAmbiente';
import RevisionOGResumen  from './pages/RevisionOGResumen';
import CalibradorPlano    from './pages/CalibradorPlano';
import GenerarVale        from './pages/GenerarVale';
import AprobacionBodega   from './pages/Aprobacionbodega';
import StockBodega        from './pages/StockBodega';
import DashboardBodega    from './pages/DashboardBodega';
import './theme/variables.css';

setupIonicReact();

const App: React.FC = () => {
  const [session, setSession]     = useState<any>(null);
  const [usuario, setUsuario]     = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [pendiente, setPendiente] = useState(false);

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
      setSession(session);
      if (session?.user) {
        await Promise.all([cargarUsuario(session.user.id), splashMinimo]);
      } else {
        await splashMinimo;
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
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

  if (loading) return (
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
    <div style={{ background: '#000000', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <img src="/logo-vain-blanco.png" style={{ height: 100, objectFit: 'contain', marginBottom: 32 }} alt="VAIN" />
      <div style={{ background: '#111111', borderRadius: 14, padding: 28, border: '0.5px solid #222222', maxWidth: 340, width: '100%' }}>
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

  const puedeVisitar      = ['staff', 'administrador'].includes(usuario?.rol);
  const puedePostventa    = usuario?.rol === 'administrador' || usuario?.puede_postventa === true;
  const puedeOG           = ['staff', 'administrador', 'prof_obra_gruesa'].includes(usuario?.rol ?? '');
  // Bodega — Pantalla 1: jefe_terreno (cualquier especialidad) + staff/administrador para poder probar
  const puedeGenerarVale  = ['staff', 'administrador', 'jefe_terreno'].includes(usuario?.rol ?? '');
  // Bodega — Pantalla 2: ayudante_bodega / jefe_bodega + staff/administrador para poder probar
  const puedeAprobarBodega = ['staff', 'administrador', 'ayudante_bodega', 'jefe_bodega'].includes(usuario?.rol ?? '');
  // Bodega — Pantalla 3: ayudante_bodega / jefe_bodega + staff/administrador para poder probar
  const puedeVerStock = ['staff', 'administrador', 'ayudante_bodega', 'jefe_bodega'].includes(usuario?.rol ?? '');
  // Roles cuyo único contexto es bodega: ven un dashboard distinto y un menú acotado
  const esRolBodega = ['ayudante_bodega', 'jefe_bodega'].includes(usuario?.rol ?? '');

  return (
    <ThemeProvider>
      <OfflineProvider>
        <CacheProvider>
          <IonApp>
            <IonReactRouter>
              {session && usuario ? (
                <IonSplitPane contentId="main-content" when="false">
                  <MenuLateral usuario={usuario} />
                  <IonRouterOutlet id="main-content">
                    <Route exact path="/dashboard" render={() =>
                      esRolBodega ? <DashboardBodega /> : <Dashboard />
                    } />
                    <Route exact path="/proyectos" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <Proyectos />
                    } />
                    <Route exact path="/proyectos/:id" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <DetalleProyecto />
                    } />
                    <Route exact path="/registros/:id" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <DetalleRegistro />
                    } />
                    <Route exact path="/admin" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <Admin />
                    } />
                    <Route exact path="/reportes" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <Reportes />
                    } />
                    <Route exact path="/inspeccion" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <Inspeccion />
                    } />
                    <Route exact path="/inspeccion/depto" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <InspeccionDepto />
                    } />
                    <Route exact path="/revision" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <Revision />
                    } />
                    <Route exact path="/zonas-comunes" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <ZonasComunes />
                    } />
                    <Route exact path="/post-venta" render={() =>
                      esRolBodega ? <Redirect to="/dashboard" /> : <PostVenta />
                    } />

                    {/* Revisión OG */}
                    <Route exact path="/revision-og" render={() =>
                      puedeOG ? <RevisionOG /> : <Redirect to="/dashboard" />
                    } />
                    <Route exact path="/revision-og/detalle" render={() =>
                      puedeOG ? <RevisionOGDetalle /> : <Redirect to="/dashboard" />
                    } />
                    <Route exact path="/revision-og/ambiente" render={() =>
                      puedeOG ? <RevisionOGAmbiente /> : <Redirect to="/dashboard" />
                    } />
                    <Route exact path="/revision-og/resumen" render={() =>
                      puedeOG ? <RevisionOGResumen /> : <Redirect to="/dashboard" />
                    } />

                    {/* Calibrador de planos OG — solo admin */}
                    <Route exact path="/calibrador-plano" render={() =>
                      usuario?.rol === 'administrador' ? <CalibradorPlano /> : <Redirect to="/dashboard" />
                    } />

                    {/* Visita de obra */}
                    <Route exact path="/visita-obra" render={() =>
                      puedeVisitar ? <VisitaObra /> : <Redirect to="/dashboard" />
                    } />

                    {/* Bodega — Pantalla 1: Generar Vale */}
                    <Route exact path="/bodega/generar-vale" render={() =>
                      puedeGenerarVale ? <GenerarVale /> : <Redirect to="/dashboard" />
                    } />

                    {/* Bodega — Pantalla 2: Aprobación */}
                    <Route exact path="/bodega/aprobacion" render={() =>
                      puedeAprobarBodega ? <AprobacionBodega /> : <Redirect to="/dashboard" />
                    } />

                    {/* Bodega — Pantalla 3: Stock */}
                    <Route exact path="/bodega/stock" render={() =>
                      puedeVerStock ? <StockBodega /> : <Redirect to="/dashboard" />
                    } />

                    <Redirect exact from="/" to="/dashboard" />
                  </IonRouterOutlet>
                </IonSplitPane>
              ) : (
                <IonRouterOutlet>
                  <Route exact path="/home" component={Home} />
                  <Redirect to="/home" />
                </IonRouterOutlet>
              )}
            </IonReactRouter>
          </IonApp>
        </CacheProvider>
      </OfflineProvider>
    </ThemeProvider>
  );
};

export default App;

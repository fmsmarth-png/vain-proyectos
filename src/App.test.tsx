import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, IonSplitPane, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Proyectos from './pages/Proyectos';
import DetalleProyecto from './pages/DetalleProyecto';
import DetalleRegistro from './pages/DetalleRegistro';
import Admin from './pages/Admin';
import Reportes from './pages/Reportes';
import Inspeccion from './pages/Inspeccion';
import InspeccionDepto from './pages/InspeccionDepto';
//import Revision from './pages/Revision';
import MenuLateral from './components/MenuLateral';
import { ThemeProvider } from './Context/ThemeContext';
import { OfflineProvider } from './Context/OfflineContext';
import { CacheProvider } from './Context/CacheContext';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import './theme/variables.css';

setupIonicReact();

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [usuario, setUsuario] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const cargarUsuario = async (id: string) => {
    try {
      const { data } = await supabase.from('usuarios').select('*').eq('id', id).single();
      setUsuario(data);
    } catch (e) {
      console.error('Error cargando usuario:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      console.log('Timeout de seguridad activado');
      setLoading(false);
    }, 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) cargarUsuario(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) await cargarUsuario(session.user.id);
      else { setUsuario(null); setLoading(false); }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  if (loading) return (
    <div style={{ color: 'white', padding: 20, background: '#111', minHeight: '100vh' }}>
      Cargando... (si ves esto por más de 5 segundos hay un problema)
    </div>
  );

  return (
    <ThemeProvider>
      <OfflineProvider>
        <CacheProvider>
          <IonApp>
            <IonReactRouter>
              {session ? (
                <IonSplitPane contentId="main-content" when="false">
                  <MenuLateral usuario={usuario} />
                  <IonRouterOutlet id="main-content">
                    <Route exact path="/dashboard"        component={Dashboard} />
                    <Route exact path="/proyectos"        component={Proyectos} />
                    <Route exact path="/proyectos/:id"    component={DetalleProyecto} />
                    <Route exact path="/registros/:id"    component={DetalleRegistro} />
                    <Route exact path="/admin"            component={Admin} />
                    <Route exact path="/reportes"         component={Reportes} />
                    <Route exact path="/inspeccion"       component={Inspeccion} />
                    <Route exact path="/inspeccion/depto" component={InspeccionDepto} />
                     {/* <Route exact path="/revision" component={Revision} /> */}
                     
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
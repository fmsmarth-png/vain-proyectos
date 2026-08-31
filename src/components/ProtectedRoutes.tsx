// src/components/ProtectedRoutes.tsx
// FMS — Julio 2026
// Rutas protegidas por permisos dinámicos
//
// FIX (jul 2026 · navegación OG): la rama "cargando" ya NO reemplaza el
//   IonRouterOutlet por un <Dashboard/> pelado. Eso destruía el stack de
//   navegación cada vez que los permisos se recalculaban en caliente
//   (onAuthStateChange / resume desde segundo plano), botando al usuario al
//   dashboard o a pantalla blanca estando dentro de un flujo (p. ej. OG).
//   Ahora el bloqueo de carga solo aplica en la PRIMERA carga (yaCargo);
//   en recomputes posteriores las <Route> siguen montadas.

import React, { useRef } from 'react';
import { Route, Redirect } from 'react-router-dom';
import { IonSplitPane, IonRouterOutlet } from '@ionic/react';
import { usePermiso } from '../Context/usePermiso';
import MenuLateral from './MenuLateral';
import { NotificacionModal } from './NotificacionModal';

// Páginas
import Dashboard from '../pages/Dashboard';
import Proyectos from '../pages/Proyectos';
import DetalleProyecto from '../pages/DetalleProyecto';
import DetalleRegistro from '../pages/DetalleRegistro';
import Admin from '../pages/Admin';
import Reportes from '../pages/Reportes';
import Inspeccion from '../pages/Inspeccion';
import InspeccionDepto from '../pages/InspeccionDepto';
import Revision from '../pages/Revision';
import ZonasComunes from '../pages/ZonasComunes';
import VisitaObra from '../pages/VisitaObra';
import PostVenta from '../pages/PostVenta';
import CalendarioPostVenta from '../pages/CalendarioPostVenta';
import PreEntrega from '../pages/PreEntrega';
import PreEntregaDepto from '../pages/PreEntregaDepto';
import DeptosFiltrados from '../pages/DeptosFiltrados';
import DetalleDepto from '../pages/DetalleDepto';
import PreEntregaReportes from '../pages/PreEntregaReportes';
import InformePV from '../components/InformePV';
import RevisionOG from '../pages/RevisionOG';
import RevisionOGDetalle from '../pages/RevisionOGDetalle';
import RevisionOGAmbiente from '../pages/RevisionOGAmbiente';
import RevisionOGResumen from '../pages/RevisionOGResumen';
import ReporteOG from '../pages/ReporteOG';
import ReporteVisualOG from '../pages/ReporteVisualOG';
import CalibradorPlano from '../pages/CalibradorPlano';
import CalibradorElementos from '../pages/Calibradorelementos';
import GenerarVale from '../pages/GenerarVale';
import AprobacionBodega from '../pages/Aprobacionbodega';
import StockBodega from '../pages/StockBodega';
import DashboardBodega from '../pages/DashboardBodega';
import CargarAyni from '../pages/CargarAyni';
import GestionKits from '../pages/GestionKits';
import BodegaCentral from '../pages/BodegaCentral';
import PrestamosMaterial from '../pages/PrestamosMaterial';
import LevantamientoCeramicos from '../pages/LevantamientoCeramicos';
import LevantamientoCeramicosDetalle from '../pages/LevantamientoCeramicosDetalle';
import LevantamientoCeramicosChecklist from '../pages/LevantamientoCeramicosChecklist';
import AdminNotificaciones from '../pages/AdminNotificaciones';
import CambiarContrasena from '../pages/CambiarContrasena';

const EMAILS_CERAMICOS = ['jcaballero@vain.cl', 'cgarces@vain.cl', 'fmsmarth@gmail.com'];

interface ProtectedRoutesProps {
  usuario: any;
}

/**
 * Componente que renderiza rutas protegidas por permisos dinámicos
 * Este componente DEBE estar dentro de <PermisosProvider>
 */
const ProtectedRoutes: React.FC<ProtectedRoutesProps> = ({ usuario }) => {
  const { tienePermiso, cargando } = usePermiso();

  // Marca si los permisos ya se cargaron alguna vez. En recomputes en caliente
  // (login/logout/cambio de usuario, resume desde segundo plano) NO volvemos a
  // mostrar la pantalla de carga: eso vaciaría el outlet y rompería el stack.
  const yaCargo = useRef(false);
  if (!cargando) yaCargo.current = true;

  // Solo bloquea la PRIMERA carga (aún sin permisos resueltos).
  if (cargando && !yaCargo.current) {
    return (
      <IonSplitPane contentId="main-content" when="false">
        <MenuLateral usuario={usuario} />
        <IonRouterOutlet id="main-content">
          <Dashboard />
        </IonRouterOutlet>
      </IonSplitPane>
    );
  }

  const esRolBodega = ['ayudante_bodega', 'jefe_bodega'].includes(usuario?.rol ?? '');
  const puedeCeramicos = EMAILS_CERAMICOS.includes(usuario?.email ?? '');
  // maestro_postventa: solo navega Pre Entrega (hub) + Deptos Filtrados +
  // Detalle Depto + Revisión (para marcar solucionado) + Calendario/Post
  // Venta. Varias rutas de abajo comparten el mismo permiso ('preentrega_ver'
  // cubre tanto /pre-entrega como /pre-entrega/:deptoId, /informe-pv y
  // /pre-entrega-reportes; 'revision_ver' cubre tanto /revision como
  // /reportes) así que no basta con otorgarle el permiso en la tabla
  // rol_permisos: hay que excluirlo a mano de las rutas que no debe ver.
  const esMaestroPostventa = usuario?.rol === 'maestro_postventa';

  return (
    <IonSplitPane contentId="main-content" when="false">
      <MenuLateral usuario={usuario} />
      <NotificacionModal />
      <IonRouterOutlet id="main-content">
        <Route exact path="/dashboard" render={() =>
          esMaestroPostventa ? <Redirect to="/pre-entrega" />
          : esRolBodega ? <DashboardBodega />
          : <Dashboard />
        } />

        <Route exact path="/proyectos" render={() =>
          (!esRolBodega && !esMaestroPostventa) ? <Proyectos /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/proyectos/:id" render={() =>
          (!esRolBodega && !esMaestroPostventa) ? <DetalleProyecto /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/registros/:id" render={() =>
          (!esRolBodega && !esMaestroPostventa) ? <DetalleRegistro /> : <Redirect to="/dashboard" />
        } />

        {/* Inspección */}
        <Route exact path="/inspeccion" render={() =>
          tienePermiso('inspeccion_crear') ? <Inspeccion /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/inspeccion/depto" render={() =>
          tienePermiso('inspeccion_crear') ? <InspeccionDepto /> : <Redirect to="/dashboard" />
        } />

        {/* Revisión */}
        <Route exact path="/revision" render={() =>
          tienePermiso('revision_ver') ? <Revision /> : <Redirect to="/dashboard" />
        } />

        {/* Zonas Comunes */}
        <Route exact path="/zonas-comunes" render={() =>
          tienePermiso('zc_ver') ? <ZonasComunes /> : <Redirect to="/dashboard" />
        } />

        {/* Post Venta */}
        <Route exact path={['/post-venta', '/post-venta/:deptoId']} render={() =>
          tienePermiso('postventa_ver') ? <PostVenta /> : <Redirect to="/dashboard" />
        } />

        {/* Calendario Post Venta */}
        <Route exact path="/calendario-postventa" render={() =>
          tienePermiso('postventa_ver') ? <CalendarioPostVenta /> : <Redirect to="/dashboard" />
        } />

        {/* Pre Entrega */}
        <Route exact path="/pre-entrega" render={() =>
          tienePermiso('preentrega_ver') ? <PreEntrega /> : <Redirect to="/dashboard" />
        } />

        {/*
          PreEntregaDepto comparte el permiso 'preentrega_ver' con el hub
          /pre-entrega, pero maestro_postventa no debe poder editar el acta
          de pre entrega ni le debe aparecer esa opción — se excluye a mano.
        */}
        <Route path="/pre-entrega/:deptoId" render={() =>
          (tienePermiso('preentrega_ver') && !esMaestroPostventa) ? <PreEntregaDepto /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/deptos-filtrados" render={() =>
          tienePermiso('preentrega_ver') ? <DeptosFiltrados /> : <Redirect to="/dashboard" />
        } />

        <Route path="/detalle-depto/:id" component={DetalleDepto} />

        {/*
          Informe PV — Indicador de Producción. Es un informe: maestro_postventa
          no debe acceder aunque comparta el permiso 'preentrega_ver' con el hub.
        */}
        <Route exact path="/informe-pv" render={() =>
          (tienePermiso('preentrega_ver') && !esMaestroPostventa) ? <InformePV /> : <Redirect to="/dashboard" />
        } />

        {/*
          Reportes Pre Entrega. maestro_postventa no tiene acceso a páginas de
          reportes; se excluye aunque comparta 'preentrega_ver' con el hub.
        */}
        <Route exact path="/pre-entrega-reportes" render={() =>
          (tienePermiso('preentrega_ver') && !esMaestroPostventa) ? <PreEntregaReportes /> : <Redirect to="/dashboard" />
        } />

        {/* Revisión OG */}
        <Route exact path="/revision-og" render={() =>
          tienePermiso('og_ver') ? <RevisionOG /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/revision-og/detalle" render={() =>
          tienePermiso('og_ver') ? <RevisionOGDetalle /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/revision-og/ambiente" render={() =>
          tienePermiso('og_ver') ? <RevisionOGAmbiente /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/revision-og/resumen" render={() =>
          tienePermiso('og_ver') ? <RevisionOGResumen /> : <Redirect to="/dashboard" />
        } />

        {/* Reporte OG (analítico · autofiltro estilo Excel) */}
        <Route exact path="/reporte-og" render={() =>
          tienePermiso('og_ver') ? <ReporteOG /> : <Redirect to="/dashboard" />
        } />

        {/* Reporte Visual OG (cascada Proyecto ▸ Torre ▸ Piso ▸ Depto → plano) */}
        <Route exact path="/reporte-visual-og" render={() =>
          tienePermiso('og_ver') ? <ReporteVisualOG /> : <Redirect to="/dashboard" />
        } />

        {/* Calibradores OG */}
        <Route exact path="/calibrador-plano" render={() =>
          tienePermiso('admin_permisos') ? <CalibradorPlano /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/calibrador-elementos" render={() =>
          tienePermiso('admin_permisos') ? <CalibradorElementos /> : <Redirect to="/dashboard" />
        } />

        {/* Visita de Obra */}
        <Route exact path="/visita-obra" render={() =>
          tienePermiso('visita_ver') ? <VisitaObra /> : <Redirect to="/dashboard" />
        } />

        {/* Bodega */}
        <Route exact path="/bodega/generar-vale" render={() =>
          (tienePermiso('bodega_ver') && usuario?.rol !== 'ayudante_bodega') ? <GenerarVale /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/bodega/aprobacion" render={() =>
          (tienePermiso('bodega_ver') || tienePermiso('bodega_aprobar')) ? <AprobacionBodega /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/bodega/stock" render={() =>
          tienePermiso('bodega_ver') ? <StockBodega /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/bodega/cargar-ayni" render={() =>
          tienePermiso('bodega_cargar_ayni') ? <CargarAyni /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/bodega/kits" render={() =>
          tienePermiso('bodega_gestionar_kits') ? <GestionKits /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/bodega/central" render={() =>
          tienePermiso('bodega_central') ? <BodegaCentral /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/bodega/prestamos" render={() =>
          tienePermiso('bodega_prestamos') ? <PrestamosMaterial /> : <Redirect to="/dashboard" />
        } />

        {/* Levantamiento Cerámicos */}
        <Route exact path="/levantamiento-ceramicos" render={() =>
          puedeCeramicos ? <LevantamientoCeramicos /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/levantamiento-ceramicos/detalle" render={() =>
          puedeCeramicos ? <LevantamientoCeramicosDetalle /> : <Redirect to="/dashboard" />
        } />

        <Route exact path="/levantamiento-ceramicos/checklist" render={() =>
          puedeCeramicos ? <LevantamientoCeramicosChecklist /> : <Redirect to="/dashboard" />
        } />

        {/* Admin */}
        <Route exact path="/admin" render={() =>
          tienePermiso('admin_permisos') ? <Admin /> : <Redirect to="/dashboard" />
        } />

        {/*
          Reportes. maestro_postventa no tiene acceso a la página de reportes,
          aunque comparta el permiso 'revision_ver' con /revision (que sí
          necesita, para marcar observaciones como solucionadas).
        */}
        <Route exact path="/reportes" render={() =>
          (tienePermiso('revision_ver') && !esMaestroPostventa) ? <Reportes /> : <Redirect to="/dashboard" />
        } />

        {/* Admin Notificaciones */}
        <Route exact path="/admin-notificaciones" render={() =>
  (usuario?.email === 'fmsmarth@gmail.com' || tienePermiso('admin_permisos')) ? <AdminNotificaciones /> : <Redirect to="/dashboard" />
} />

        {/* Cambiar Contraseña */}
        <Route exact path="/cambiar-contrasena" component={CambiarContrasena} />

        <Redirect exact from="/" to={esMaestroPostventa ? '/pre-entrega' : '/dashboard'} />
      </IonRouterOutlet>
    </IonSplitPane>
  );
};

export default ProtectedRoutes;
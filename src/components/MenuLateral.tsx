import { IonMenu, IonContent } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { lineaConfig } from '../utils/lineas';

interface Props { usuario: any; }

const MenuLateral: React.FC<Props> = ({ usuario }) => {
  const history = useHistory();
  const { theme, toggleTheme } = useTheme();
  const { online, pendientes } = useOffline();
  const dark = theme === 'dark';

  const esJcaballero = usuario?.email === 'jcaballero@vain.cl';

  const bgMenu       = esJcaballero ? '#0d0008' : '#000';
  const borderColor  = esJcaballero ? '#2d0020' : '#1a1a1a';
  const accentColor  = esJcaballero ? '#ff69b4' : '#555';
  const accentBg     = esJcaballero ? 'rgba(255,105,180,0.06)' : 'rgba(255,255,255,0.03)';
  const accentText   = esJcaballero ? '#ff9fd4' : '#f9fafb';
  const avatarBg     = esJcaballero ? 'linear-gradient(135deg, #3d0030, #6d0050)' : 'linear-gradient(135deg, #1a1a1a, #222)';
  const avatarBorder = esJcaballero ? '#6d0040' : '#2a2a2a';
  const avatarColor  = esJcaballero ? '#ff9fd4' : '#888';

  const lc = usuario?.linea ? lineaConfig[usuario.linea] : null;

  const navegar = (ruta: string) => {
    history.push(ruta);
    (document.querySelector('ion-menu') as any)?.close();
  };

  const logout = async () => {
    (document.querySelector('ion-menu') as any)?.close();
    await supabase.auth.signOut();
  };

  const iniciales = (nombre: string) =>
    nombre?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? 'U';

  const rol = usuario?.rol;

  const puedeRegistrar = ['jefe_terreno', 'prof_terminaciones', 'director_obra', 'administrador', 'staff'].includes(rol);
  const puedeRevisar   = ['jefe_terreno', 'prof_terminaciones', 'director_obra', 'administrador', 'staff'].includes(rol);
  const puedeReportes  = ['prof_terminaciones', 'director_obra', 'administrador', 'staff'].includes(rol);
  const puedeVisitar   = ['staff', 'administrador'].includes(rol);
  // Post venta: administrador siempre puede; el resto solo si tiene puede_postventa = true
  const puedePostventa = rol === 'administrador' || usuario?.puede_postventa === true;
const puedeOG = ['administrador'].includes(rol ?? '');
  const menuItems = [
    { icon: '🏠', label: 'Inicio',                       ruta: '/dashboard',   seccion: 'principal' },
    { icon: '🏗️', label: 'Proyectos',                   ruta: '/proyectos',   seccion: 'principal' },
    ...(puedeRegistrar  ? [{ icon: '📋', label: 'Registrar Observaciones',  ruta: '/inspeccion',  seccion: 'principal' }] : []),
    ...(puedeRevisar    ? [{ icon: '✅', label: 'Revisión de Observaciones', ruta: '/revision',    seccion: 'principal' }] : []),
    ...(puedeReportes   ? [{ icon: '📊', label: 'Reportes',                  ruta: '/reportes',    seccion: 'principal' }] : []),
    ...(puedePostventa  ? [{ icon: '🔧', label: 'Post Venta',                ruta: '/post-venta',  seccion: 'principal' }] : []),
    ...(puedeVisitar    ? [{ icon: '🔍', label: 'Visita de obra',             ruta: '/visita-obra', seccion: 'principal' }] : []),
    ...(puedeOG      ? [{ icon: '📐', label: 'Revisión OG',     ruta: '/revision-og', seccion: 'principal' }] : []),
    
    ...(rol === 'administrador' ? [{ icon: '👥', label: 'Administración', ruta: '/admin', seccion: 'admin' }] : []),
  ];

  return (
    <IonMenu menuId="menu-lateral" contentId="main-content" swipeGesture={true} style={{ '--width': '75%', '--background': bgMenu }}>
      <IonContent style={{ '--background': bgMenu }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Header */}
          <div style={{
            padding: '44px 20px 20px',
            borderBottom: `0.5px solid ${borderColor}`,
            background: esJcaballero
              ? 'linear-gradient(180deg, #1a0014 0%, #0d0008 100%)'
              : 'linear-gradient(180deg, #0a0a0a 0%, #000 100%)',
          }}>
            <div style={{ marginBottom: 20, position: 'relative' }}>
              <img src="/logo-vain-blanco.png" style={{ height: 120, objectFit: 'contain', display: 'block', filter: esJcaballero ? 'hue-rotate(300deg) saturate(0.3) brightness(1.2)' : 'none' }} alt="VAIN" />
              <div style={{ position: 'absolute', top: 0, right: 0, fontSize: 20, color: esJcaballero ? '#6d0040' : '#2a2a2a', letterSpacing: '1.5px', fontFamily: 'monospace' }}>&lt;FMS&gt;</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: avatarBg, border: `0.5px solid ${avatarBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: avatarColor, flexShrink: 0 }}>
                {iniciales(usuario?.nombre ?? '')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {usuario?.nombre}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: esJcaballero ? '#6d0040' : '#444', textTransform: 'capitalize' }}>
                      {usuario?.rol?.replace('_', ' ')}
                    </span>
                    {lc && <div style={{ width: 7, height: 7, borderRadius: '50%', background: lc.color, flexShrink: 0 }} />}
                  </div>
                </div>
                {esJcaballero && (
                  <img src="/gato.png" style={{ height: 40, width: 40, objectFit: 'contain', filter: 'brightness(10) invert(1)', flexShrink: 0 }} />
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div style={{ flex: 1, paddingTop: 8 }}>
            <div style={{ fontSize: 9, color: esJcaballero ? '#3d0030' : '#333', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, padding: '8px 20px 4px' }}>
              principal
            </div>

            {menuItems.filter(i => i.seccion === 'principal').map(item => {
              const activo = history.location.pathname === item.ruta;
              return (
                <div key={item.ruta} onClick={() => navegar(item.ruta)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', fontSize: 14, cursor: 'pointer', borderLeft: activo ? `2px solid ${accentColor}` : '2px solid transparent', background: activo ? accentBg : 'transparent', color: activo ? accentText : (esJcaballero ? '#6d0040' : '#555') }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  {item.label}
                  {item.label === 'Registrar Observaciones' && pendientes > 0 && (
                    <span style={{ marginLeft: 'auto', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 10, padding: '2px 7px', borderRadius: 20, border: '0.5px solid rgba(251,191,36,0.2)' }}>
                      {pendientes} en cola
                    </span>
                  )}
                </div>
              );
            })}

            {rol === 'administrador' && (
              <>
                <div style={{ height: '0.5px', background: borderColor, margin: '8px 20px' }} />
                <div style={{ fontSize: 9, color: esJcaballero ? '#3d0030' : '#333', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, padding: '8px 20px 4px' }}>
                  administración
                </div>
                {menuItems.filter(i => i.seccion === 'admin').map(item => (
                  <div key={item.ruta} onClick={() => navegar(item.ruta)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', fontSize: 14, cursor: 'pointer', borderLeft: '2px solid transparent', color: esJcaballero ? '#6d0040' : '#555' }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    {item.label}
                  </div>
                ))}
              </>
            )}

            <div style={{ height: '0.5px', background: borderColor, margin: '8px 20px' }} />
            <div style={{ fontSize: 9, color: esJcaballero ? '#3d0030' : '#333', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, padding: '8px 20px 4px' }}>
              conexión
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', color: esJcaballero ? '#6d0040' : '#555', fontSize: 14 }}>
              <span style={{ fontSize: 18 }}>{online ? '📶' : '📵'}</span>
              {online ? 'En línea' : 'Sin conexión'}
              {pendientes > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '0.5px solid rgba(251,191,36,0.2)' }}>
                  {pendientes} en cola
                </span>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 20px', borderTop: `0.5px solid ${borderColor}` }}>
            <div onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', color: esJcaballero ? '#6d0040' : '#555', fontSize: 14, cursor: 'pointer' }}>
              <span style={{ fontSize: 18 }}>{dark ? '☀️' : '🌙'}</span>
              {dark ? 'Modo claro' : 'Modo oscuro'}
            </div>
            <div onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', color: '#f87171', fontSize: 14, cursor: 'pointer' }}>
              <span style={{ fontSize: 18 }}>🚪</span>
              Cerrar sesión
            </div>
            <div style={{ fontSize: 11, color: esJcaballero ? '#3d0030' : '#2a2a2a', marginTop: 8 }}>Versión 1.0.0 FMS</div>
          </div>
        </div>
      </IonContent>
    </IonMenu>
  );
};

export default MenuLateral;

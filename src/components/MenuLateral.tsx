import React, { useState } from 'react';
import { IonMenu, IonContent } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { useOffline } from '../Context/OfflineContext';
import { usePermiso } from '../Context/usePermiso';
import { lineaConfig } from '../utils/lineas';
import {
  Home,
  Building2,
  FileText,
  CheckSquare2,
  TrendingUp,
  Search,
  Ruler,
  BarChart3,
  Grid3x3,
  Users,
  Wifi,
  WifiOff,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  ChevronRight,
  Hammer,
  Layers,
  Paintbrush,
  ClipboardList,
  Bell,
} from 'lucide-react';

interface Props { usuario: any; }

const EMAILS_CERAMICOS = ['jcaballero@vain.cl', 'cgarces@vain.cl', 'fmsmarth@gmail.com'];

// ========================================================================
// Tipos para categorías colapsables
// ========================================================================
interface MenuItem {
  icon: any;
  label: string;
  ruta: string;
  permiso: boolean;
  badge?: { text: string };
}

interface MenuCategory {
  id: string;
  title: string;
  icon: any;
  items: MenuItem[];
  disabled?: boolean;
}

const MenuLateral: React.FC<Props> = ({ usuario }) => {
  const history = useHistory();
  const { theme, toggleTheme } = useTheme();
  const { online, pendientes } = useOffline();

  // Estado de categorías abiertas/cerradas
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const toggleCat = (id: string) => {
    setOpenCats(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Condición especial para jcaballero@vain.cl
  const esJcaballero = usuario?.email === 'jcaballero@vain.cl';

  // Fondo siempre negro, colores variables según usuario
  const bgMenu = '#000000';
  const borderColor = esJcaballero ? '#2d0020' : '#1a1a1a';
  const accentColor = esJcaballero ? '#ff69b4' : '#4c86e6';
  const accentBg = esJcaballero ? 'rgba(255,105,180,0.14)' : 'rgba(76,134,230,0.14)';
  const accentText = esJcaballero ? '#ff9fd4' : '#4c86e6';
  const avatarBg = esJcaballero ? 'linear-gradient(135deg, #3d0030, #6d0050)' : '#2c4a80';
  const avatarBorder = esJcaballero ? '#6d0040' : '#2a2a2a';
  const avatarColor = esJcaballero ? '#ff9fd4' : '#ffffff';
  const textColor = '#f2f3f5';
  const textSecondaryColor = esJcaballero ? '#ff9fd4' : '#a9adb3';
  const textMutedColor = esJcaballero ? '#3d0030' : '#75797f';
  const catHeaderColor = esJcaballero ? '#ff9fd4' : '#c8ccd2';

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
  const esRolBodega = ['ayudante_bodega', 'jefe_bodega'].includes(rol ?? '');

  // ========================================================================
  // PERMISOS DINÁMICOS
  // ========================================================================
  const { tienePermiso, cargando: permisoCargando } = usePermiso();

  const puedeRegistrar = tienePermiso('inspeccion_crear');
  const puedeRevisar = tienePermiso('revision_ver');
  const puedeReportes = tienePermiso('reportes_ver');
  const puedeVisitar = tienePermiso('visita_ver');
  const puedePostventa = tienePermiso('postventa_ver');
  const puedePreEntrega = tienePermiso('preentrega_ver');
  const puedeOG = tienePermiso('og_ver');
  const puedeGenerarVale = tienePermiso('bodega_ver');
  const puedeAprobarBodega = tienePermiso('bodega_aprobar');
  const puedeVerStock = tienePermiso('bodega_ver');
  const puedeCeramicos = EMAILS_CERAMICOS.includes(usuario?.email ?? '');
  const puedeAdmin = tienePermiso('admin_permisos');

  if (permisoCargando) {
    return (
      <IonMenu menuId="menu-lateral" contentId="main-content" swipeGesture={true} style={{ '--width': '75%', '--background': bgMenu }}>
        <IonContent style={{ '--background': bgMenu, textAlign: 'center', paddingTop: '2rem', color: '#666' }}>
          Cargando permisos...
        </IonContent>
      </IonMenu>
    );
  }

  // ========================================================================
  // CATEGORÍAS COLAPSABLES
  // ========================================================================
  const categorias: MenuCategory[] = [
    {
      id: 'obra-gruesa',
      title: 'Obra Gruesa',
      icon: Hammer,
      items: [
        { icon: Ruler, label: 'Revisión OG', ruta: '/revision-og', permiso: puedeOG },
        { icon: BarChart3, label: 'Reporte OG', ruta: '/reporte-og', permiso: puedeOG },
      ],
    },
    {
      id: 'terminaciones-gruesas',
      title: 'Terminaciones Gruesas',
      icon: Layers,
      items: [],
      disabled: true,
    },
    {
      id: 'terminaciones-finas',
      title: 'Terminaciones Finas',
      icon: Paintbrush,
      items: [
        { icon: FileText, label: 'Registrar Observaciones', ruta: '/inspeccion', permiso: puedeRegistrar, badge: pendientes > 0 ? { text: `${pendientes} en cola` } : undefined },
        { icon: CheckSquare2, label: 'Revisión de Observaciones', ruta: '/revision', permiso: puedeRevisar },
        { icon: TrendingUp, label: 'Reportes Terminaciones', ruta: '/reportes', permiso: puedeReportes },
      ],
    },
    {
      id: 'pre-entrega-pv',
      title: 'Pre Entrega y Post Venta',
      icon: ClipboardList,
      items: [
        { icon: Home, label: 'Pre-Entrega y Post Venta', ruta: '/pre-entrega', permiso: puedePreEntrega },
      ],
    },
  ];

  // Solo mostrar categorías con al menos 1 item permitido (o disabled/placeholder)
  const categoriasVisibles = categorias.filter(cat =>
    cat.disabled || cat.items.some(item => item.permiso)
  );

  // Ítems sueltos (fuera de categorías)
  const itemsSueltos: MenuItem[] = [];
  itemsSueltos.push({ icon: Home, label: 'Inicio', ruta: '/dashboard', permiso: true });
  if (!esRolBodega) itemsSueltos.push({ icon: Building2, label: 'Proyectos', ruta: '/proyectos', permiso: true });
  if (puedeVisitar) itemsSueltos.push({ icon: Search, label: 'Visita de obra', ruta: '/visita-obra', permiso: true });

  // Bodega
  const itemsBodega: MenuItem[] = [];
  if (puedeGenerarVale) itemsBodega.push({ icon: FileText, label: 'Generar Vale', ruta: '/bodega/generar-vale', permiso: true });
  if (puedeAprobarBodega) itemsBodega.push({ icon: CheckSquare2, label: 'Vales de bodega', ruta: '/bodega/aprobacion', permiso: true });
  if (puedeVerStock) itemsBodega.push({ icon: BarChart3, label: 'Stock de bodega', ruta: '/bodega/stock', permiso: true });

  // Cerámicos
  const itemsCeramicos: MenuItem[] = [];
  if (puedeCeramicos) itemsCeramicos.push({ icon: Grid3x3, label: 'Levantamiento Cerámicos', ruta: '/levantamiento-ceramicos', permiso: true });

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================

  const renderItem = (item: MenuItem) => {
    const activo = history.location.pathname === item.ruta;
    const Icon = item.icon;
    const iconColor = activo ? accentText : textSecondaryColor;
    const labelColor = activo ? accentText : textSecondaryColor;
    const labelWeight = activo ? 700 : 400;

    return (
      <div
        key={item.ruta}
        onClick={() => navegar(item.ruta)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '13px 20px', fontSize: 14, cursor: 'pointer',
          borderLeft: activo ? `2px solid ${accentColor}` : '2px solid transparent',
          background: activo ? accentBg : 'transparent',
          color: labelColor, fontWeight: labelWeight,
        }}
      >
        <Icon width={19} height={19} stroke={iconColor} strokeWidth={1.8} style={{ flex: 'none' }} />
        {item.label}
        {item.badge && (
          <span style={{
            marginLeft: 'auto', background: 'rgba(251,191,36,0.1)',
            color: '#fbbf24', fontSize: 10, padding: '2px 7px',
            borderRadius: 20, border: '0.5px solid rgba(251,191,36,0.2)',
          }}>
            {item.badge.text}
          </span>
        )}
      </div>
    );
  };

  /** Item con padding extra (dentro de categoría colapsable) */
  const renderSubItem = (item: MenuItem) => {
    const activo = history.location.pathname === item.ruta;
    const Icon = item.icon;
    const iconColor = activo ? accentText : textMutedColor;
    const labelColor = activo ? accentText : textSecondaryColor;
    const labelWeight = activo ? 700 : 400;

    return (
      <div
        key={item.ruta}
        onClick={() => navegar(item.ruta)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '11px 20px 11px 48px', fontSize: 13, cursor: 'pointer',
          borderLeft: activo ? `2px solid ${accentColor}` : '2px solid transparent',
          background: activo ? accentBg : 'transparent',
          color: labelColor, fontWeight: labelWeight,
        }}
      >
        <Icon width={16} height={16} stroke={iconColor} strokeWidth={1.8} style={{ flex: 'none' }} />
        {item.label}
        {item.badge && (
          <span style={{
            marginLeft: 'auto', background: 'rgba(251,191,36,0.1)',
            color: '#fbbf24', fontSize: 10, padding: '2px 7px',
            borderRadius: 20, border: '0.5px solid rgba(251,191,36,0.2)',
          }}>
            {item.badge.text}
          </span>
        )}
      </div>
    );
  };

  const renderCategoryHeader = (cat: MenuCategory) => {
    const isOpen = openCats[cat.id] ?? false;
    const CatIcon = cat.icon;
    const visibleItems = cat.items.filter(i => i.permiso);

    return (
      <div key={cat.id}>
        <div
          onClick={() => !cat.disabled && toggleCat(cat.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 20px', fontSize: 14, fontWeight: 600,
            cursor: cat.disabled ? 'default' : 'pointer',
            color: cat.disabled ? textMutedColor : catHeaderColor,
            opacity: cat.disabled ? 0.5 : 1,
            userSelect: 'none',
          }}
        >
          <CatIcon
            width={19} height={19}
            stroke={cat.disabled ? textMutedColor : accentColor}
            strokeWidth={1.8}
            style={{ flex: 'none' }}
          />
          <span style={{ flex: 1 }}>{cat.title}</span>

          {cat.disabled ? (
            <span style={{
              fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px',
              background: esJcaballero ? 'rgba(255,105,180,0.12)' : 'rgba(255,255,255,0.06)',
              color: textMutedColor, padding: '2px 6px', borderRadius: 4,
            }}>
              No disponible
            </span>
          ) : (
            <>
              {visibleItems.length > 0 && (
                <span style={{ fontSize: 11, color: textMutedColor, marginRight: 4 }}>
                  {visibleItems.length}
                </span>
              )}
              {isOpen
                ? <ChevronDown width={16} height={16} stroke={textMutedColor} strokeWidth={2} style={{ flex: 'none' }} />
                : <ChevronRight width={16} height={16} stroke={textMutedColor} strokeWidth={2} style={{ flex: 'none' }} />
              }
            </>
          )}
        </div>

        {/* Sub-items colapsables */}
        {isOpen && !cat.disabled && (
          <div style={{
            borderLeft: `1px solid ${esJcaballero ? 'rgba(255,105,180,0.15)' : 'rgba(76,134,230,0.15)'}`,
            marginLeft: 30,
          }}>
            {visibleItems.map(item => renderSubItem(item))}
          </div>
        )}
      </div>
    );
  };

  const renderSectionLabel = (label: string) => (
    <div style={{
      fontSize: 9, color: esJcaballero ? '#3d0030' : '#333',
      textTransform: 'uppercase', letterSpacing: '1.5px',
      fontWeight: 600, padding: '8px 20px 4px',
    }}>
      {label}
    </div>
  );

  const renderDivider = () => (
    <div style={{ height: '0.5px', background: borderColor, margin: '8px 20px' }} />
  );

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <IonMenu menuId="menu-lateral" contentId="main-content" swipeGesture={true} style={{ '--width': '75%', '--background': bgMenu }}>
      <IonContent style={{ '--background': bgMenu }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* ── Header ── */}
          <div style={{
            padding: '44px 20px 20px',
            borderBottom: `0.5px solid ${borderColor}`,
            background: '#000000',
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {usuario?.nombre}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: textSecondaryColor, textTransform: 'capitalize' }}>
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

          {/* ── Contenido del menú ── */}
          <div style={{ flex: 1, paddingTop: 8, overflowY: 'auto' }}>

            {/* Ítems sueltos (Inicio, Proyectos, Visita) */}
            {renderSectionLabel('principal')}
            {itemsSueltos.map(item => renderItem(item))}

            {/* Separador antes de categorías */}
            {renderDivider()}

            {/* Categorías colapsables */}
            {renderSectionLabel('Fases')}
            {categoriasVisibles.map(cat => renderCategoryHeader(cat))}

            {/* Bodega (si tiene permisos) */}
            {itemsBodega.length > 0 && (
              <>
                {renderDivider()}
                {renderSectionLabel('bodega')}
                {itemsBodega.map(item => renderItem(item))}
              </>
            )}

            {/* Cerámicos (si tiene permiso) */}
            {itemsCeramicos.length > 0 && (
              <>
                {renderDivider()}
                {renderSectionLabel('especial')}
                {itemsCeramicos.map(item => renderItem(item))}
              </>
            )}

            {/* Admin */}
            {puedeAdmin && (
              <>
                {renderDivider()}
                {renderSectionLabel('administración')}
                <div
                  onClick={() => navegar('/admin')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '13px 20px', fontSize: 14, cursor: 'pointer',
                    borderLeft: '2px solid transparent', color: textSecondaryColor,
                  }}
                >
                  <Users width={19} height={19} stroke={textSecondaryColor} strokeWidth={1.8} style={{ flex: 'none' }} />
                  Administración
                </div>
              </>
            )}

            {/* Admin Notificaciones (solo para jcaballero) */}
            {(usuario?.email === 'fmsmarth@gmail.com' || puedeAdmin) && (
              <>
                {renderDivider()}
                {renderSectionLabel('notificaciones')}
                <div
                  onClick={() => navegar('/admin-notificaciones')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '13px 20px', fontSize: 14, cursor: 'pointer',
                    borderLeft: '2px solid transparent', color: textSecondaryColor,
                  }}
                >
                  <Bell width={19} height={19} stroke={accentColor} strokeWidth={1.8} style={{ flex: 'none' }} />
                  <span style={{ color: accentColor }}>Notificaciones</span>
                </div>
              </>
            )}

            {/* Conexión */}
            {renderDivider()}
            {renderSectionLabel('conexión')}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', color: textColor, fontSize: 14 }}>
              {online
                ? <Wifi width={19} height={19} stroke="#3fa64c" strokeWidth={1.8} style={{ flex: 'none' }} />
                : <WifiOff width={19} height={19} stroke={textMutedColor} strokeWidth={1.8} style={{ flex: 'none' }} />
              }
              {online ? 'En línea' : 'Sin conexión'}
              {pendientes > 0 && (
                <span style={{
                  marginLeft: 'auto', fontSize: 10, padding: '2px 7px',
                  borderRadius: 20, background: 'rgba(251,191,36,0.1)',
                  color: '#fbbf24', border: '0.5px solid rgba(251,191,36,0.2)',
                }}>
                  {pendientes} en cola
                </span>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ padding: '16px 20px', borderTop: `0.5px solid ${borderColor}` }}>
            <div onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', color: textSecondaryColor, fontSize: 14, cursor: 'pointer' }}>
              {theme === 'dark' ? <Sun width={18} height={18} stroke={textSecondaryColor} strokeWidth={1.8} /> : <Moon width={18} height={18} stroke={textSecondaryColor} strokeWidth={1.8} />}
              {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            </div>
            <div onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', color: '#f87171', fontSize: 14, cursor: 'pointer' }}>
              <LogOut width={18} height={18} stroke="#f87171" strokeWidth={1.8} />
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
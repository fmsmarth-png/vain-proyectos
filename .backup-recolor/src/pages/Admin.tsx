import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonSpinner, IonModal, IonAlert, IonMenuButton,
  useIonRouter,
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useTheme } from '../Context/ThemeContext';
import { lineaConfig, lineas } from '../utils/lineas';

// Etiquetas conocidas de roles. Los roles nuevos (creados desde la app)
// caen al helper labelRol y muestran su descripcion o el codigo prettificado.
const ROLES_LABELS: Record<string, string> = {
  jefe_terreno:          'Jefe de Terreno',
  prof_terminaciones:    'Prof. Terminaciones',
  prof_obra_gruesa:      'Prof. Obra Gruesa',
  director_obra:         'Director de Obra',
  administrador:         'Administrador',
  vendedor_inmobiliaria: 'Vendedor Inmobiliaria',
  staff:                 'Staff',
  ayudante_bodega:       'Ayudante de Bodega',
  jefe_bodega:           'Jefe de Bodega',
};
const prettify = (s: string) => (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const labelRol = (nombre?: string, descripcion?: string) => {
  if (!nombre) return '';
  if (ROLES_LABELS[nombre]) return ROLES_LABELS[nombre];
  if (descripcion && descripcion.trim()) return descripcion.trim();
  return prettify(nombre);
};

// Orden y etiquetas de modulos para las pantallas de permisos (usuario y rol)
const MODULOS_ORDEN = ['proyectos', 'inspeccion', 'revision', 'reportes', 'postventa', 'preentrega', 'visita', 'og', 'bodega', 'zc', 'admin'];
const MODULO_LABEL: Record<string, string> = {
  proyectos:  'Proyectos',
  inspeccion: 'Registrar Observaciones',
  revision:   'Revisión Observaciones',
  reportes:   'Reportes',
  postventa:  'Post Venta',
  preentrega: 'Acta Pre Entrega',
  visita:     'Visita de Obra',
  og:         'Revisión OG',
  bodega:     'Bodega',
  zc:         'Zonas Comunes',
  admin:      'Administración',
};

const TIPOS_CAUSA = [
  { value: 'estandar',       label: 'Causa Estándar' },
  { value: 'tercero',        label: 'Otras Cuadrillas' },
  { value: 'nombre_tercero', label: 'Nombre Tercero' },
];

// ─── Hook estadísticas usuario ────────────────────────────────────────────────
const useStatsUsuario = (usuarioId: string | null) => {
  const [stats, setStats]       = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  
  useEffect(() => {
    if (!usuarioId) { setStats(null); return; }
    const cargar = async () => {
      setCargando(true);
      try {
        const { data: regs } = await supabase
          .from('registros')
          .select('id, departamento_id, partida_id, partidas(nombre)')
          .eq('creado_por', usuarioId);

        const total        = regs?.length ?? 0;
        const deptosUnicos = new Set(regs?.map(r => r.departamento_id) ?? []).size;

        const conteoPartidas: Record<string, { nombre: string; count: number }> = {};
        (regs ?? []).forEach(r => {
          if (!r.partida_id) return;
          const nombre = Array.isArray(r.partidas) ? r.partidas[0]?.nombre : (r.partidas as any)?.nombre ?? r.partida_id;
          if (!conteoPartidas[r.partida_id]) conteoPartidas[r.partida_id] = { nombre, count: 0 };
          conteoPartidas[r.partida_id].count++;
        });
        const partidaTop = Object.values(conteoPartidas).sort((a, b) => b.count - a.count)[0] ?? null;
        setStats({ total, deptosUnicos, partidaTop });
      } catch {}
      setCargando(false);
    };
    cargar();
  }, [usuarioId]);

  return { stats, cargando };
};

// ─── ModalPerfil ─────────────────────────────────────────────────────────────
interface ModalPerfilProps {
  usuario: any; isOpen: boolean; onClose: () => void;
  dark: boolean; card: string; border: string;
  textPrimary: string; textSecondary: string; textMuted: string;
}

const ModalPerfil: React.FC<ModalPerfilProps> = ({
  usuario, isOpen, onClose, dark, card, border, textPrimary, textSecondary, textMuted
}) => {
  const { stats, cargando } = useStatsUsuario(isOpen ? usuario?.id : null);
  const lc = usuario?.linea ? lineaConfig[usuario.linea] : null;
  const iniciales = (nombre: string) =>
    nombre?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() ?? 'U';

  const StatCard = ({ icon, valor, label, color }: { icon: string; valor: any; label: string; color?: string }) => (
    <div style={{ flex: 1, background: dark ? '#111' : '#f8fafc', borderRadius: 14, padding: '14px 10px', textAlign: 'center', border: `0.5px solid ${border}` }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? textPrimary, lineHeight: 1 }}>
        {cargando ? <IonSpinner name="crescent" style={{ width: 20, height: 20 }} /> : valor}
      </div>
      <div style={{ fontSize: 10, color: textMuted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</div>
    </div>
  );

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.75} breakpoints={[0, 0.75, 1]}>
      <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: dark ? '#666' : '#fff' }}>
            {iniciales(usuario?.nombre ?? '')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary }}>{usuario?.nombre}</div>
            <div style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>{usuario?.email}</div>
            {usuario?.rut && <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>RUT: {usuario.rut}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600, background: dark ? 'rgba(96,165,250,0.1)' : '#eff6ff', color: dark ? '#60a5fa' : '#1d4ed8', border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe' }}>
                {labelRol(usuario?.rol)}
              </span>
              {lc && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: lc.color }} />
                  <span style={{ fontSize: 10, color: lc.color, fontWeight: 600 }}>{lc.label}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Actividad histórica</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <StatCard icon="📋" valor={stats?.total ?? '—'} label="Obs registradas" color={dark ? '#60a5fa' : '#2563eb'} />
          <StatCard icon="🏠" valor={stats?.deptosUnicos ?? '—'} label="Deptos inspeccionados" color={dark ? '#4ade80' : '#15803d'} />
        </div>

        <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Partida más observada</div>
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 20 }}><IonSpinner name="crescent" /></div>
        ) : stats?.partidaTop ? (
          <div style={{ background: dark ? '#111' : '#f8fafc', borderRadius: 14, padding: '14px 16px', border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: dark ? 'rgba(251,191,36,0.08)' : '#fffbeb', border: dark ? '0.5px solid rgba(251,191,36,0.2)' : '0.5px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔧</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>{stats.partidaTop.nombre}</div>
              <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>{stats.partidaTop.count} observación{stats.partidaTop.count > 1 ? 'es' : ''} registrada{stats.partidaTop.count > 1 ? 's' : ''}</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: dark ? '#fbbf24' : '#a16207' }}>{stats.partidaTop.count}</div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: textMuted, fontSize: 13, padding: '12px 0 20px' }}>Sin observaciones registradas aún</div>
        )}

        <button onClick={onClose} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>Cerrar</button>
      </div>
    </IonModal>
  );
};

// ─── Admin principal ──────────────────────────────────────────────────────────
const Admin: React.FC = () => {
  const { theme } = useTheme();
  const router = useIonRouter();
  const dark = theme === 'dark';

  const bg            = dark ? '#000000' : '#f0f4f8';
  const card          = dark ? '#0e0e0e'  : '#ffffff';
  const cardAlt       = dark ? '#111111'  : '#f8fafc';
  const border        = dark ? '#1e1e1e'  : '#e2e8f0';
  const textPrimary   = dark ? '#f9fafb' : '#0f172a';
  const textSecondary = dark ? '#6b7280' : '#64748b';
  const textMuted     = dark ? '#444444' : '#94a3b8';
  const toolbar       = dark ? '#000000' : '#1e3a5f';
  const inputBg       = dark ? '#111111' : '#ffffff';
  const inputBorder   = dark ? '#1e1e1e' : '#cbd5e1';
  const sepLine       = dark ? 'linear-gradient(90deg, transparent, #1e1e1e, transparent)' : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';

  const [seccion, setSeccion] = useState<'usuarios' | 'ambientes' | 'partidas' | 'causas' | 'proyectos' | 'ambientes_zc' | 'bancos' | 'permisos' | 'roles'>('usuarios');
  const [usuarios, setUsuarios]       = useState<any[]>([]);
  const [pendientes, setPendientes]   = useState<any[]>([]);
  const [proyectos, setProyectos]     = useState<any[]>([]);
  const [ambientes, setAmbientes]     = useState<any[]>([]);
  const [partidas, setPartidas]       = useState<any[]>([]);
  const [causas, setCausas]           = useState<any[]>([]);
  const [ambientesZC, setAmbientesZC] = useState<any[]>([]);
  const [bancos, setBancos]           = useState<any[]>([]);
  const [todosLosPermisosList, setTodosLosPermisosList] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [guardando, setGuardando]     = useState(false);
  const [error, setError]             = useState('');

  const [filtroLineaUsuarios, setFiltroLineaUsuarios]   = useState('');
  const [filtroLineaProyectos, setFiltroLineaProyectos] = useState('');

  const [modalUsuario, setModalUsuario]       = useState(false);
  const [modalAsignar, setModalAsignar]       = useState(false);
  const [modalAmbiente, setModalAmbiente]     = useState(false);
  const [modalPartida, setModalPartida]       = useState(false);
  const [modalCausa, setModalCausa]           = useState(false);
  const [modalAmbienteZC, setModalAmbienteZC] = useState(false);
  const [modalPerfil, setModalPerfil]         = useState(false);
  const [modalActa, setModalActa]             = useState(false);
  const [modalBanco, setModalBanco]           = useState(false);
  const [usuarioPerfil, setUsuarioPerfil]     = useState<any>(null);
  const [proyectoActa, setProyectoActa]       = useState<any>(null);

  const [nuevoEmail, setNuevoEmail]           = useState('');
  const [nuevoNombre, setNuevoNombre]         = useState('');
  const [nuevoPassword, setNuevoPassword]     = useState('');
  const [nuevoRol, setNuevoRol]               = useState('jefe_terreno');
  const [nuevoLinea, setNuevoLinea]           = useState('');
  const [nuevoRut, setNuevoRut]               = useState('');
  const [nuevoAmbiente, setNuevoAmbiente]     = useState('');
  const [nuevoPartida, setNuevoPartida]       = useState('');
  const [nuevaCausa, setNuevaCausa]           = useState('');
  const [nuevaCausaTipo, setNuevaCausaTipo]   = useState('estandar');
  const [nuevoAmbienteZC, setNuevoAmbienteZC]                   = useState('');
  const [nuevoAmbienteZCSoloPiso1, setNuevoAmbienteZCSoloPiso1] = useState(false);
  const [nuevoBanco, setNuevoBanco]           = useState('');

  const [actaForm, setActaForm] = useState({
    acta_nombre_inmobiliaria: '',
    acta_direccion: '',
    acta_ciudad: '',
    acta_telefono: '',
    acta_email: '',
    acta_nombre_legal: '',
    acta_logo_url: '',
  });
  const [actaLogoPreview, setActaLogoPreview] = useState('');

  const [usuarioSel, setUsuarioSel]               = useState<any>(null);
  const [proyectosSel, setProyectosSel]           = useState<string[]>([]);
  const [proyectoPrincipal, setProyectoPrincipal] = useState<string>('');

  const [alertEliminar, setAlertEliminar]     = useState(false);
  const [itemEliminar, setItemEliminar]       = useState<any>(null);
  const [tipoEliminar, setTipoEliminar]       = useState('');
  const [alertRechazar, setAlertRechazar]     = useState(false);
  const [usuarioRechazar, setUsuarioRechazar] = useState<any>(null);

  // Permisos por usuario (rol + overrides individuales grant/revoke)
  const [modalPermisos, setModalPermisos] = useState(false);
  const [usuarioPermisos, setUsuarioPermisos] = useState<any>(null);
  const [permisosRolUsuario, setPermisosRolUsuario] = useState<string[]>([]);         // permisos que otorga el rol
  const [overridesUsuario, setOverridesUsuario] = useState<Record<string, boolean>>({}); // true=otorgado, false=revocado

  // Roles: crear + permisos por defecto
  const [rolesDB, setRolesDB]                   = useState<any[]>([]);
  const [modalRol, setModalRol]                 = useState(false);
  const [nuevoRolNombre, setNuevoRolNombre]     = useState('');
  const [modalPermisosRol, setModalPermisosRol] = useState(false);
  const [rolSel, setRolSel]                     = useState<any>(null);
  const [permisosRolSel, setPermisosRolSel]     = useState<string[]>([]);

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setLoading(true);
    const [u, p, a, pa, pend, c, azc, b, perms, rls] = await Promise.all([
      supabase.from('usuarios').select('*, usuario_proyectos(proyecto_id, es_principal)').eq('estado', 'activo').order('nombre'),
      supabase.from('proyectos').select('*').order('nombre'),
      supabase.from('ambientes').select('*').order('nombre'),
      supabase.from('partidas').select('*').order('nombre'),
      supabase.from('usuarios').select('*').eq('estado', 'pendiente').order('nombre'),
      supabase.from('causas').select('*').order('tipo').order('nombre'),
      supabase.from('ambientes_zc').select('*').order('orden'),
      supabase.from('bancos').select('*').order('orden'),
      supabase.from('permisos').select('*').order('modulo, nombre'),
      supabase.from('roles').select('*').order('nombre'),
    ]);
    setUsuarios(u.data ?? []);
    setProyectos(p.data ?? []);
    setAmbientes(a.data ?? []);
    setPartidas(pa.data ?? []);
    setPendientes(pend.data ?? []);
    setCausas(c.data ?? []);
    setAmbientesZC(azc.data ?? []);
    setBancos(b.data ?? []);
    setTodosLosPermisosList(perms.data ?? []);
    setRolesDB(rls.data ?? []);
    setLoading(false);
  };

  const crearUsuario = async () => {
    if (!nuevoEmail || !nuevoNombre || !nuevoPassword) { setError('Completa todos los campos'); return; }
    setGuardando(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('https://swjmqtnhdtiwopexbezx.supabase.co/functions/v1/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: nuevoEmail, password: nuevoPassword, nombre: nuevoNombre, rol: nuevoRol, linea: nuevoLinea || null, rut: nuevoRut || null }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'Error al crear usuario'); }
      else { 
        // Si la función no devolvió el RUT, actualizar manualmente
        if (nuevoRut && result.usuario_id) {
          await supabase.from('usuarios').update({ rut: nuevoRut }).eq('id', result.usuario_id);
        }
        setNuevoEmail(''); setNuevoNombre(''); setNuevoPassword(''); setNuevoRol('jefe_terreno'); setNuevoLinea(''); setNuevoRut(''); setModalUsuario(false); cargar(); 
      }
    } catch (e: any) { setError('Error de conexión: ' + e.message); }
    setGuardando(false);
  };

  const cambiarRutUsuario = async (usuario: any, nuevoRutValue: string) => {
    if (nuevoRutValue === (usuario.rut ?? '')) return;
    const { error } = await supabase.from('usuarios').update({ rut: nuevoRutValue }).eq('id', usuario.id);
    if (error) { setError('Error: ' + error.message); } else { cargar(); }
  };

  // Abre el modal de permisos de un usuario: carga los permisos por defecto de su
  // rol y los overrides individuales (concedido true/false).
  const abrirModalPermisos = async (usuario: any) => {
    setUsuarioPermisos(usuario);
    const { data: rolData } = await supabase.from('roles').select('id').eq('nombre', usuario.rol).maybeSingle();
    let defaults: string[] = [];
    if (rolData) {
      const { data: rp } = await supabase.from('rol_permisos').select('permiso_id').eq('rol_id', rolData.id);
      defaults = rp?.map(x => x.permiso_id) ?? [];
    }
    setPermisosRolUsuario(defaults);
    const { data: ov } = await supabase.from('usuario_permisos').select('permiso_id, concedido').eq('usuario_id', usuario.id);
    const map: Record<string, boolean> = {};
    (ov ?? []).forEach((o: any) => { map[o.permiso_id] = o.concedido !== false; });
    setOverridesUsuario(map);
    setModalPermisos(true);
  };

  // Estado efectivo de un permiso para el usuario abierto: override si existe, si no el default del rol.
  const estadoEfectivoUsuario = (permisoId: string) => {
    if (permisoId in overridesUsuario) return overridesUsuario[permisoId];
    return permisosRolUsuario.includes(permisoId);
  };

  const togglePermisoUsuario = async (permisoId: string) => {
    if (!usuarioPermisos) return;
    const esDefault = permisosRolUsuario.includes(permisoId);
    const deseado = !estadoEfectivoUsuario(permisoId);
    // Antes se descartaba el resultado de estas escrituras: si fallaban (red,
    // política RLS, etc.) el admin veía el toggle "volver" a su estado
    // anterior al refrescar, sin ninguna explicación de por qué no se guardó.
    let error;
    if (deseado === esDefault) {
      // Vuelve al comportamiento por defecto del rol -> se borra el override
      ({ error } = await supabase.from('usuario_permisos').delete()
        .eq('usuario_id', usuarioPermisos.id)
        .eq('permiso_id', permisoId));
    } else {
      // Override explícito: grant (deseado true, rol no lo da) o revoke (deseado false, rol sí lo da)
      ({ error } = await supabase.from('usuario_permisos').upsert(
        { usuario_id: usuarioPermisos.id, permiso_id: permisoId, concedido: deseado },
        { onConflict: 'usuario_id,permiso_id' },
      ));
    }
    if (error) setError('No se pudo guardar el permiso: ' + error.message);
    await abrirModalPermisos(usuarioPermisos);
  };

  // ---- Roles: crear + permisos por defecto ----
  const slugRol = (s: string) =>
    s.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const crearRol = async () => {
    const display = nuevoRolNombre.trim();
    if (!display) { setError('Escribe un nombre de rol'); return; }
    const codigo = slugRol(display);
    if (!codigo) { setError('Nombre de rol inválido'); return; }
    if (rolesDB.some(r => r.nombre === codigo)) { setError('Ya existe un rol con ese código: ' + codigo); return; }
    setGuardando(true); setError('');
    const { error } = await supabase.from('roles').insert({ nombre: codigo, descripcion: display, activo: true });
    if (error) { setError('Error: ' + error.message); setGuardando(false); return; }
    setNuevoRolNombre(''); setModalRol(false); setGuardando(false); cargar();
  };

  const toggleRolActivo = async (r: any) => {
    const { error } = await supabase.from('roles').update({ activo: !r.activo }).eq('id', r.id);
    if (error) { setError('Error: ' + error.message); return; }
    cargar();
  };

  const abrirPermisosRol = async (r: any) => {
    setRolSel(r);
    const { data } = await supabase.from('rol_permisos').select('permiso_id').eq('rol_id', r.id);
    setPermisosRolSel(data?.map(x => x.permiso_id) ?? []);
    setModalPermisosRol(true);
  };

  const togglePermisoRol = async (permisoId: string) => {
    if (!rolSel) return;
    const tiene = permisosRolSel.includes(permisoId);
    // Este permiso aplica a TODOS los usuarios con este rol: un fallo
    // silencioso aquí es más delicado que en el override individual de
    // arriba, por eso también avisamos si algo sale mal.
    let error;
    if (tiene) {
      ({ error } = await supabase.from('rol_permisos').delete().eq('rol_id', rolSel.id).eq('permiso_id', permisoId));
    } else {
      ({ error } = await supabase.from('rol_permisos').insert({ rol_id: rolSel.id, permiso_id: permisoId }));
    }
    if (error) setError('No se pudo guardar el permiso del rol: ' + error.message);
    const { data } = await supabase.from('rol_permisos').select('permiso_id').eq('rol_id', rolSel.id);
    setPermisosRolSel(data?.map(x => x.permiso_id) ?? []);
  };

  const eliminarUsuario = async (usuario: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('https://swjmqtnhdtiwopexbezx.supabase.co/functions/v1/eliminar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ usuario_id: usuario.id }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'Error al eliminar usuario'); }
      else { cargar(); }
    } catch (e: any) { setError('Error de conexión: ' + e.message); }
  };

  const aprobarUsuario  = async (u: any) => {
    const { error } = await supabase.from('usuarios').update({ estado: 'activo' }).eq('id', u.id);
    if (error) setError('No se pudo aprobar al usuario: ' + error.message);
    cargar();
  };
  const rechazarUsuario = async () => { if (!usuarioRechazar) return; await eliminarUsuario(usuarioRechazar); setUsuarioRechazar(null); };

  const cambiarRol = async (usuario: any, nuevoRol: string) => {
    const { error } = await supabase.from('usuarios').update({ rol: nuevoRol }).eq('id', usuario.id);
    if (error) { setError('Error al cambiar rol: ' + error.message); } else { cargar(); }
  };

  const cambiarLinea = async (usuario: any, linea: string) => {
    await supabase.from('usuarios').update({ linea: linea || null }).eq('id', usuario.id);
    cargar();
  };

  const togglePostventa = async (usuario: any) => {
    const nuevoValor = !usuario.puede_postventa;
    const { error } = await supabase
      .from('usuarios')
      .update({ puede_postventa: nuevoValor })
      .eq('id', usuario.id);
    if (error) { setError('Error: ' + error.message); return; }
    cargar();
  };

  const cambiarLineaProyecto = async (proyId: string, linea: string) => {
    await supabase.from('proyectos').update({ linea: linea || null }).eq('id', proyId);
    cargar();
  };

  const abrirActaProyecto = (p: any) => {
    setProyectoActa(p);
    setActaForm({
      acta_nombre_inmobiliaria: p.acta_nombre_inmobiliaria ?? '',
      acta_direccion: p.acta_direccion ?? '',
      acta_ciudad: p.acta_ciudad ?? '',
      acta_telefono: p.acta_telefono ?? '',
      acta_email: p.acta_email ?? '',
      acta_nombre_legal: p.acta_nombre_legal ?? '',
      acta_logo_url: p.acta_logo_url ?? '',
    });
    setActaLogoPreview(p.acta_logo_url ?? '');
    setModalActa(true);
  };

  const guardarActaProyecto = async () => {
    if (!proyectoActa) return;
    setGuardando(true); setError('');
    const { error } = await supabase.from('proyectos').update(actaForm).eq('id', proyectoActa.id);
    if (error) { setError('Error: ' + error.message); setGuardando(false); return; }
    setModalActa(false); setGuardando(false); cargar();
  };

  const subirLogoProyecto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    setGuardando(true); setError('');
    try {
      const nombreArchivo = `logos-proyecto/${proyectoActa.id}_${Date.now()}.png`;
      const { error: errUpload } = await supabase.storage
        .from('fotos-registros')
        .upload(nombreArchivo, file, { upsert: true });
      if (errUpload) { setError('Error al subir logo: ' + errUpload.message); setGuardando(false); return; }
      
      const { data } = supabase.storage.from('fotos-registros').getPublicUrl(nombreArchivo);
      const publicUrl = data?.publicUrl ?? '';
      setActaForm(prev => ({ ...prev, acta_logo_url: publicUrl }));
      setActaLogoPreview(publicUrl);
    } catch (err: any) { setError('Error: ' + err.message); }
    setGuardando(false);
  };

  const abrirAsignar = (usuario: any) => {
    setUsuarioSel(usuario);
    const asignaciones = usuario.usuario_proyectos ?? [];
    setProyectosSel(asignaciones.map((up: any) => up.proyecto_id));
    const principal = asignaciones.find((up: any) => up.es_principal);
    setProyectoPrincipal(principal?.proyecto_id ?? '');
    setModalAsignar(true);
  };

  const guardarAsignacion = async () => {
    if (proyectosSel.length > 0 && !proyectoPrincipal) { setError('Debes marcar un proyecto principal'); return; }
    setGuardando(true); setError('');
    // Este delete+insert reemplaza TODAS las asignaciones del usuario. Antes
    // no se revisaba ningún error: si el delete funcionaba pero el insert
    // fallaba después (ej. se corta la red a mitad de camino), el usuario
    // quedaba sin ningún proyecto asignado, sin aviso, y el modal se cerraba
    // igual como si hubiera funcionado.
    const { error: delError } = await supabase.from('usuario_proyectos').delete().eq('usuario_id', usuarioSel.id);
    if (delError) {
      setError('No se pudo actualizar la asignación: ' + delError.message);
      setGuardando(false);
      return;
    }
    if (proyectosSel.length > 0) {
      const { error: insError } = await supabase.from('usuario_proyectos').insert(proyectosSel.map(pid => ({ usuario_id: usuarioSel.id, proyecto_id: pid, es_principal: pid === proyectoPrincipal })));
      if (insError) {
        setError('Se borraron las asignaciones anteriores pero no se pudieron guardar las nuevas: ' + insError.message + '. Vuelve a intentar antes de cerrar.');
        setGuardando(false);
        return;
      }
    }
    setModalAsignar(false); cargar(); setGuardando(false);
  };

  const crearAmbiente = async () => {
    if (!nuevoAmbiente.trim()) { setError('Escribe un nombre'); return; }
    setGuardando(true); setError('');
    await supabase.from('ambientes').insert({ nombre: nuevoAmbiente.trim() });
    setNuevoAmbiente(''); setModalAmbiente(false); cargar(); setGuardando(false);
  };

  const crearPartida = async () => {
    if (!nuevoPartida.trim()) { setError('Escribe un nombre'); return; }
    setGuardando(true); setError('');
    await supabase.from('partidas').insert({ nombre: nuevoPartida.trim() });
    setNuevoPartida(''); setModalPartida(false); cargar(); setGuardando(false);
  };

  const crearCausa = async () => {
    if (!nuevaCausa.trim()) { setError('Escribe un nombre'); return; }
    setGuardando(true); setError('');
    const { error } = await supabase.from('causas').insert({ nombre: nuevaCausa.trim(), tipo: nuevaCausaTipo });
    if (error) { setError('Error: ' + error.message); }
    else { setNuevaCausa(''); setNuevaCausaTipo('estandar'); setModalCausa(false); cargar(); }
    setGuardando(false);
  };

  const crearAmbienteZC = async () => {
    if (!nuevoAmbienteZC.trim()) { setError('Escribe un nombre'); return; }
    setGuardando(true); setError('');
    const maxOrden = ambientesZC.reduce((m, a) => Math.max(m, a.orden ?? 0), 0);
    const { error } = await supabase.from('ambientes_zc').insert({
      nombre: nuevoAmbienteZC.trim(), solo_piso_1: nuevoAmbienteZCSoloPiso1, activo: true, orden: maxOrden + 1,
    });
    if (error) { setError('Error: ' + error.message); setGuardando(false); return; }
    setNuevoAmbienteZC(''); setNuevoAmbienteZCSoloPiso1(false); setModalAmbienteZC(false);
    setGuardando(false); setTimeout(() => cargar(), 300);
  };

  const toggleActivoZC = async (a: any) => {
    await supabase.from('ambientes_zc').update({ activo: !a.activo }).eq('id', a.id);
    cargar();
  };

  const crearBanco = async () => {
    if (!nuevoBanco.trim()) { setError('Escribe un nombre'); return; }
    setGuardando(true); setError('');
    const maxOrden = bancos.reduce((m, b) => Math.max(m, b.orden ?? 0), 0);
    const { error } = await supabase.from('bancos').insert({
      nombre: nuevoBanco.trim(), orden: maxOrden + 1, activo: true,
    });
    if (error) { setError('Error: ' + error.message); }
    else { setNuevoBanco(''); setModalBanco(false); cargar(); }
    setGuardando(false);
  };

  const toggleBancoActivo = async (b: any) => {
    const { error } = await supabase.from('bancos').update({ activo: !b.activo }).eq('id', b.id);
    if (error) { setError('Error: ' + error.message); return; }
    cargar();
  };

  const eliminar = async () => {
    setAlertEliminar(false);
    if (tipoEliminar === 'usuario')     { await eliminarUsuario(itemEliminar); return; }
    if (tipoEliminar === 'ambiente')    { const { error } = await supabase.from('ambientes').delete().eq('id', itemEliminar.id);    if (error) { setError('Error: ' + error.message); return; } }
    if (tipoEliminar === 'partida')     { const { error } = await supabase.from('partidas').delete().eq('id', itemEliminar.id);     if (error) { setError('Error: ' + error.message); return; } }
    if (tipoEliminar === 'causa')       { const { error } = await supabase.from('causas').delete().eq('id', itemEliminar.id);       if (error) { setError('Error: ' + error.message); return; } }
    if (tipoEliminar === 'ambiente_zc') { const { error } = await supabase.from('ambientes_zc').delete().eq('id', itemEliminar.id); if (error) { setError('Error: ' + error.message); return; } }
    if (tipoEliminar === 'banco')       { const { error } = await supabase.from('bancos').delete().eq('id', itemEliminar.id);       if (error) { setError('Error: ' + error.message); return; } }
    cargar();
  };

  const toggleProyecto = (pid: string) => {
    setProyectosSel(prev => {
      const nuevo = prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid];
      if (!nuevo.includes(proyectoPrincipal)) setProyectoPrincipal('');
      return nuevo;
    });
  };

  const tipoColor = (tipo: string) => tipo === 'estandar' ? '#60a5fa' : tipo === 'tercero' ? '#fbbf24' : '#a78bfa';

  const inputStyle = { width: '100%', height: 44, borderRadius: 10, padding: '0 12px', background: inputBg, border: `0.5px solid ${inputBorder}`, color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12 };
  const labelStyle = { fontSize: 9, color: textMuted, display: 'block', marginBottom: 6, textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600 };

  const usuariosFiltrados  = filtroLineaUsuarios  ? usuarios.filter(u => u.linea === filtroLineaUsuarios)   : usuarios;
  const proyectosFiltrados = filtroLineaProyectos ? proyectos.filter(p => p.linea === filtroLineaProyectos) : proyectos;

  // Modulos presentes en la tabla permisos, ordenados segun MODULOS_ORDEN
  const modulosPresentes = () => {
    const set = Array.from(new Set(todosLosPermisosList.map(p => p.modulo).filter(Boolean)));
    return set.sort((a, b) => {
      const ia = MODULOS_ORDEN.indexOf(a); const ib = MODULOS_ORDEN.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  };

  const LineaSelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }}>
      <option value="">Sin línea</option>
      {lineas.map(l => <option key={l} value={l}>{lineaConfig[l].label}</option>)}
    </select>
  );

  const FiltroBotones = ({ valor, onChange }: { valor: string; onChange: (v: string) => void }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
      <button onClick={() => onChange('')} style={{ height: 28, padding: '0 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: valor === '' ? (dark ? '#1a1a1a' : '#1e3a5f') : 'transparent', color: valor === '' ? '#fff' : textMuted, border: `0.5px solid ${valor === '' ? (dark ? '#2a2a2a' : '#1e3a5f') : border}` }}>Todas</button>
      {lineas.map(l => (
        <button key={l} onClick={() => onChange(l)} style={{ height: 28, padding: '0 10px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, background: valor === l ? lineaConfig[l].color + '20' : 'transparent', color: valor === l ? lineaConfig[l].color : textMuted, border: `0.5px solid ${valor === l ? lineaConfig[l].color + '60' : border}` }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: lineaConfig[l].color, flexShrink: 0 }} />
          {lineaConfig[l].label.replace('Línea ', '')}
        </button>
      ))}
    </div>
  );

  if (loading) return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' }} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Administración</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': bg }}>
        <div style={{ textAlign: 'center', marginTop: 100 }}><IonSpinner name="crescent" /></div>
      </IonContent>
    </IonPage>
  );

  return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonMenuButton slot="start" menu="menu-lateral" style={{ '--color': dark ? '#555' : 'rgba(255,255,255,0.7)' }} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Administración</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          {error && (
            <div style={{ background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: dark ? '#f87171' : '#b91c1c' }}>{error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: dark ? '#f87171' : '#b91c1c', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
          )}

          {/* Tabs fila 1 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {(['usuarios', 'ambientes', 'partidas'] as const).map(s => (
              <button key={s} onClick={() => setSeccion(s)} style={{ flex: 1, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: seccion === s ? (dark ? '#1a1a1a' : '#1e3a5f') : 'transparent', color: seccion === s ? '#fff' : textMuted, border: `0.5px solid ${seccion === s ? (dark ? '#2a2a2a' : '#1e3a5f') : border}` }}>
                {s === 'usuarios' ? `👥${pendientes.length > 0 ? ` (${pendientes.length})` : ''} Usuarios` : s === 'ambientes' ? '🚪 Ambientes' : '🔧 Partidas'}
              </button>
            ))}
          </div>

          {/* Tabs fila 2 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {(['causas', 'proyectos', 'ambientes_zc'] as const).map(s => (
              <button key={s} onClick={() => setSeccion(s)} style={{ flex: 1, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 600, background: seccion === s ? (dark ? '#1a1a1a' : '#1e3a5f') : 'transparent', color: seccion === s ? '#fff' : textMuted, border: `0.5px solid ${seccion === s ? (dark ? '#2a2a2a' : '#1e3a5f') : border}` }}>
                {s === 'causas' ? '⚠️ Causas' : s === 'proyectos' ? '🏗️ Proyectos' : '🏢 ZC'}
              </button>
            ))}
          </div>

          {/* Tabs fila 3 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {(['bancos', 'permisos', 'roles'] as const).map(s => (
              <button key={s} onClick={() => setSeccion(s)} style={{ flex: 1, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 600, background: seccion === s ? (dark ? '#1a1a1a' : '#1e3a5f') : 'transparent', color: seccion === s ? '#fff' : textMuted, border: `0.5px solid ${seccion === s ? (dark ? '#2a2a2a' : '#1e3a5f') : border}` }}>
                {s === 'bancos' ? '🏦 Bancos' : s === 'permisos' ? '🔐 Permisos' : '🧩 Roles'}
              </button>
            ))}
          </div>

          {/* Tabs fila 4 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            <button
              onClick={() => router.push('/calibrador-plano')}
              style={{ flex: 1, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 600, background: 'transparent', color: textMuted, border: `0.5px solid ${border}` }}
            >
              📐 Cal. Planos
            </button>
            <button
              onClick={() => router.push('/calibrador-elementos')}
              style={{ flex: 1, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 600, background: 'transparent', color: textMuted, border: `0.5px solid ${border}` }}
            >
              🎯 Cal. Elem.
            </button>
          </div>

          {/* ── USUARIOS ── */}
          {seccion === 'usuarios' && (
            <>
              {pendientes.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 9, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 10 }}>⏳ Solicitudes pendientes ({pendientes.length})</div>
                  {pendientes.map(u => (
                    <div key={u.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 16, padding: 14, marginBottom: 10, border: '0.5px solid rgba(251,191,36,0.25)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: dark ? 'rgba(251,191,36,0.08)' : '#fffbeb', border: '0.5px solid rgba(251,191,36,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fbbf24', flexShrink: 0 }}>
                          {u.nombre?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>{u.nombre}</div>
                          <div style={{ fontSize: 11, color: textSecondary }}>{u.email}</div>
                          <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 2 }}>💼 {labelRol(u.rol)}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => aprobarUsuario(u)} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', color: dark ? '#4ade80' : '#15803d', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓ Aprobar</button>
                        <button onClick={() => { setUsuarioRechazar(u); setAlertRechazar(true); }} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', border: dark ? '0.5px solid rgba(239,68,68,0.2)' : '0.5px solid #fecaca', color: dark ? '#f87171' : '#b91c1c', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✗ Rechazar</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
                </div>
              )}

              <button onClick={() => { setError(''); setModalUsuario(true); }} style={{ width: '100%', height: 46, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Crear usuario</button>
              <FiltroBotones valor={filtroLineaUsuarios} onChange={setFiltroLineaUsuarios} />

              {usuariosFiltrados.map(u => {
                const principal     = u.usuario_proyectos?.find((up: any) => up.es_principal);
                const proyPrincipal = proyectos.find(p => p.id === principal?.proyecto_id);
                const lc = u.linea ? lineaConfig[u.linea] : null;
                const tienePostventa = u.puede_postventa === true;
                return (
                  <div key={u.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 16, padding: 14, marginBottom: 10, border: `0.5px solid ${border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: dark ? 'linear-gradient(135deg, #1a1a1a, #222)' : 'linear-gradient(135deg, #1e3a5f, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: dark ? '#666' : '#fff', flexShrink: 0 }}>
                        {u.nombre?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.nombre}</div>
                        <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>{u.email}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          {lc && (<><div style={{ width: 7, height: 7, borderRadius: '50%', background: lc.color }} /><span style={{ fontSize: 10, color: lc.color, fontWeight: 600 }}>{lc.label}</span></>)}
                          {proyPrincipal && <span style={{ fontSize: 10, color: dark ? '#60a5fa' : '#2563eb' }}>⭐ {proyPrincipal.nombre}</span>}
                          {tienePostventa && (
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: dark ? 'rgba(74,222,128,0.08)' : '#f0fdf4', color: dark ? '#4ade80' : '#15803d', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0' }}>
                              🔧 Post Venta
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: textMuted }}>{Array.isArray(u.usuario_proyectos) ? u.usuario_proyectos.length : 0} proy.</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                      <div>
                        <label style={labelStyle}>rol</label>
                        <select value={u.rol} onChange={e => cambiarRol(u, e.target.value)} style={{ ...inputStyle, marginBottom: 0, height: 36, fontSize: 12 }}>
                          {rolesDB.filter(r => r.activo || r.nombre === u.rol).map(r => <option key={r.id} value={r.nombre}>{labelRol(r.nombre, r.descripcion)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>línea</label>
                        <select value={u.linea ?? ''} onChange={e => cambiarLinea(u, e.target.value)} style={{ ...inputStyle, marginBottom: 0, height: 36, fontSize: 12 }}>
                          <option value="">Sin línea</option>
                          {lineas.map(l => <option key={l} value={l}>{lineaConfig[l].label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>rut</label>
                      <input
                        defaultValue={u.rut ?? ''}
                        onBlur={e => cambiarRutUsuario(u, e.target.value.trim())}
                        placeholder="12.345.678-9"
                        style={{ ...inputStyle, marginBottom: 0, height: 36, fontSize: 12 }}
                      />
                    </div>

                    {u.rol !== 'administrador' && (
                      <div
                        onClick={() => togglePostventa(u)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 10,
                          background: tienePostventa
                            ? (dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4')
                            : (dark ? '#111' : '#f8fafc'),
                          border: `0.5px solid ${tienePostventa
                            ? (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0')
                            : border}`,
                        }}
                      >
                        <div style={{
                          width: 36, height: 20, borderRadius: 10, flexShrink: 0, position: 'relative',
                          background: tienePostventa ? (dark ? '#4ade80' : '#15803d') : (dark ? '#222' : '#cbd5e1'),
                          transition: 'background 0.2s',
                        }}>
                          <div style={{
                            position: 'absolute', top: 2,
                            left: tienePostventa ? 18 : 2,
                            width: 16, height: 16, borderRadius: '50%', background: '#fff',
                            transition: 'left 0.2s',
                          }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: tienePostventa ? (dark ? '#4ade80' : '#15803d') : textSecondary }}>
                            🔧 Acceso a Post Venta
                          </div>
                          <div style={{ fontSize: 10, color: textMuted, marginTop: 1 }}>
                            {tienePostventa ? 'Habilitado' : 'Deshabilitado'}
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, borderTop: `0.5px solid ${border}`, paddingTop: 10 }}>
                      <button onClick={() => abrirAsignar(u)} style={{ flex: 1, height: 32, borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 11, cursor: 'pointer' }}>📋 Proyectos</button>
                      <button onClick={() => abrirModalPermisos(u)} style={{ flex: 1, height: 32, borderRadius: 8, background: dark ? 'rgba(139,92,246,0.06)' : '#f3e8ff', border: dark ? '0.5px solid rgba(139,92,246,0.15)' : '0.5px solid #e9d5ff', color: dark ? '#a78bfa' : '#7c3aed', fontSize: 11, cursor: 'pointer' }}>🔐 Permisos</button>
                      <button onClick={() => { setUsuarioPerfil(u); setModalPerfil(true); }} style={{ flex: 1, height: 32, borderRadius: 8, background: dark ? 'rgba(96,165,250,0.06)' : '#eff6ff', border: dark ? '0.5px solid rgba(96,165,250,0.15)' : '0.5px solid #bfdbfe', color: dark ? '#60a5fa' : '#1d4ed8', fontSize: 11, cursor: 'pointer' }}>👤 Perfil</button>
                      <button onClick={() => { setItemEliminar(u); setTipoEliminar('usuario'); setAlertEliminar(true); }} style={{ height: 32, padding: '0 12px', borderRadius: 8, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca', color: dark ? '#f87171' : '#b91c1c', fontSize: 11, cursor: 'pointer' }}>🗑️</button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* ── AMBIENTES ── */}
          {seccion === 'ambientes' && (
            <>
              <button onClick={() => { setError(''); setNuevoAmbiente(''); setModalAmbiente(true); }} style={{ width: '100%', height: 46, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Agregar ambiente</button>
              {ambientes.map(a => (
                <div key={a.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8, border: `0.5px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: textPrimary }}>{a.nombre}</span>
                  <button onClick={() => { setItemEliminar(a); setTipoEliminar('ambiente'); setAlertEliminar(true); }} style={{ background: 'none', border: 'none', color: dark ? '#f87171' : '#b91c1c', fontSize: 18, cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </>
          )}

          {/* ── PARTIDAS ── */}
          {seccion === 'partidas' && (
            <>
              <button onClick={() => { setError(''); setNuevoPartida(''); setModalPartida(true); }} style={{ width: '100%', height: 46, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Agregar partida</button>
              {partidas.map(p => (
                <div key={p.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8, border: `0.5px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: textPrimary }}>{p.nombre}</span>
                  <button onClick={() => { setItemEliminar(p); setTipoEliminar('partida'); setAlertEliminar(true); }} style={{ background: 'none', border: 'none', color: dark ? '#f87171' : '#b91c1c', fontSize: 18, cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </>
          )}

          {/* ── CAUSAS ── */}
          {seccion === 'causas' && (
            <>
              <button onClick={() => { setError(''); setNuevaCausa(''); setNuevaCausaTipo('estandar'); setModalCausa(true); }} style={{ width: '100%', height: 46, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Agregar causa</button>
              {(['estandar', 'tercero', 'nombre_tercero'] as const).map(tipo => {
                const grupo = causas.filter(c => c.tipo === tipo);
                if (grupo.length === 0) return null;
                return (
                  <div key={tipo} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 9, color: tipoColor(tipo), textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 8 }}>
                      {TIPOS_CAUSA.find(t => t.value === tipo)?.label} ({grupo.length})
                    </div>
                    {grupo.map(c => (
                      <div key={c.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 12, padding: '10px 14px', marginBottom: 6, border: `0.5px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: tipoColor(c.tipo) }} />
                          <span style={{ fontSize: 13, color: textPrimary }}>{c.nombre}</span>
                        </div>
                        <button onClick={() => { setItemEliminar(c); setTipoEliminar('causa'); setAlertEliminar(true); }} style={{ background: 'none', border: 'none', color: dark ? '#f87171' : '#b91c1c', fontSize: 18, cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}

          {/* ── PROYECTOS ── */}
          {seccion === 'proyectos' && (
            <>
              <div style={{ fontSize: 12, color: textSecondary, marginBottom: 12 }}>Asigna línea, etapa y datos del acta a cada proyecto.</div>
              <FiltroBotones valor={filtroLineaProyectos} onChange={setFiltroLineaProyectos} />
              {proyectosFiltrados.map(p => {
                const lc = p.linea ? lineaConfig[p.linea] : null;
                const tieneActa = !!p.acta_nombre_inmobiliaria;
                return (
                  <div key={p.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 16, padding: 14, marginBottom: 10, border: `0.5px solid ${border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>{p.nombre}</div>
                        {p.direccion && <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>📍 {p.direccion}</div>}
                        {lc && (<div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: lc.color }} /><span style={{ fontSize: 10, color: lc.color, fontWeight: 600 }}>{lc.label}</span></div>)}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                      <div>
                        <label style={labelStyle}>etapa</label>
                        <select value={p.etapa ?? 'obra'} onChange={async e => { await supabase.from('proyectos').update({ etapa: e.target.value }).eq('id', p.id); cargar(); }} style={{ ...inputStyle, marginBottom: 0, height: 36, fontSize: 12 }}>
                          <option value="obra">🏗️ Obra</option>
                          <option value="pre_entrega_postventa">🏠 Pre-entrega/PV</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>línea</label>
                        <select value={p.linea ?? ''} onChange={e => cambiarLineaProyecto(p.id, e.target.value)} style={{ ...inputStyle, marginBottom: 0, height: 36, fontSize: 12 }}>
                          <option value="">Sin línea</option>
                          {lineas.map(l => <option key={l} value={l}>{lineaConfig[l].label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => abrirActaProyecto(p)}
                        style={{
                          flex: 1, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                          background: tieneActa ? (dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4') : (dark ? '#111' : '#f8fafc'),
                          border: `0.5px solid ${tieneActa ? (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : border}`,
                          color: tieneActa ? (dark ? '#4ade80' : '#15803d') : textSecondary,
                        }}
                      >
                        {tieneActa ? '✓ 📄 Datos acta' : '📄 Datos acta'}
                      </button>
                      <div style={{ padding: '7px 10px', borderRadius: 8, background: p.etapa === 'pre_entrega_postventa' ? (dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4') : (dark ? 'rgba(96,165,250,0.06)' : '#eff6ff'), border: `0.5px solid ${p.etapa === 'pre_entrega_postventa' ? (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : (dark ? 'rgba(96,165,250,0.2)' : '#bfdbfe')}`, flex: 1 }}>
                        <span style={{ fontSize: 11, color: p.etapa === 'pre_entrega_postventa' ? (dark ? '#4ade80' : '#15803d') : (dark ? '#60a5fa' : '#1d4ed8') }}>
                          {p.etapa === 'pre_entrega_postventa' ? '✓ Pre-entrega/PV' : '✓ Obra'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* ── AMBIENTES ZC ── */}
          {seccion === 'ambientes_zc' && (
            <>
              <div style={{ fontSize: 12, color: textSecondary, marginBottom: 12 }}>Ambientes disponibles en el formulario de observaciones de Zona Común.</div>
              <button onClick={() => { setError(''); setNuevoAmbienteZC(''); setNuevoAmbienteZCSoloPiso1(false); setModalAmbienteZC(true); }} style={{ width: '100%', height: 46, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Agregar ambiente ZC</button>
              {ambientesZC.map(a => (
                <div key={a.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8, border: `0.5px solid ${a.activo ? border : (dark ? '#2a1a1a' : '#fecaca')}`, opacity: a.activo ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: textPrimary, fontWeight: 500 }}>{a.nombre}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {a.solo_piso_1 && (<span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, background: dark ? 'rgba(251,191,36,0.1)' : '#fffbeb', color: dark ? '#fbbf24' : '#a16207', border: dark ? '0.5px solid rgba(251,191,36,0.2)' : '0.5px solid #fde68a' }}>Solo Piso 1</span>)}
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, background: a.activo ? (dark ? 'rgba(74,222,128,0.1)' : '#f0fdf4') : (dark ? 'rgba(239,68,68,0.1)' : '#fef2f2'), color: a.activo ? (dark ? '#4ade80' : '#15803d') : (dark ? '#f87171' : '#b91c1c'), border: `0.5px solid ${a.activo ? (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : (dark ? 'rgba(239,68,68,0.2)' : '#fecaca')}` }}>{a.activo ? 'Activo' : 'Inactivo'}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => toggleActivoZC(a)} style={{ height: 30, padding: '0 10px', borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 11, cursor: 'pointer' }}>{a.activo ? 'Desactivar' : 'Activar'}</button>
                      <button onClick={() => { setItemEliminar(a); setTipoEliminar('ambiente_zc'); setAlertEliminar(true); }} style={{ background: 'none', border: 'none', color: dark ? '#f87171' : '#b91c1c', fontSize: 18, cursor: 'pointer' }}>×</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── BANCOS ── */}
          {seccion === 'bancos' && (
            <>
              <div style={{ fontSize: 12, color: textSecondary, marginBottom: 12 }}>Lista global de bancos para el punto 9 del acta de pre entrega.</div>
              <button onClick={() => { setError(''); setNuevoBanco(''); setModalBanco(true); }} style={{ width: '100%', height: 46, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Agregar banco</button>
              {bancos.map(b => (
                <div key={b.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8, border: `0.5px solid ${b.activo ? border : (dark ? '#2a1a1a' : '#fecaca')}`, opacity: b.activo ? 1 : 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: textPrimary, fontWeight: 500 }}>{b.nombre}</div>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, background: b.activo ? (dark ? 'rgba(74,222,128,0.1)' : '#f0fdf4') : (dark ? 'rgba(239,68,68,0.1)' : '#fef2f2'), color: b.activo ? (dark ? '#4ade80' : '#15803d') : (dark ? '#f87171' : '#b91c1c'), border: `0.5px solid ${b.activo ? (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : (dark ? 'rgba(239,68,68,0.2)' : '#fecaca')}`, marginTop: 4, display: 'inline-block' }}>{b.activo ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => toggleBancoActivo(b)} style={{ height: 30, padding: '0 10px', borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 11, cursor: 'pointer' }}>{b.activo ? 'Desactivar' : 'Activar'}</button>
                    <button onClick={() => { setItemEliminar(b); setTipoEliminar('banco'); setAlertEliminar(true); }} style={{ background: 'none', border: 'none', color: dark ? '#f87171' : '#b91c1c', fontSize: 18, cursor: 'pointer' }}>×</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── PERMISOS (por usuario) ── */}
          {seccion === 'permisos' && (
            <>
              <div style={{ fontSize: 12, color: textSecondary, marginBottom: 12 }}>Otorga o quita permisos a un usuario específico por encima de su rol.</div>
              {usuarios.map(u => (
                <div key={u.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8, border: `0.5px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{u.nombre}</div>
                    <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>{u.email} · {labelRol(u.rol)}</div>
                  </div>
                  <button onClick={() => abrirModalPermisos(u)} style={{ padding: '6px 12px', borderRadius: 8, background: dark ? 'rgba(139,92,246,0.1)' : '#f3e8ff', border: dark ? '0.5px solid rgba(139,92,246,0.2)' : '0.5px solid #e9d5ff', color: dark ? '#a78bfa' : '#7c3aed', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Editar</button>
                </div>
              ))}
            </>
          )}

          {/* ── ROLES (crear + permisos por defecto) ── */}
          {seccion === 'roles' && (
            <>
              <div style={{ fontSize: 12, color: textSecondary, marginBottom: 12 }}>Crea roles y define los permisos que traen por defecto. Estos son la base; luego puedes ajustar por usuario en "Permisos".</div>
              <button onClick={() => { setError(''); setNuevoRolNombre(''); setModalRol(true); }} style={{ width: '100%', height: 46, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>+ Crear rol</button>
              {rolesDB.map(r => (
                <div key={r.id} style={{ background: dark ? 'linear-gradient(135deg, #0e0e0e, #141414)' : '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8, border: `0.5px solid ${r.activo ? border : (dark ? '#2a1a1a' : '#fecaca')}`, opacity: r.activo ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary }}>{labelRol(r.nombre, r.descripcion)}</div>
                      <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>{r.nombre}</div>
                    </div>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, background: r.activo ? (dark ? 'rgba(74,222,128,0.1)' : '#f0fdf4') : (dark ? 'rgba(239,68,68,0.1)' : '#fef2f2'), color: r.activo ? (dark ? '#4ade80' : '#15803d') : (dark ? '#f87171' : '#b91c1c'), border: `0.5px solid ${r.activo ? (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0') : (dark ? 'rgba(239,68,68,0.2)' : '#fecaca')}` }}>{r.activo ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => abrirPermisosRol(r)} style={{ flex: 1, height: 34, borderRadius: 8, background: dark ? 'rgba(139,92,246,0.06)' : '#f3e8ff', border: dark ? '0.5px solid rgba(139,92,246,0.15)' : '0.5px solid #e9d5ff', color: dark ? '#a78bfa' : '#7c3aed', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>🔐 Permisos por defecto</button>
                    <button onClick={() => toggleRolActivo(r)} style={{ height: 34, padding: '0 12px', borderRadius: 8, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 11, cursor: 'pointer' }}>{r.activo ? 'Desactivar' : 'Activar'}</button>
                  </div>
                </div>
              ))}
            </>
          )}

          <div style={{ height: 40 }} />
        </div>

        {/* Modal permisos por USUARIO (rol + overrides grant/revoke) */}
        <IonModal isOpen={modalPermisos} onDidDismiss={() => setModalPermisos(false)} initialBreakpoint={0.8} breakpoints={[0, 0.8, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Permisos: {usuarioPermisos?.nombre}</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 8 }}>Rol: {labelRol(usuarioPermisos?.rol)}</div>
            <div style={{ fontSize: 11, color: textMuted, marginBottom: 20, lineHeight: 1.5 }}>
              Los permisos marcados vienen del rol por defecto. Puedes <b style={{ color: dark ? '#4ade80' : '#15803d' }}>otorgar</b> uno extra o <b style={{ color: dark ? '#f87171' : '#b91c1c' }}>revocar</b> uno del rol solo para este usuario.
            </div>

            {modulosPresentes().map(modulo => {
              const permsModulo = todosLosPermisosList.filter(p => p.modulo === modulo);
              if (permsModulo.length === 0) return null;
              return (
                <div key={modulo} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, color: dark ? '#60a5fa' : '#1d4ed8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8, letterSpacing: '1px' }}>📦 {MODULO_LABEL[modulo] ?? modulo}</div>
                  {permsModulo.map(perm => {
                    const efectivo   = estadoEfectivoUsuario(perm.id);
                    const esDefault  = permisosRolUsuario.includes(perm.id);
                    const overridden = perm.id in overridesUsuario;
                    let badge: { txt: string; color: string; bg: string } | null = null;
                    if (overridden && !esDefault && efectivo)       badge = { txt: 'Otorgado', color: dark ? '#4ade80' : '#15803d', bg: dark ? 'rgba(74,222,128,0.1)' : '#f0fdf4' };
                    else if (overridden && esDefault && !efectivo)  badge = { txt: 'Revocado', color: dark ? '#f87171' : '#b91c1c', bg: dark ? 'rgba(239,68,68,0.1)' : '#fef2f2' };
                    else if (!overridden && esDefault)              badge = { txt: 'Por rol',  color: dark ? '#60a5fa' : '#1d4ed8', bg: dark ? 'rgba(96,165,250,0.1)' : '#eff6ff' };
                    return (
                      <div key={perm.id} onClick={() => togglePermisoUsuario(perm.id)} style={{ background: dark ? '#111' : '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center', border: `0.5px solid ${border}`, cursor: 'pointer' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 6, border: `1.5px solid ${efectivo ? '#60a5fa' : inputBorder}`, background: efectivo ? '#60a5fa' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', flexShrink: 0 }}>
                          {efectivo ? '✓' : ''}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>{perm.nombre}</div>
                          <div style={{ fontSize: 10, color: textMuted }}>{perm.codigo}</div>
                        </div>
                        {badge && (
                          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 6, fontWeight: 600, color: badge.color, background: badge.bg, border: `0.5px solid ${badge.color}33` }}>{badge.txt}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <button onClick={() => setModalPermisos(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 12, marginTop: 20, cursor: 'pointer' }}>Cerrar</button>
          </div>
        </IonModal>

        {/* Modal permisos por DEFECTO de un ROL */}
        <IonModal isOpen={modalPermisosRol} onDidDismiss={() => setModalPermisosRol(false)} initialBreakpoint={0.8} breakpoints={[0, 0.8, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Permisos por defecto</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 8 }}>Rol: {labelRol(rolSel?.nombre, rolSel?.descripcion)}</div>
            <div style={{ fontSize: 11, color: textMuted, marginBottom: 20, lineHeight: 1.5 }}>
              Lo que marques aquí es lo que traerá cualquier usuario con este rol. Los cambios aplican en el próximo inicio de sesión / recarga del usuario.
            </div>

            {modulosPresentes().map(modulo => {
              const permsModulo = todosLosPermisosList.filter(p => p.modulo === modulo);
              if (permsModulo.length === 0) return null;
              return (
                <div key={modulo} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, color: dark ? '#60a5fa' : '#1d4ed8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8, letterSpacing: '1px' }}>📦 {MODULO_LABEL[modulo] ?? modulo}</div>
                  {permsModulo.map(perm => {
                    const tiene = permisosRolSel.includes(perm.id);
                    return (
                      <div key={perm.id} onClick={() => togglePermisoRol(perm.id)} style={{ background: dark ? '#111' : '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center', border: `0.5px solid ${border}`, cursor: 'pointer' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 6, border: `1.5px solid ${tiene ? '#60a5fa' : inputBorder}`, background: tiene ? '#60a5fa' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', flexShrink: 0 }}>
                          {tiene ? '✓' : ''}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>{perm.nombre}</div>
                          <div style={{ fontSize: 10, color: textMuted }}>{perm.codigo}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <button onClick={() => { setModalPermisosRol(false); cargar(); }} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 12, marginTop: 20, cursor: 'pointer' }}>Cerrar</button>
          </div>
        </IonModal>

        {/* Modal crear ROL */}
        <IonModal isOpen={modalRol} onDidDismiss={() => setModalRol(false)} initialBreakpoint={0.4} breakpoints={[0, 0.4, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Nuevo rol</div>
            <label style={labelStyle}>nombre del rol *</label>
            <input value={nuevoRolNombre} onChange={e => setNuevoRolNombre(e.target.value)} placeholder="Ej: Supervisor de Calidad" style={inputStyle} />
            {nuevoRolNombre.trim() && (
              <div style={{ fontSize: 11, color: textMuted, marginBottom: 16 }}>código interno: <b style={{ color: textSecondary }}>{slugRol(nuevoRolNombre)}</b></div>
            )}
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={crearRol} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>{guardando ? 'Creando...' : 'Crear rol'}</button>
            <button onClick={() => setModalRol(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal perfil */}
        <ModalPerfil
          usuario={usuarioPerfil} isOpen={modalPerfil}
          onClose={() => { setModalPerfil(false); setUsuarioPerfil(null); }}
          dark={dark} card={card} border={border}
          textPrimary={textPrimary} textSecondary={textSecondary} textMuted={textMuted}
        />

        {/* Modal crear usuario */}
        <IonModal isOpen={modalUsuario} onDidDismiss={() => setModalUsuario(false)} initialBreakpoint={0.9} breakpoints={[0, 0.9, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Nuevo usuario</div>
            <label style={labelStyle}>nombre completo *</label>
            <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Ej: Juan Pérez" style={inputStyle} />
            <label style={labelStyle}>correo *</label>
            <input value={nuevoEmail} onChange={e => setNuevoEmail(e.target.value)} placeholder="juan@empresa.cl" type="email" style={inputStyle} />
            <label style={labelStyle}>contraseña *</label>
            <input value={nuevoPassword} onChange={e => setNuevoPassword(e.target.value)} placeholder="Mínimo 6 caracteres" type="password" style={inputStyle} />
            <label style={labelStyle}>rut</label>
            <input value={nuevoRut} onChange={e => setNuevoRut(e.target.value)} placeholder="12.345.678-9" style={inputStyle} />
            <label style={labelStyle}>rol *</label>
            <select value={nuevoRol} onChange={e => setNuevoRol(e.target.value)} style={inputStyle}>
              {rolesDB.filter(r => r.activo).map(r => <option key={r.id} value={r.nombre}>{labelRol(r.nombre, r.descripcion)}</option>)}
            </select>
            <label style={labelStyle}>línea</label>
            <LineaSelector value={nuevoLinea} onChange={setNuevoLinea} />
            <div style={{ marginBottom: 20 }} />
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px', borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca' }}>{error}</div>}
            <button onClick={crearUsuario} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {guardando ? 'Creando...' : 'Crear usuario'}
            </button>
            <button onClick={() => setModalUsuario(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal datos acta */}
        <IonModal isOpen={modalActa} onDidDismiss={() => setModalActa(false)} initialBreakpoint={0.9} breakpoints={[0, 0.9, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Datos del acta pre entrega</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>{proyectoActa?.nombre}</div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>logo proyecto</label>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 60, height: 60, borderRadius: 12, background: dark ? '#111' : '#f8fafc', border: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {actaLogoPreview ? (
                    <img src={actaLogoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 20 }}>📸</span>
                  )}
                </div>
                <label style={{ flex: 1, height: 40, borderRadius: 10, background: dark ? 'rgba(37,99,235,0.08)' : '#eff6ff', border: `0.5px dashed ${dark ? 'rgba(37,99,235,0.3)' : '#bfdbfe'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, color: dark ? '#60a5fa' : '#1d4ed8', fontWeight: 500 }}>
                  📤 Subir logo
                  <input type="file" accept="image/*" onChange={subirLogoProyecto} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            <label style={labelStyle}>nombre inmobiliaria</label>
            <input value={actaForm.acta_nombre_inmobiliaria} onChange={e => setActaForm(prev => ({ ...prev, acta_nombre_inmobiliaria: e.target.value }))} placeholder="CONDOMINIO SAN AGUSTIN" style={inputStyle} />

            <label style={labelStyle}>dirección</label>
            <input value={actaForm.acta_direccion} onChange={e => setActaForm(prev => ({ ...prev, acta_direccion: e.target.value }))} placeholder="AV PARQUE CENTRAL 06682 CORDILLERA - PUENTE ALTO" style={inputStyle} />

            <label style={labelStyle}>ciudad</label>
            <input value={actaForm.acta_ciudad} onChange={e => setActaForm(prev => ({ ...prev, acta_ciudad: e.target.value }))} placeholder="CORDILLERA" style={inputStyle} />

            <label style={labelStyle}>teléfono</label>
            <input value={actaForm.acta_telefono} onChange={e => setActaForm(prev => ({ ...prev, acta_telefono: e.target.value }))} placeholder="56968332775" style={inputStyle} />

            <label style={labelStyle}>email</label>
            <input value={actaForm.acta_email} onChange={e => setActaForm(prev => ({ ...prev, acta_email: e.target.value }))} placeholder="sanagustin@itodoslossantos.cl" style={inputStyle} />

            <label style={labelStyle}>nombre legal</label>
            <input value={actaForm.acta_nombre_legal} onChange={e => setActaForm(prev => ({ ...prev, acta_nombre_legal: e.target.value }))} placeholder="INMOBILIARIA SAN AGUSTÍN SPA" style={inputStyle} />

            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12, background: dark ? 'rgba(239,68,68,0.06)' : '#fef2f2', padding: '8px 12px', borderRadius: 10, border: dark ? '0.5px solid rgba(239,68,68,0.15)' : '0.5px solid #fecaca' }}>{error}</div>}

            <button onClick={guardarActaProyecto} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
              {guardando ? 'Guardando...' : 'Guardar datos'}
            </button>
            <button onClick={() => setModalActa(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal asignar proyectos */}
        <IonModal isOpen={modalAsignar} onDidDismiss={() => setModalAsignar(false)} initialBreakpoint={0.75} breakpoints={[0, 0.75, 1]}>
          <div style={{ padding: 24, background: card, height: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Asignar proyectos</div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 20 }}>{usuarioSel?.nombre}</div>
            {proyectos.map(p => {
              const seleccionado = proyectosSel.includes(p.id);
              const esPrincipal  = proyectoPrincipal === p.id;
              return (
                <div key={p.id} style={{ borderRadius: 12, marginBottom: 8, overflow: 'hidden', border: `0.5px solid ${seleccionado ? (dark ? 'rgba(37,99,235,0.4)' : '#bfdbfe') : border}` }}>
                  <div onClick={() => toggleProyecto(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: seleccionado ? (dark ? 'rgba(37,99,235,0.08)' : '#eff6ff') : cardAlt, padding: '10px 14px', cursor: 'pointer' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: '1.5px solid', borderColor: seleccionado ? '#2563eb' : inputBorder, background: seleccionado ? '#2563eb' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', flexShrink: 0 }}>{seleccionado ? '✓' : ''}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{p.nombre}</div>
                      {p.direccion && <div style={{ fontSize: 11, color: textSecondary }}>{p.direccion}</div>}
                    </div>
                  </div>
                  {seleccionado && (
                    <div onClick={() => setProyectoPrincipal(esPrincipal ? '' : p.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', background: esPrincipal ? (dark ? 'rgba(251,191,36,0.08)' : '#fffbeb') : (dark ? '#111' : '#f9fafb'), borderTop: `0.5px solid ${border}` }}>
                      <span style={{ fontSize: 14 }}>{esPrincipal ? '⭐' : '☆'}</span>
                      <span style={{ fontSize: 11, color: esPrincipal ? (dark ? '#fbbf24' : '#a16207') : textMuted }}>{esPrincipal ? 'Proyecto principal' : 'Marcar como principal'}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={guardarAsignacion} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
              {guardando ? 'Guardando...' : 'Guardar asignación'}
            </button>
            <button onClick={() => setModalAsignar(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal nuevo ambiente */}
        <IonModal isOpen={modalAmbiente} onDidDismiss={() => setModalAmbiente(false)} initialBreakpoint={0.35} breakpoints={[0, 0.35, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Nuevo ambiente</div>
            <label style={labelStyle}>nombre *</label>
            <input value={nuevoAmbiente} onChange={e => setNuevoAmbiente(e.target.value)} placeholder="Ej: Terraza" style={inputStyle} />
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={crearAmbiente} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Agregar'}</button>
          </div>
        </IonModal>

        {/* Modal nueva partida */}
        <IonModal isOpen={modalPartida} onDidDismiss={() => setModalPartida(false)} initialBreakpoint={0.35} breakpoints={[0, 0.35, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Nueva partida</div>
            <label style={labelStyle}>nombre *</label>
            <input value={nuevoPartida} onChange={e => setNuevoPartida(e.target.value)} placeholder="Ej: Impermeabilización" style={inputStyle} />
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={crearPartida} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Agregar'}</button>
          </div>
        </IonModal>

        {/* Modal nueva causa */}
        <IonModal isOpen={modalCausa} onDidDismiss={() => setModalCausa(false)} initialBreakpoint={0.45} breakpoints={[0, 0.45, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Nueva causa</div>
            <label style={labelStyle}>tipo *</label>
            <select value={nuevaCausaTipo} onChange={e => setNuevaCausaTipo(e.target.value)} style={inputStyle}>{TIPOS_CAUSA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            <label style={labelStyle}>nombre *</label>
            <input value={nuevaCausa} onChange={e => setNuevaCausa(e.target.value)} placeholder={nuevaCausaTipo === 'estandar' ? 'Ej: Ejecución Deficiente' : nuevaCausaTipo === 'tercero' ? 'Ej: Daño de Otras Cuadrillas' : 'Ej: Soldador'} style={{ ...inputStyle, marginBottom: 20 }} />
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={crearCausa} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Agregar'}</button>
            <button onClick={() => setModalCausa(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal nuevo ambiente ZC */}
        <IonModal isOpen={modalAmbienteZC} onDidDismiss={() => setModalAmbienteZC(false)} initialBreakpoint={0.45} breakpoints={[0, 0.45, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Nuevo ambiente ZC</div>
            <label style={labelStyle}>nombre *</label>
            <input value={nuevoAmbienteZC} onChange={e => setNuevoAmbienteZC(e.target.value)} placeholder="Ej: Sala de juegos" style={inputStyle} />
            <div onClick={() => setNuevoAmbienteZCSoloPiso1(!nuevoAmbienteZCSoloPiso1)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `0.5px solid ${nuevoAmbienteZCSoloPiso1 ? (dark ? 'rgba(251,191,36,0.3)' : '#fde68a') : border}`, background: nuevoAmbienteZCSoloPiso1 ? (dark ? 'rgba(251,191,36,0.06)' : '#fffbeb') : 'transparent', cursor: 'pointer', marginBottom: 20 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${nuevoAmbienteZCSoloPiso1 ? '#fbbf24' : inputBorder}`, background: nuevoAmbienteZCSoloPiso1 ? '#fbbf24' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', flexShrink: 0 }}>{nuevoAmbienteZCSoloPiso1 ? '✓' : ''}</div>
              <div>
                <div style={{ fontSize: 13, color: textPrimary, fontWeight: 500 }}>Solo disponible en Piso 1</div>
                <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>Ej: Sala de Basura, Estacionamiento</div>
              </div>
            </div>
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={crearAmbienteZC} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Agregar'}</button>
            <button onClick={() => setModalAmbienteZC(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, marginTop: 8, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        {/* Modal nuevo banco */}
        <IonModal isOpen={modalBanco} onDidDismiss={() => setModalBanco(false)} initialBreakpoint={0.35} breakpoints={[0, 0.35, 0.9]}>
          <div style={{ padding: 24, background: card, height: '100%' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: textPrimary, marginBottom: 20 }}>Nuevo banco</div>
            <label style={labelStyle}>nombre *</label>
            <input value={nuevoBanco} onChange={e => setNuevoBanco(e.target.value)} placeholder="Ej: Banco de Chile" style={inputStyle} />
            {error && <div style={{ color: dark ? '#f87171' : '#b91c1c', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button onClick={crearBanco} disabled={guardando} style={{ width: '100%', height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>{guardando ? 'Guardando...' : 'Agregar'}</button>
            <button onClick={() => setModalBanco(false)} style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `0.5px solid ${border}`, color: textSecondary, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </IonModal>

        <IonAlert isOpen={alertEliminar} onDidDismiss={() => setAlertEliminar(false)}
          header="¿Eliminar?"
          message={tipoEliminar === 'usuario' ? `Se eliminará el usuario "${itemEliminar?.nombre}" permanentemente.` : `Se eliminará "${itemEliminar?.nombre}".`}
          buttons={[{ text: 'Cancelar', role: 'cancel' }, { text: 'Eliminar', handler: () => { setAlertEliminar(false); eliminar(); } }]} />

        <IonAlert isOpen={alertRechazar} onDidDismiss={() => setAlertRechazar(false)}
          header="¿Rechazar solicitud?"
          message={`Se eliminará la solicitud de "${usuarioRechazar?.nombre}" permanentemente.`}
          buttons={[{ text: 'Cancelar', handler: () => setAlertRechazar(false) }, { text: 'Rechazar', handler: () => { setAlertRechazar(false); rechazarUsuario(); } }]} />

      </IonContent>
    </IonPage>
  );
};

export default Admin;
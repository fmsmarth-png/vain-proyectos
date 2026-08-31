// src/contexts/PermisosContext.tsx
// FMS — Julio 2026
// Sistema RBAC dinámico: caché de permisos y roles en cliente
// FIX: refresca permisos en login/logout/cambio de usuario sin reiniciar la app
//      (suscripción a supabase.auth.onAuthStateChange)

import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';

export interface Permiso {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  modulo?: string;
  activo: boolean;
}

export interface Rol {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

export interface PermisosContextType {
  permisos: Permiso[]; // Todos los permisos del usuario (rol + adicionales)
  roles: Rol[];
  cargando: boolean;
  error?: string;
  tienePermiso: (codigoPermiso: string) => boolean;
  recargarPermisos: () => Promise<void>;
  // Para Admin:
  todosLosPermisos: Permiso[];
  todosLosRoles: Rol[];
  otorgarPermisoUsuario: (usuarioId: string, permisoId: string) => Promise<void>;
  removerPermisoUsuario: (usuarioId: string, permisoId: string) => Promise<void>;
  obtenerPermisosUsuario: (usuarioId: string) => Promise<Permiso[]>;
}

export const PermisosContext = createContext<PermisosContextType | undefined>(undefined);

export const PermisosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [todosLosPermisos, setTodosLosPermisos] = useState<Permiso[]>([]);
  const [todosLosRoles, setTodosLosRoles] = useState<Rol[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string>();

  // ========================================================================
  // Seguir la sesión de Supabase en tiempo real
  //   - getSession() inicial  -> cubre "app recién abierta / recién logueado"
  //   - onAuthStateChange     -> cubre login / logout / cambio de usuario EN CALIENTE
  //
  // OJO: dentro del callback SOLO hacemos setState (nada de queries a Supabase),
  //      para evitar el deadlock conocido de supabase-js v2. Las queries ocurren
  //      en recargarPermisos(), disparado por el cambio de `usuarioId`.
  // ========================================================================
  useEffect(() => {
    let activo = true;

    const sincronizarSesion = (session: Session | null) => {
      if (!activo) return;
      const nuevoId = session?.user?.id ?? null;

      // Solo re-render si realmente cambió el usuario (evita trabajo por TOKEN_REFRESHED)
      setUsuarioId((prev) => (prev === nuevoId ? prev : nuevoId));

      if (!nuevoId) {
        // Sin sesión: limpiar permisos y terminar la carga
        setPermisos([]);
        setCargando(false);
      }
    };

    // 1) Sesión inicial
    supabase.auth
      .getSession()
      .then(({ data }) => sincronizarSesion(data?.session ?? null))
      .catch((err) => {
        console.error('Error obteniendo sesión:', err);
        if (activo) setCargando(false);
      });

    // 2) Reacciona a login / logout / cambio de usuario
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      sincronizarSesion(session);
    });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, []);

  // ========================================================================
  // Cargar permisos del usuario (rol + adicionales específicos)
  // ========================================================================
  const recargarPermisos = useCallback(async () => {
    // IMPORTANTE: No hacer queries si no hay usuarioId válido
    if (!usuarioId) {
      console.log('[PermisosContext] Sin usuarioId, limpiando permisos');
      setPermisos([]);
      setRoles([]);
      setCargando(false);
      setError(undefined);
      return;
    }

    try {
      setCargando(true);
      setError(undefined);

      // 1. Obtener rol del usuario
      const { data: usuarioData, error: errUser } = await supabase
        .from('usuarios')
        .select('id, rol')
        .eq('id', usuarioId)
        .maybeSingle();

      if (errUser || !usuarioData) {
        throw new Error('No se pudo obtener el rol del usuario');
      }

      const rolUsuario = usuarioData.rol;

      // 2. Obtener el rol_id del usuario
      const { data: rolData, error: errRolData } = await supabase
        .from('roles')
        .select('id')
        .eq('nombre', rolUsuario)
        .maybeSingle();

      if (errRolData || !rolData) {
        console.warn('No se encontró el rol:', rolUsuario);
      }

      // 3. Obtener permisos por rol usando rol_id
      const { data: permisosPorRol, error: errRol } = rolData ? await supabase
        .from('rol_permisos')
        .select('permiso_id, permisos(id, codigo, nombre, descripcion, modulo, activo)')
        .eq('rol_id', rolData.id) : { data: null, error: null };

      // 4. Obtener overrides individuales del usuario (grant/revoke)
      const { data: permisosAdicionales, error: errAdic } = await supabase
        .from('usuario_permisos')
        .select('permiso_id, concedido, permisos(id, codigo, nombre, descripcion, modulo, activo)')
        .eq('usuario_id', usuarioId);

      if (errRol || errAdic) {
        console.warn('Error cargando permisos:', errRol || errAdic);
      }

      // Efectivo = permisos del rol, aplicando overrides individuales:
      //   concedido = true  -> otorga (aunque el rol no lo tenga)
      //   concedido = false -> revoca (aunque el rol sí lo tenga)
      const permisosSet = new Map<string, Permiso>();

      if (permisosPorRol) {
        permisosPorRol.forEach((rp: any) => {
          if (rp.permisos) {
            permisosSet.set(rp.permisos.id, rp.permisos);
          }
        });
      }

      if (permisosAdicionales) {
        permisosAdicionales.forEach((pa: any) => {
          if (!pa.permisos) return;
          if (pa.concedido === false) {
            permisosSet.delete(pa.permisos.id); // revocado individual
          } else {
            permisosSet.set(pa.permisos.id, pa.permisos); // otorgado individual
          }
        });
      }

      const permisosUnicos = Array.from(permisosSet.values());
      setPermisos(permisosUnicos);
      console.log('[PermisosContext] Permisos cargados:', permisosUnicos.length);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      setError(mensaje);
      // Limpiar permisos en caso de error
      setPermisos([]);
      console.error('[PermisosContext] Error completo:', {
        codigo: (err as any)?.code,
        estado: (err as any)?.status,
        mensaje: mensaje
      });
    } finally {
      setCargando(false);
    }
  }, [usuarioId]);

  // Cargar todos los permisos y roles (para Admin)
  const cargarTodosLosPermisos = useCallback(async () => {
    try {
      const { data: todos, error: err } = await supabase
        .from('permisos')
        .select('id, codigo, nombre, descripcion, modulo, activo')
        .order('modulo, nombre');

      if (err) throw err;
      setTodosLosPermisos(todos || []);

      const { data: rolesData, error: errRoles } = await supabase
        .from('roles')
        .select('id, nombre, descripcion, activo')
        .order('nombre');

      if (errRoles) throw errRoles;
      setTodosLosRoles(rolesData || []);
    } catch (err) {
      console.error('Error cargando todos los permisos:', err);
    }
  }, []);

  // Cargar al montar o cuando cambia el usuario
  useEffect(() => {
    recargarPermisos();
    cargarTodosLosPermisos();
  }, [usuarioId, recargarPermisos, cargarTodosLosPermisos]);

  // ========================================================================
  // Funciones helper
  // ========================================================================

  const tienePermiso = (codigoPermiso: string): boolean => {
    return permisos.some(p => p.codigo === codigoPermiso && p.activo);
  };

  const obtenerPermisosUsuario = async (usuarioId: string): Promise<Permiso[]> => {
    try {
      // Obtener rol del usuario
      const { data: userData } = await supabase
        .from('usuarios')
        .select('rol')
        .eq('id', usuarioId)
        .maybeSingle();

      const rol = userData?.rol;

      // Obtener rol_id
      const { data: rolData } = rol ? await supabase
        .from('roles')
        .select('id')
        .eq('nombre', rol)
        .maybeSingle() : { data: null };

      // Permisos por rol
      const { data: permisosPorRol } = rolData ? await supabase
        .from('rol_permisos')
        .select('permiso_id, permisos(id, codigo, nombre, descripcion, modulo, activo)')
        .eq('rol_id', rolData.id) : { data: null };

      // Overrides individuales (grant/revoke)
      const { data: permisosAdicionales } = await supabase
        .from('usuario_permisos')
        .select('permiso_id, concedido, permisos(id, codigo, nombre, descripcion, modulo, activo)')
        .eq('usuario_id', usuarioId);

      const permisosSet = new Map<string, Permiso>();

      if (permisosPorRol) {
        permisosPorRol.forEach((rp: any) => {
          if (rp.permisos) permisosSet.set(rp.permisos.id, rp.permisos);
        });
      }

      if (permisosAdicionales) {
        permisosAdicionales.forEach((pa: any) => {
          if (!pa.permisos) return;
          if (pa.concedido === false) permisosSet.delete(pa.permisos.id);
          else permisosSet.set(pa.permisos.id, pa.permisos);
        });
      }

      return Array.from(permisosSet.values());
    } catch (err) {
      console.error('Error en obtenerPermisosUsuario:', err);
      return [];
    }
  };

  const otorgarPermisoUsuario = async (usuarioIdTarget: string, permisoId: string) => {
    try {
      const { error: err } = await supabase.from('usuario_permisos').insert({
        usuario_id: usuarioIdTarget,
        permiso_id: permisoId,
        otorgado_por: usuarioId,
      });

      if (err) throw err;
      await recargarPermisos();
    } catch (err) {
      console.error('Error otorgando permiso:', err);
      throw err;
    }
  };

  const removerPermisoUsuario = async (usuarioIdTarget: string, permisoId: string) => {
    try {
      const { error: err } = await supabase
        .from('usuario_permisos')
        .delete()
        .eq('usuario_id', usuarioIdTarget)
        .eq('permiso_id', permisoId);

      if (err) throw err;
      await recargarPermisos();
    } catch (err) {
      console.error('Error removiendo permiso:', err);
      throw err;
    }
  };

  const value: PermisosContextType = {
    permisos,
    roles,
    cargando,
    error,
    tienePermiso,
    recargarPermisos,
    todosLosPermisos,
    todosLosRoles,
    otorgarPermisoUsuario,
    removerPermisoUsuario,
    obtenerPermisosUsuario,
  };

  return (
    <PermisosContext.Provider value={value}>
      {children}
    </PermisosContext.Provider>
  );
};
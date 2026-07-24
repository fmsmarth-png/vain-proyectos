// src/hooks/usePermiso.ts
// FMS — Julio 2026
// Hook simple para verificar permisos en componentes

import { useContext } from 'react';
import { PermisosContext } from '../contexts/PermisosContext';

/**
 * Hook para verificar si el usuario tiene un permiso específico
 * 
 * Uso:
 * const { tienePermiso } = usePermiso();
 * 
 * if (tienePermiso('og_ver')) {
 *   // mostrar módulo OG
 * }
 */
export const usePermiso = () => {
  const context = useContext(PermisosContext);
  
  if (!context) {
    throw new Error('usePermiso debe usarse dentro de PermisosProvider');
  }

  return context;
};

/**
 * Hook especializado para proteger rutas
 */
export const useProtegePagina = (codigoPermiso: string) => {
  const { tienePermiso, cargando } = usePermiso();
  
  return {
    permitido: tienePermiso(codigoPermiso),
    cargando,
  };
};
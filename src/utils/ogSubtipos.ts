// src/utils/ogSubtipos.ts
// Constantes y helpers del módulo Revisión Tolerancias OG
// Fuente: App.pa.yaml (colMapaSubtipos) y scrAmbienteDetalle.pa.yaml de Revisión_OG.msapp
// FMS · Junio 2026

/** Mapa elemento → subtipoCod. Extraído de colMapaSubtipos en Power Apps. */
export const MAPA_SUBTIPOS: Record<string, string> = {
  VANO_PUERTA_ACCESO:        'P_ACC',
  VANO_VENTANA_LOGIA:        'V_LOGIA',
  VANO_PUERTAVENTANA_LC:     'V_PV',
  VANO_PUERTA_BAÑO_PASILLO:  'P_INT',
  VANO_PUERTA_BAÑO_D1:       'P_INT',
  VANO_PUERTA_D3:            'P_INT',
  VANO_PUERTA_D2:            'P_INT',
  VANO_PUERTA_D1:            'P_INT',
  VANO_VENTANA_D1:           'V_DOR',
  VANO_VENTANA_D2:           'V_DOR',
  VANO_VENTANA_D3:           'V_DOR',
};

/**
 * Ambientes estándar obra gruesa.
 * Fallback cuando og_config_ambientes está vacío.
 * IMPORTANTE: deben coincidir exactamente con og_catalogo.ambiente
 */
export const AMBIENTES_DEFAULT = [
  'Acceso',
  'Living Comedor',
  'Cocina',
  'Baño Pasillo',
  'Baño dormitorio 1',   // ← 'd' minúscula, igual que en og_catalogo
  'Dormitorio 1',
  'Dormitorio 2',
  'Dormitorio 3',
  'Pasillo',
];

/** Elementos por tipo. Fallback cuando og_elementos_detalle está vacío. */
export const ELEMENTOS_DEFAULT: Record<string, string[]> = {
  Vanos: [
    'VANO_PUERTA_ACCESO',
    'VANO_VENTANA_LOGIA',
    'VANO_PUERTAVENTANA_LC',
    'VANO_PUERTA_BAÑO_PASILLO',
    'VANO_PUERTA_D1',
    'VANO_PUERTA_D2',
    'VANO_PUERTA_D3',
    'VANO_VENTANA_D1',
    'VANO_VENTANA_D2',
    'VANO_VENTANA_D3',
  ],
  Muros: [
    'MURO_NORTE',
    'MURO_SUR',
    'MURO_ESTE',
    'MURO_OESTE',
    'MURO_INTERIOR_1',
    'MURO_INTERIOR_2',
    'MURO_MEDIANERO',
  ],
};

/** Revisiones disponibles por tipo de elemento. */
export const REVISIONES_POR_TIPO: Record<string, string[]> = {
  Muros: ['PLANEIDAD'],
  Vanos: ['ANCHO', 'PLOMO'],
};

/**
 * Mapeo tipoElemento-tipoRevision → parámetros de query en og_catalogo.
 * Fuente: lógica de btnMuros / btnVanos / btnPlomos en scrAmbienteDetalle.pa.yaml.
 */
export const OG_REVISION_QUERY: Record<string, { revision: string; itemRevision: string }> = {
  'Muros-PLANEIDAD': { revision: 'MURO',   itemRevision: 'PLANEIDAD' },
  'Vanos-ANCHO':     { revision: 'VANO',   itemRevision: 'ANCHO'     },
  'Vanos-PLOMO':     { revision: 'PIERNA', itemRevision: 'PLOMO'     },
};

/** Labels legibles para el usuario por tipo de revisión. */
export const LABEL_REVISION: Record<string, string> = {
  PLANEIDAD: '📏 Planeidad',
  ANCHO:     '↔️ Ancho',
  PLOMO:     '⬜ Plomos',
};

/**
 * Normaliza el nombre de ambiente para usarlo como clave en og_catalogo.
 * El catálogo ya tiene nombres VAIN (tras el buscar/reemplazar en Excel),
 * así que devolvemos el ambiente tal cual — sin transformación.
 */
export const normalizarAmbienteCatalogo = (ambiente: string): string => ambiente;

/** Devuelve el subtipoCod para el elemento seleccionado. '' si no aplica (muros). */
export const getSubtipoCod = (elemento: string): string =>
  MAPA_SUBTIPOS[elemento] ?? '';
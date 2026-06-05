export const lineaConfig: Record<string, { color: string; label: string }> = {
  celeste:  { color: '#67e8f9', label: 'Línea Celeste'  },
  amarilla: { color: '#fde047', label: 'Línea Amarilla' },
  verde:    { color: '#4ade80', label: 'Línea Verde'    },
  roja:     { color: '#f87171', label: 'Línea Roja'     },
  azul:     { color: '#60a5fa', label: 'Línea Azul'     },
  blanca:   { color: '#f9fafb', label: 'Línea Blanca'   },
};

export const lineas = Object.keys(lineaConfig);
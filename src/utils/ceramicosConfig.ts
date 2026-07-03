// src/utils/ceramicosConfig.ts
// Definición fija de ambientes e ítems para Levantamiento Cerámicos.
// No depende de catálogo en BD — son fijos a propósito (pantalla provisoria).

export interface AmbienteCeramico {
  nombre: string;
  items: string[];
}

export const AMBIENTES_CERAMICOS: AmbienteCeramico[] = [
  { nombre: 'Cocina', items: ['Piso', 'Muro'] },
  { nombre: 'Terraza', items: ['Piso'] },
  {
    nombre: 'Baño Dormitorio 1',
    items: ['Piso', 'Muro Monomando', 'Muro Largo Tina', 'Muro Pies Tina', 'Muro Espejo'],
  },
  {
    nombre: 'Baño Pasillo',
    items: ['Piso', 'Muro Monomando', 'Muro Largo Tina', 'Muro Pies Tina', 'Muro Espejo'],
  },
];

// checklist: { "Cocina": ["Piso"], "Baño Dormitorio 1": ["Piso", "Muro Monomando"], ... }
export type ChecklistCeramicos = Record<string, string[]>;

export function checklistVacio(): ChecklistCeramicos {
  return {};
}

export function toggleItem(
  checklist: ChecklistCeramicos,
  ambiente: string,
  item: string
): ChecklistCeramicos {
  const actuales = checklist[ambiente] ?? [];
  const yaMarcado = actuales.includes(item);
  const nuevos = yaMarcado ? actuales.filter((i) => i !== item) : [...actuales, item];

  const copia = { ...checklist };
  if (nuevos.length === 0) {
    delete copia[ambiente];
  } else {
    copia[ambiente] = nuevos;
  }
  return copia;
}

export function estaMarcado(checklist: ChecklistCeramicos, ambiente: string, item: string): boolean {
  return (checklist[ambiente] ?? []).includes(item);
}

export function contarMarcados(checklist: ChecklistCeramicos): number {
  return Object.values(checklist).reduce((acc, items) => acc + items.length, 0);
}

export function contarTotalItems(): number {
  return AMBIENTES_CERAMICOS.reduce((acc, a) => acc + a.items.length, 0);
}
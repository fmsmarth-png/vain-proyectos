// Motor de cálculo del programa general de obra
// Usa los mapas dia->frente reales extraídos del Excel

export interface Actividad {
  id: string;
  actividad: string;
  cuadrilla: string;
  tipo_secuencia: string;
  dia_inicio: number;
  orden: number;
  activo: boolean;
  mapa_dias: Record<string, string>; // {"114": "1F1", "115": "1F3", ...}
}

export interface PosicionActividad {
  actividad: string;
  cuadrilla: string;
  tipo_secuencia: string;
  frente: string | null;
  estado: 'activa' | 'no_iniciada' | 'terminada';
}

export interface PosicionConContexto {
  actividad: string;
  cuadrilla: string;
  tipo_secuencia: string;
  frente: string | null;
  estado: 'activa' | 'no_iniciada' | 'terminada';
  orden: number;
  diasRelativo: number;
  diaEnFrente: number;
}

export interface ResultadoCalculo {
  diaObra: number;
  posiciones: PosicionActividad[];
}

// Normaliza frente: "2f14" → "2F14"
export function normalizarFrente(frente: string): string {
  return frente.trim().toUpperCase();
}

// Extrae número de frente: "2F14" → 14
export function numeroFrente(frente: string): number | null {
  const match = normalizarFrente(frente).match(/^\d*F(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

// Extrae piso: "2F14" → 2
export function pisoFrente(frente: string): number | null {
  const match = normalizarFrente(frente).match(/^(\d+)F\d+$/);
  return match ? parseInt(match[1]) : null;
}

// Parsea "F13-14" → [13, 14]
export function parsearFrentesTorre(frenteTorre: string): number[] {
  const limpio = frenteTorre.replace(/F/gi, '').trim();
  return limpio.split('-').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
}

// Dado el frente del Moldaje, retorna el día de obra
export function diaObraDesde(
  frenteMoldaje: string,
  actividades: Actividad[]
): number | null {
  const f = normalizarFrente(frenteMoldaje);
  const moldaje = actividades.find(a => a.actividad === 'MOLDAJE MONOLITICO');
  if (!moldaje?.mapa_dias) return null;

  const entrada = Object.entries(moldaje.mapa_dias).find(([_, frente]) => frente === f);
  return entrada ? parseInt(entrada[0]) : null;
}

// Función principal: calcula posición de todas las actividades
export function calcularPosiciones(
  frenteMoldaje: string,
  actividades: Actividad[]
): ResultadoCalculo | null {
  const diaObra = diaObraDesde(frenteMoldaje, actividades);
  if (!diaObra) return null;

  const posiciones: PosicionActividad[] = actividades
    .filter(a => a.activo)
    .map(act => {
      const frente = act.mapa_dias?.[String(diaObra)] ?? null;
      const dias = Object.keys(act.mapa_dias ?? {}).map(Number);
      const minDia = Math.min(...dias);
      const maxDia = Math.max(...dias);

      let estado: 'activa' | 'no_iniciada' | 'terminada';
      if (diaObra < minDia) estado = 'no_iniciada';
      else if (diaObra > maxDia) estado = 'terminada';
      else estado = 'activa';

      return {
        actividad: act.actividad,
        cuadrilla: act.cuadrilla,
        tipo_secuencia: act.tipo_secuencia,
        frente,
        estado,
      };
    });

  return { diaObra, posiciones };
}

// Filtra posiciones que caen en una torre específica
export function posicionesPorTorre(
  posiciones: PosicionActividad[],
  numerosFrente: number[]
): PosicionActividad[] {
  return posiciones.filter(p => {
    if (!p.frente) return false;
    const num = numeroFrente(p.frente);
    return num !== null && numerosFrente.includes(num);
  });
}

// Dado el frente_depto de un depto, retorna actividad teórica + contexto
// Siempre retorna antes/despues aunque no haya actividad exactamente hoy
export function actividadTeoricaDepto(
  frenteDepto: string,
  actividades: Actividad[],
  diaObra: number
): {
  actual: PosicionConContexto | null;
  antes: PosicionConContexto[];
  despues: PosicionConContexto[];
} {
  const f = normalizarFrente(frenteDepto);

  const conDiaEnFrente: PosicionConContexto[] = actividades
    .filter(a => a.activo && a.mapa_dias)
    .reduce<PosicionConContexto[]>((acc, act) => {
      const entrada = Object.entries(act.mapa_dias).find(([_, frente]) => frente === f);
      if (!entrada) return acc;
      const diaEnFrente = parseInt(entrada[0]);
      acc.push({
        actividad: act.actividad,
        cuadrilla: act.cuadrilla,
        tipo_secuencia: act.tipo_secuencia,
        frente: diaEnFrente === diaObra ? f : null,
        estado: 'activa',
        orden: act.orden,
        diaEnFrente,
        diasRelativo: diaEnFrente - diaObra,
      });
      return acc;
    }, [])
    .sort((a, b) => a.diaEnFrente - b.diaEnFrente);

  if (conDiaEnFrente.length === 0) return { actual: null, antes: [], despues: [] };

  const actual  = conDiaEnFrente.find(a => a.diasRelativo === 0) ?? null;
  const antes   = conDiaEnFrente.filter(a => a.diasRelativo < 0).slice(-2);
  const despues = conDiaEnFrente.filter(a => a.diasRelativo > 0).slice(0, 2);

  return { actual, antes, despues };
}

// Calcula desfase en días: positivo = adelanto, negativo = atraso
export function calcularDesfase(
  actividadReal: Actividad,
  actividadTeorica: Actividad
): number {
  return actividadTeorica.dia_inicio - actividadReal.dia_inicio;
}

// Agrupa actividades por cuadrilla para el selector
export function agruparPorCuadrilla(
  actividades: Actividad[]
): Record<string, Actividad[]> {
  return actividades
    .filter(a => a.activo)
    .reduce((acc, act) => {
      if (!acc[act.cuadrilla]) acc[act.cuadrilla] = [];
      acc[act.cuadrilla].push(act);
      return acc;
    }, {} as Record<string, Actividad[]>);
}
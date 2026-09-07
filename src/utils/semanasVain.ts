/**
 * Calendario de semanas VAIN.
 *
 * No se puede derivar matemáticamente: las semanas se asignan al mes según el
 * criterio de obra, no por la fecha del lunes. Por ejemplo la semana del 20 al
 * 24 de abril es "MAYO 1", no "ABRIL 5". Por eso la tabla es un dato literal.
 *
 * Cobertura: 15-12-2025 a 11-12-2026. Antes del 01-01-2027 hay que extenderla.
 */

export interface SemanaVain {
  num: number;
  mes: string;
  semana: number | null; // null = VACACIONES
  lunes: string;         // yyyy-mm-dd
  viernes: string;       // yyyy-mm-dd
}

export const tablaSemanas: SemanaVain[] = [
  { num: 1, mes: 'ENERO', semana: 1, lunes: '2025-12-15', viernes: '2025-12-19' },
  { num: 2, mes: 'VACACIONES', semana: null, lunes: '2025-12-22', viernes: '2025-12-26' },
  { num: 3, mes: 'VACACIONES', semana: null, lunes: '2025-12-29', viernes: '2026-01-02' },
  { num: 4, mes: 'ENERO', semana: 2, lunes: '2026-01-05', viernes: '2026-01-09' },
  { num: 5, mes: 'ENERO', semana: 3, lunes: '2026-01-12', viernes: '2026-01-16' },
  { num: 6, mes: 'ENERO', semana: 4, lunes: '2026-01-19', viernes: '2026-01-23' },
  { num: 7, mes: 'FEBRERO', semana: 1, lunes: '2026-01-26', viernes: '2026-01-30' },
  { num: 8, mes: 'FEBRERO', semana: 2, lunes: '2026-02-02', viernes: '2026-02-06' },
  { num: 9, mes: 'FEBRERO', semana: 3, lunes: '2026-02-09', viernes: '2026-02-13' },
  { num: 10, mes: 'FEBRERO', semana: 4, lunes: '2026-02-16', viernes: '2026-02-20' },
  { num: 11, mes: 'MARZO', semana: 1, lunes: '2026-02-23', viernes: '2026-02-27' },
  { num: 12, mes: 'MARZO', semana: 2, lunes: '2026-03-02', viernes: '2026-03-06' },
  { num: 13, mes: 'MARZO', semana: 3, lunes: '2026-03-09', viernes: '2026-03-13' },
  { num: 14, mes: 'MARZO', semana: 4, lunes: '2026-03-16', viernes: '2026-03-20' },
  { num: 15, mes: 'ABRIL', semana: 1, lunes: '2026-03-23', viernes: '2026-03-27' },
  { num: 16, mes: 'ABRIL', semana: 2, lunes: '2026-03-30', viernes: '2026-04-03' },
  { num: 17, mes: 'ABRIL', semana: 3, lunes: '2026-04-06', viernes: '2026-04-10' },
  { num: 18, mes: 'ABRIL', semana: 4, lunes: '2026-04-13', viernes: '2026-04-17' },
  { num: 19, mes: 'MAYO', semana: 1, lunes: '2026-04-20', viernes: '2026-04-24' },
  { num: 20, mes: 'MAYO', semana: 2, lunes: '2026-04-27', viernes: '2026-05-01' },
  { num: 21, mes: 'MAYO', semana: 3, lunes: '2026-05-04', viernes: '2026-05-08' },
  { num: 22, mes: 'MAYO', semana: 4, lunes: '2026-05-11', viernes: '2026-05-15' },
  { num: 23, mes: 'JUNIO', semana: 1, lunes: '2026-05-18', viernes: '2026-05-22' },
  { num: 24, mes: 'JUNIO', semana: 2, lunes: '2026-05-25', viernes: '2026-05-29' },
  { num: 25, mes: 'JUNIO', semana: 3, lunes: '2026-06-01', viernes: '2026-06-05' },
  { num: 26, mes: 'JUNIO', semana: 4, lunes: '2026-06-08', viernes: '2026-06-12' },
  { num: 27, mes: 'JUNIO', semana: 5, lunes: '2026-06-15', viernes: '2026-06-19' },
  { num: 28, mes: 'JULIO', semana: 1, lunes: '2026-06-22', viernes: '2026-06-26' },
  { num: 29, mes: 'JULIO', semana: 2, lunes: '2026-06-29', viernes: '2026-07-03' },
  { num: 30, mes: 'JULIO', semana: 3, lunes: '2026-07-06', viernes: '2026-07-10' },
  { num: 31, mes: 'JULIO', semana: 4, lunes: '2026-07-13', viernes: '2026-07-17' },
  { num: 32, mes: 'AGOSTO', semana: 1, lunes: '2026-07-20', viernes: '2026-07-24' },
  { num: 33, mes: 'AGOSTO', semana: 2, lunes: '2026-07-27', viernes: '2026-07-31' },
  { num: 34, mes: 'AGOSTO', semana: 3, lunes: '2026-08-03', viernes: '2026-08-07' },
  { num: 35, mes: 'AGOSTO', semana: 4, lunes: '2026-08-10', viernes: '2026-08-14' },
  { num: 36, mes: 'SEPTIEMBRE', semana: 1, lunes: '2026-08-17', viernes: '2026-08-21' },
  { num: 37, mes: 'SEPTIEMBRE', semana: 2, lunes: '2026-08-24', viernes: '2026-08-28' },
  { num: 38, mes: 'SEPTIEMBRE', semana: 3, lunes: '2026-08-31', viernes: '2026-09-04' },
  { num: 39, mes: 'SEPTIEMBRE', semana: 4, lunes: '2026-09-07', viernes: '2026-09-11' },
  { num: 40, mes: 'OCTUBRE', semana: 1, lunes: '2026-09-14', viernes: '2026-09-18' },
  { num: 41, mes: 'OCTUBRE', semana: 2, lunes: '2026-09-21', viernes: '2026-09-25' },
  { num: 42, mes: 'OCTUBRE', semana: 3, lunes: '2026-09-28', viernes: '2026-10-02' },
  { num: 43, mes: 'OCTUBRE', semana: 4, lunes: '2026-10-05', viernes: '2026-10-09' },
  { num: 44, mes: 'OCTUBRE', semana: 5, lunes: '2026-10-12', viernes: '2026-10-16' },
  { num: 45, mes: 'NOVIEMBRE', semana: 1, lunes: '2026-10-19', viernes: '2026-10-23' },
  { num: 46, mes: 'NOVIEMBRE', semana: 2, lunes: '2026-10-26', viernes: '2026-10-30' },
  { num: 47, mes: 'NOVIEMBRE', semana: 3, lunes: '2026-11-02', viernes: '2026-11-06' },
  { num: 48, mes: 'NOVIEMBRE', semana: 4, lunes: '2026-11-09', viernes: '2026-11-13' },
  { num: 49, mes: 'DICIEMBRE', semana: 1, lunes: '2026-11-16', viernes: '2026-11-20' },
  { num: 50, mes: 'DICIEMBRE', semana: 2, lunes: '2026-11-23', viernes: '2026-11-27' },
  { num: 51, mes: 'DICIEMBRE', semana: 3, lunes: '2026-11-30', viernes: '2026-12-04' },
  { num: 52, mes: 'DICIEMBRE', semana: 4, lunes: '2026-12-07', viernes: '2026-12-11' },
];

const aFechaLocal = (f: Date) => new Date(f.getFullYear(), f.getMonth(), f.getDate());

/** yyyy-mm-dd en hora local (no UTC, para no correrse un día) */
const aClave = (f: Date) => {
  const mes = String(f.getMonth() + 1).padStart(2, '0');
  const dia = String(f.getDate()).padStart(2, '0');
  return `${f.getFullYear()}-${mes}-${dia}`;
};

/** Lunes de la semana a la que pertenece la fecha */
const lunesDeLaSemana = (f: Date) => {
  const d = aFechaLocal(f);
  const dow = d.getDay();              // 0 = domingo
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
};

/**
 * Semana VAIN de una fecha, resuelta por el lunes de esa semana. Así una
 * observación tomada sábado o domingo cae en la semana correcta; la versión
 * anterior buscaba lunes<=fecha<=viernes y los fines de semana terminaban en
 * un fallback fijo que los archivaba todos en la misma semana equivocada.
 *
 * Devuelve null si la fecha queda fuera del calendario cargado.
 */
export const buscarSemana = (fecha: Date): SemanaVain | null => {
  const clave = aClave(lunesDeLaSemana(fecha));
  return tablaSemanas.find(s => s.lunes === clave) ?? null;
};

/**
 * Nombre tal como se almacena en `semana_creacion` (ej: "JULIO 3",
 * "VACACIONES"). null si la fecha está fuera del calendario.
 */
export const nombreSemana = (fecha: Date): string | null => {
  const s = buscarSemana(fecha);
  if (!s) return null;
  return s.semana ? `${s.mes} ${s.semana}` : 'VACACIONES';
};

/** Nombre de la semana de hoy */
export const nombreSemanaActual = (): string | null => nombreSemana(new Date());

/** Convierte "dd/mm/aaaa" a Date. null si el formato no calza. */
export const fechaDesdeDdMmAaaa = (texto: string): Date | null => {
  // Acepta tanto dd/mm/aaaa como dd-mm-aaaa (algunos orígenes de datos, o un
  // copy/paste desde una hoja de cálculo, pueden guardar/mostrar la fecha
  // con guion en vez de barra — sin esto, el parseo fallaba en silencio y
  // cualquier comparación de fechas que dependiera de él (ej. detectar
  // visitas adelantadas) simplemente no hacía nada, sin ningún error visible).
  const m = (texto ?? '').match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  return new Date(Number(aaaa), Number(mm) - 1, Number(dd));
};
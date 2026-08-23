// src/utils/parsearAyni.ts
// FMS — procesamiento de la planilla cruda de AYNI (hoja "Requerimientos")
// Toda la lógica validada contra la planilla real de 653 líneas:
//   recibido = J - K (K vacío = 0) · filtra servicios · solo COMPRADO suma stock · agrupa por material+unidad
import * as XLSX from 'xlsx';

// ── Configuración de filtros (ajustable) ────────────────────────────────────
const FAMILIAS_SERVICIO = new Set([
  'ENSAYOS Y ESTUDIOS', 'FLETES Y TRASLADOS', 'SERVICIOS VARIOS',
  'MARKETING Y PUBLICIDAD', 'SEGURIDAD DE OBRA',
]);
const PALABRAS_SERVICIO = /\b(SERVICIO|REPARACION|REPARACIÓN|RETIRO|ARRIENDO|MANTENCION|MANTENCIÓN|INSTALACION DE FAENA|PROVISION E INSTALACION|VIAJE A TERRENO|LABORATORISTA|GUARDIAS?)\b/i;

// Nombres EXACTOS de las columnas de AYNI (header en la fila 4 → índice 3)
const COL = {
  fecha: 'Fecha requerida',
  descripcion: 'Descripción',
  familia: 'Familia de compra',
  unidadRequerimiento: 'Unidad requerimiento',
  unidadCompra: 'Un. presentación compra',
  comprado: 'Cantidad comprada un. presentación compra',           // J
  porRecepcionar: 'Cantidad por recepcionar un. Presentación compra', // K
  estadoReq: 'Estado requerimiento',
  estadoOC: 'Estado OC',
  nOC: 'N° OC',
  actividad: 'Actividad / Uso',
};

// ── Conversión de unidad de compra → unidad de solicitud ────────────────────
// Problema real: AYNI trae el material comprado en unidad de EMPAQUE (ej.
// "TAMBOR 200 L", "SACO 25 KG"), pero en obra se pide y descuenta en la
// unidad de USO (ej. litros, kilos) — pedir "5" no debe significar 5 tambores.
//
// Estrategia deliberadamente conservadora: solo se calcula el factor
// automáticamente cuando es matemáticamente seguro. Nunca se adivina una
// equivalencia entre magnitudes distintas (ej. litros vs kilos depende de la
// densidad del producto, que no tenemos).
//
// Casos que SÍ se resuelven solos:
//   A) La unidad de empaque trae un número + la MISMA unidad de requerimiento
//      (ej. "TAMBOR 200 L" con requerimiento en L → factor 200).
//   B) Cambio de prefijo métrico puro, misma magnitud física
//      (mililitros↔litros, toneladas↔kilos). Nunca masa↔volumen.
// Todo lo demás queda con factor 1 (se sigue pidiendo en la unidad de compra,
// como hoy) hasta que el jefe de bodega lo defina a mano.
const UNIDADES_CONOCIDAS = ['KG', 'M2', 'M3', 'ML', 'TON', 'L', 'M', 'UN'];
const CONVERSIONES_SEGURAS: Record<string, Record<string, number>> = {
  ML: { L: 0.001 },
  TON: { KG: 1000 },
};

interface FactorResultado {
  factor: number;
  unidadSolicitud: string;
}

function calcularFactorConversion(unidadCompraRaw: string, unidadRequerimientoRaw: string): FactorResultado {
  const unCompra = normalizar(unidadCompraRaw);
  const unReq = normalizar(unidadRequerimientoRaw);

  // Sin dato suficiente, o ya coinciden tal cual: sin conversión.
  if (!unCompra || !unReq) return { factor: 1, unidadSolicitud: unCompra || unReq };
  if (unCompra === unReq) return { factor: 1, unidadSolicitud: unReq };

  const limpio = unCompra.replace(/\(.*?\)/g, '').trim(); // ej. "JUEGO 25 KG (A+B)" → "JUEGO 25 KG"

  // Caso especial: la unidad de compra es una unidad conocida "pelada", sin
  // número (ej. "TON", "KG") — implica cantidad 1 de esa unidad.
  let cantidad: number | null;
  let unidadExtraida: string;
  if (UNIDADES_CONOCIDAS.includes(limpio)) {
    cantidad = 1;
    unidadExtraida = limpio;
  } else {
    const patron = new RegExp(`([\\d.,]+)\\s*(${UNIDADES_CONOCIDAS.join('|')})\\s*$`);
    const m = limpio.match(patron);
    if (!m) return { factor: 1, unidadSolicitud: unCompra }; // no parseable: se queda como está (sin bloquear)
    cantidad = num(m[1]);
    unidadExtraida = m[2];
  }
  if (cantidad === null || cantidad <= 0) return { factor: 1, unidadSolicitud: unCompra };

  // Caso A: la unidad extraída ya es la de requerimiento
  if (unidadExtraida === unReq) return { factor: cantidad, unidadSolicitud: unReq };

  // Caso B: conversión métrica pura y segura
  const multiplicador = CONVERSIONES_SEGURAS[unidadExtraida]?.[unReq];
  if (multiplicador) return { factor: cantidad * multiplicador, unidadSolicitud: unReq };

  // Cualquier otro caso (distinta magnitud, ambiguo, etc.): no se adivina.
  return { factor: 1, unidadSolicitud: unCompra };
}

export interface LineaAyni {
  nombre: string;
  familia: string;
  unidad: string;
  unidad_requerimiento: string;
  comprado_j: number | null;
  por_recepcionar_k: number | null;
  recibido: number;
  estado_req: string;
  estado_oc: string;
  n_oc: string;
  fecha_requerida: string;
  actividad: string;
  clasificacion: 'MATERIAL' | 'SERVICIO';
}

export interface MaterialAgrupado {
  nombre: string;
  unidad: string;               // unidad de compra (la que reporta AYNI)
  unidad_solicitud: string;     // unidad en la que se pide/descuenta en obra
  factor_conversion: number;    // cuántas "unidad_solicitud" trae 1 "unidad" de compra
  familia: string;
  especialidad: string; // se deja vacío; se mapea después si se quiere
  recibido: number;
  n_lineas_oc: number;
}

export interface ResultadoParseo {
  lineas: LineaAyni[];          // todas las líneas (para histórico/ficha)
  materiales: MaterialAgrupado[]; // solo MATERIAL + COMPRADO, agrupado (para stock)
  resumen: {
    total: number;
    servicios: number;
    noComprados: number;
    materialesUnicos: number;
    conStock: number;
    conConversionUnidad: number; // materiales donde factor_conversion !== 1 (revisar antes de confirmar)
  };
}

// Parser de número chileno: punto = miles cuando hay 3 dígitos, coma = decimal
function num(x: any): number | null {
  if (x === null || x === undefined || x === '') return null;
  if (typeof x === 'number') return x;
  let s = String(x).trim();
  if (s === '') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.')) {
    const partes = s.split('.');
    if (partes.length === 2 && partes[1].length === 3) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function normalizar(s: any): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function clasificar(familia: string, desc: string): 'MATERIAL' | 'SERVICIO' {
  if (FAMILIAS_SERVICIO.has(familia.toUpperCase())) return 'SERVICIO';
  if (PALABRAS_SERVICIO.test(desc)) return 'SERVICIO';
  return 'MATERIAL';
}

// Detecta en qué fila está el encabezado real buscando la celda "Descripción".
// Evita depender de un número de fila fijo: distintos exports de AYNI han
// traído el header en la fila 1 y en la fila 4. Si no la encuentra, usa la
// fila 4 (índice 3) como respaldo, que era el supuesto original.
function detectarFilaHeader(hoja: XLSX.WorkSheet): number {
  const filasCrudas: any[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });
  for (let i = 0; i < Math.min(filasCrudas.length, 15); i++) {
    const fila = filasCrudas[i];
    if (fila.some(celda => normalizar(celda) === normalizar(COL.descripcion))) {
      return i;
    }
  }
  return 3; // respaldo: supuesto original (fila 4)
}

// Lee el archivo como ArrayBuffer usando FileReader en vez de file.arrayBuffer().
// Motivo: en el WebView de iOS, un archivo elegido desde la app Archivos/iCloud
// puede llegar de forma "diferida" (aún no descargado de la nube), y ahí
// file.arrayBuffer() a veces resuelve con datos vacíos o falla en silencio.
// FileReader.readAsArrayBuffer espera correctamente a que iOS materialice el
// archivo. En Android/escritorio se comporta igual que arrayBuffer(), así que
// es seguro usarlo en todas las plataformas. El jefe de bodega usa iPhone y es
// el primer usuario en cargar la planilla, por eso se prioriza este camino.
function leerArchivoComoArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo (¿está descargado de iCloud?)'));
    reader.readAsArrayBuffer(file);
  });
}

export async function parsearAyni(file: File): Promise<ResultadoParseo> {
  const buf = await leerArchivoComoArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const hoja = wb.Sheets['Requerimientos'] ?? wb.Sheets[wb.SheetNames[0]];

  const filaHeader = detectarFilaHeader(hoja);
  const filas: any[] = XLSX.utils.sheet_to_json(hoja, { range: filaHeader, defval: '' });

  const lineas: LineaAyni[] = [];
  for (const f of filas) {
    const nombre = normalizar(f[COL.descripcion]);
    if (!nombre) continue; // saltar filas vacías o de totales

    const familia = String(f[COL.familia] ?? '').trim();
    const j = num(f[COL.comprado]);
    const k = num(f[COL.porRecepcionar]);
    const recibido = j !== null ? j - (k ?? 0) : 0;
    const clasificacion = clasificar(familia, nombre);

    lineas.push({
      nombre,
      familia,
      unidad: String(f[COL.unidadCompra] ?? '').trim(),
      unidad_requerimiento: String(f[COL.unidadRequerimiento] ?? '').trim(),
      comprado_j: j,
      por_recepcionar_k: k,
      recibido,
      estado_req: String(f[COL.estadoReq] ?? '').trim(),
      estado_oc: String(f[COL.estadoOC] ?? '').trim(),
      n_oc: String(f[COL.nOC] ?? '').trim(),
      fecha_requerida: String(f[COL.fecha] ?? '').trim(),
      actividad: String(f[COL.actividad] ?? '').trim(),
      clasificacion,
    });
  }

  // Agrupar solo MATERIAL + COMPRADO por nombre+unidad, sumando recibido
  const mapa = new Map<string, MaterialAgrupado>();
  let noComprados = 0, servicios = 0;
  for (const l of lineas) {
    if (l.clasificacion === 'SERVICIO') { servicios++; continue; }
    if (l.estado_req !== 'COMPRADO') { noComprados++; continue; }
    const key = `${l.nombre}||${l.unidad}`;
    const existe = mapa.get(key);
    if (existe) {
      existe.recibido += l.recibido;
      existe.n_lineas_oc += 1;
    } else {
      const { factor, unidadSolicitud } = calcularFactorConversion(l.unidad, l.unidad_requerimiento);
      mapa.set(key, {
        nombre: l.nombre, unidad: l.unidad, unidad_solicitud: unidadSolicitud, factor_conversion: factor,
        familia: l.familia, especialidad: '', recibido: l.recibido, n_lineas_oc: 1,
      });
    }
  }

  const materiales = Array.from(mapa.values()).sort((a, b) =>
    a.familia.localeCompare(b.familia) || a.nombre.localeCompare(b.nombre));

  return {
    lineas,
    materiales,
    resumen: {
      total: lineas.length,
      servicios,
      noComprados,
      materialesUnicos: materiales.length,
      conStock: materiales.filter(m => m.recibido > 0).length,
      conConversionUnidad: materiales.filter(m => m.factor_conversion !== 1).length,
    },
  };
}
import { pdfjsLib } from './pdfWorkerSetup';

/**
 * Lee el Acta de Pre Entrega ORIGINAL — el documento que ya trae la
 * inmobiliaria con el proyecto/depto/propietario/fecha de promesa ya
 * definidos (normalmente impreso en blanco, sin observaciones ni banco, para
 * llenarse a mano durante la visita y volver a subirse después). Nuestra app
 * replica exactamente este mismo formato de texto en pdfActaPreEntrega.ts,
 * por eso el parser puede anclarse a frases fijas de esa plantilla.
 *
 * OJO — esto NO reemplaza al inspector actual: el firmante de la derecha
 * ("p.<inmobiliaria>") es quien representó a la inmobiliaria cuando se firmó
 * la PROMESA (normalmente un vendedor, en otra fecha), no quien hace la
 * pre-entrega hoy. Por eso se expone como `representanteVenta*` aparte, y
 * nunca se debe usar para pisar `inspectorNombre`/`inspectorRut` en
 * PreEntregaDepto.tsx (esos ya se autocompletan solos desde el usuario
 * logueado).
 *
 * OJO 2 — esto lee texto embebido del PDF, no hace OCR. Si el banco o las
 * observaciones quedaron llenados A MANO en una copia impresa y luego
 * escaneada como imagen, esos campos no se pueden leer (banco/observaciones
 * suelen venir en blanco de todas formas: se completan en la inspección real,
 * no en este documento).
 */

export interface DatosActaPreEntregaPdf {
  // Para matchear proyecto/torre/depto contra el catálogo (igual que en
  // extraerPapeletaPdf.ts): texto crudo tal cual viene en el PDF.
  proyecto: string;       // "SAN IGNACIO 2" (ya sin el prefijo "CONDOMINIO ")
  deptoNumero: string;    // "415"
  edificio: string;       // "EUCALIPTUS" (torre)
  ciudad: string;         // "SANTIAGO"

  // Para agendar en el calendario
  fechaAtencion: string;  // "DD-MM-YYYY"
  horaAtencion: string;   // "HH:MM:SS"

  // Para precargar el formulario "Datos del acta" de PreEntregaDepto.tsx
  procesoVenta: string;              // "17582"
  propietarioNombre: string;
  propietarioRut: string;            // "13.471.078-0" (sin espacios alrededor del guion)
  fechaPromesaIso: string;           // "YYYY-MM-DD", listo para <input type="date">
  fechaPromesaLarga: string;         // "19 de Agosto de 2026" (por si se quiere mostrar tal cual)
  nombreLegal: string;               // "INMOBILIARIA SAN IGNACIO S.A." — para cruzar contra proyectos.acta_nombre_legal
  banco: string;                     // '' si el documento vino sin llenar (lo normal)

  // Solo informativo — NUNCA usar para inspectorNombre/inspectorRut.
  representanteVentaNombre: string;
  representanteVentaRut: string;
}

interface Celda {
  str: string;
  x: number;
  y: number;
  page: number;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const norm = (s: any) =>
  (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** "19 de Agosto de 2026" -> "2026-08-19". Devuelve '' si no calza el formato. */
const fechaLargaAIso = (texto: string): string => {
  if (!texto) return '';
  const m = norm(texto).match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i);
  if (!m) return '';
  const dia = m[1].padStart(2, '0');
  const mesIdx = MESES.indexOf(m[2]);
  if (mesIdx === -1) return '';
  const mes = String(mesIdx + 1).padStart(2, '0');
  return `${m[3]}-${mes}-${dia}`;
};

/** "13.471.078 - 0" -> "13.471.078-0" (el formulario de PreEntregaDepto.tsx no usa espacios). */
const desespaciarRut = (rut: string): string => (rut || '').replace(/\s*-\s*/, '-').trim();

function leerArchivoComoArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo (¿está descargado de iCloud?)'));
    reader.readAsArrayBuffer(file);
  });
}

export async function extraerActaPreEntregaPdf(file: File): Promise<DatosActaPreEntregaPdf> {
  const buffer = await leerArchivoComoArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  const celdas: Celda[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // Array.from + índice numérico, no for...of: for...of sobre tc.items
    // falla en el WebView de iOS si no expone Symbol.iterator (ver el mismo
    // comentario en extraerPapeletaPdf.ts).
    const items: any[] = Array.isArray(tc.items) ? tc.items : Array.from(tc.items || []);
    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      if (!raw || !raw.transform) continue;
      const str = (raw.str || '').replace(/\s+/g, ' ').trim();
      if (!str) continue;
      celdas.push({ str, x: raw.transform[4], y: raw.transform[5], page: p });
    }
  }

  if (celdas.length === 0) {
    throw new Error('El PDF no tiene texto legible (¿es una imagen escaneada?).');
  }

  const enOrden = (arr: Celda[]) =>
    arr.slice().sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x).map(c => c.str).join(' ');
  const todo = enOrden(celdas);

  const g = (re: RegExp): string => {
    const m = todo.match(re);
    return m ? m[1].trim() : '';
  };

  // ---------- Header: cada campo es un ítem de texto limpio propio ----------
  const condominioItem = celdas.find(c => /^CONDOMINIO\s+/i.test(c.str));
  const proyecto = condominioItem ? condominioItem.str.replace(/^CONDOMINIO\s+/i, '').trim() : '';

  const deptoItem = celdas.find(c => /^Departamento N[°º]/i.test(c.str));
  const mDepto = deptoItem
    ? deptoItem.str.match(/Departamento N[°º]\s*([^\s,]+),?\s*(?:edificio\s+(.+))?$/i)
    : null;
  const deptoNumero = mDepto?.[1] ?? '';
  const edificio = (mDepto?.[2] ?? '').trim();

  const procesoItem = celdas.find(c => /^Proceso de venta/i.test(c.str));
  const procesoVenta = procesoItem
    ? (procesoItem.str.match(/Proceso de venta N[°ºo]\s*(\S+)/i)?.[1] ?? '')
    : '';

  const fechaItem = celdas.find(c => /^Fecha:/i.test(c.str));
  const mFecha = fechaItem
    ? fechaItem.str.match(/Fecha:\s*(\d{2}-\d{2}-\d{4})\s*(\d{2}:\d{2}(?::\d{2})?)?/i)
    : null;
  const fechaAtencion = mFecha?.[1] ?? '';
  const horaAtencion = mFecha?.[2] ?? '';

  // ---------- Párrafo 1: ciudad, fecha de promesa, propietario, nombre legal ----------
  const ciudad = g(/En\s+([A-ZÁÉÍÓÚÑ\s]+?),\s*a\s+\d{1,2}\s+de/i);
  const fechaPromesaLarga = g(/suscrita con fecha\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})\s+entre don/i);
  const propietarioNombre = g(/entre don\(ña\)\s+(.+?)\s+y la\s+/i);
  const nombreLegal = g(/y la\s+(.+?),\s*don\(ña\)/i);

  // ---------- Punto 9: banco (vacío si el documento quedó con los guiones bajos de la plantilla) ----------
  const banco = g(/cr[eé]dito hipotecario es\s+([^_.]+?)\./i);

  // ---------- Firmas: columna izquierda = propietario, derecha = representante de venta ----------
  const UMBRAL_COLUMNA_X = 200; // ver extraerPapeletaPdf.ts: bordes de columna por posición real
  const nombresLeft = celdas.find(c => c.str.startsWith('Nombres:') && c.x < UMBRAL_COLUMNA_X);
  const nombresRight = celdas.find(c => c.str.startsWith('Nombres:') && c.x >= UMBRAL_COLUMNA_X);
  const propietarioNombreFirma = nombresLeft ? nombresLeft.str.replace(/^Nombres:\s*/i, '').trim() : '';
  const representanteVentaNombre = nombresRight ? nombresRight.str.replace(/^Nombres:\s*/i, '').trim() : '';

  const TOL_Y = 2;
  const rutLabels = celdas.filter(c => c.str === 'RUT:');
  const rutLeftLabel = rutLabels.find(c => c.x < UMBRAL_COLUMNA_X);
  const rutRightLabel = rutLabels.find(c => c.x >= UMBRAL_COLUMNA_X);
  const rutLeftValue = rutLeftLabel
    ? celdas.find(c => Math.abs(c.y - rutLeftLabel.y) < TOL_Y && c.x > rutLeftLabel.x && c.x < UMBRAL_COLUMNA_X)
    : undefined;
  const rutRightValue = rutRightLabel
    ? celdas.find(c => Math.abs(c.y - rutRightLabel.y) < TOL_Y && c.x > rutRightLabel.x)
    : undefined;

  return {
    proyecto,
    deptoNumero,
    edificio,
    ciudad,
    fechaAtencion,
    horaAtencion,
    procesoVenta,
    // El nombre/rut de la firma (pie del acta) es más confiable que el del
    // párrafo 1 (ahí puede llevar tildes distintas por el salto de línea del
    // splitTextToSize de jsPDF); se usa como fuente principal, con el párrafo
    // 1 de respaldo por si el documento no trajera bloque de firmas.
    propietarioNombre: propietarioNombreFirma || propietarioNombre,
    propietarioRut: desespaciarRut(rutLeftValue?.str ?? ''),
    fechaPromesaIso: fechaLargaAIso(fechaPromesaLarga),
    fechaPromesaLarga,
    nombreLegal,
    banco,
    representanteVentaNombre,
    representanteVentaRut: desespaciarRut(rutRightValue?.str ?? ''),
  };
}

export default extraerActaPreEntregaPdf;
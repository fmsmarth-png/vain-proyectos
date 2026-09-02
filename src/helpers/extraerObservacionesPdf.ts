import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

export interface ObservacionPdf {
  numero: string;
  ambiente: string;
  descripcion: string;
}

interface Celda {
  str: string;
  x: number;
  y: number;
  page: number;
}

const TOL_Y = 2; // tolerancia vertical en puntos

/**
 * Extrae las observaciones de una papeleta de Post Venta.
 *
 * Por qué NO se usa texto plano:
 * pdf.js concatena las celdas y el resultado es ambiguo — "1   BAÑO 1   Puerta..."
 * tiene exactamente la misma forma que "...marco 2   DORMITORIO 1   Puerta...".
 * Ningún regex puede distinguir el N° de ítem del número del ambiente.
 *
 * Por qué NO basta agrupar por Y:
 * en este template la descripción se dibuja alineada al TOPE de la celda,
 * mientras el ambiente queda más abajo. Es decir, la descripción de la fila N
 * tiene un Y MAYOR que su propio número de ítem.
 *
 * Algoritmo: los números de ítem son anclas de fila. Cada celda se asigna
 * al ancla de mayor Y que sea <= Y de la celda (la primera fila que queda
 * a su altura o por debajo). Las columnas se separan por posición X real.
 */
export async function extraerObservacionesPdf(file: File): Promise<ObservacionPdf[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  // 1) Recolectar todas las celdas con su posición real
  const celdas: Celda[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items || []; // Fallback a array vacío si tc.items es undefined
    for (const raw of items as any[]) {
      const str = (raw.str || '').replace(/\s+/g, ' ').trim();
      if (!str) continue;
      celdas.push({ str, x: raw.transform[4], y: raw.transform[5], page: p });
    }
  }

  // 2) Delimitar la tabla: encabezado "Item" ... "Notas:"
  const header = celdas.find((c) => /^item$/i.test(c.str));
  if (!header) throw new Error('No se encontró la tabla "Lista Requerimientos" en el PDF.');

  const notas = celdas.find(
    (c) => /^notas:?$/i.test(c.str) && (c.page > header.page || c.y < header.y)
  );

  // Columna "Estado" marca el fin del área útil (a la derecha solo hay celdas vacías)
  const estado = celdas.find(
    (c) => /^estado$/i.test(c.str) && c.page === header.page && Math.abs(c.y - header.y) < TOL_Y
  );
  const xMax = estado ? estado.x - 5 : Infinity;

  const despuesDelHeader = (c: Celda) =>
    c.page > header.page || (c.page === header.page && c.y < header.y - TOL_Y);
  const antesDeNotas = (c: Celda) =>
    !notas || c.page < notas.page || (c.page === notas.page && c.y > notas.y + TOL_Y);

  const tabla = celdas.filter(
    (c) => despuesDelHeader(c) && antesDeNotas(c) && c.x < xMax
  );

  if (tabla.length === 0) return [];

  // 3) Anclas de fila = números de ítem (dígitos puros en la columna más a la izquierda)
  const xMin = Math.min(...tabla.map((c) => c.x));
  const anclas = tabla
    .filter((c) => /^\d+$/.test(c.str) && c.x <= xMin + 8)
    .sort((a, b) => a.page - b.page || b.y - a.y);

  if (anclas.length === 0) return [];

  const contenido = tabla.filter((c) => !anclas.includes(c));

  // 4) Borde ambiente / descripción: mayor salto de X entre las celdas de contenido
  //    (item→ambiente son ~10pt; ambiente→descripción son >100pt)
  const xs = Array.from(new Set(contenido.map((c) => Math.round(c.x)))).sort((a, b) => a - b);

  let borde = xMin + 100; // fallback si solo hay una columna con datos
  if (xs.length >= 2) {
    let mayorSalto = -1;
    for (let i = 1; i < xs.length; i++) {
      const salto = xs[i] - xs[i - 1];
      if (salto > mayorSalto) {
        mayorSalto = salto;
        borde = (xs[i] + xs[i - 1]) / 2;
      }
    }
  }

  // 5) Asignar cada celda a su fila: primera ancla cuyo Y sea <= Y de la celda
  const filas: Celda[][] = anclas.map(() => []);

  for (const celda of contenido) {
    let idx = anclas.findIndex(
      (a) => a.page < celda.page || (a.page === celda.page && a.y <= celda.y + TOL_Y)
    );
    if (idx === -1) idx = anclas.length - 1; // celda por debajo de la última ancla
    filas[idx].push(celda);
  }

  // 6) Armar el resultado
  const ordenLectura = (a: Celda, b: Celda) => a.page - b.page || b.y - a.y || a.x - b.x;
  const unir = (arr: Celda[]) => arr.sort(ordenLectura).map((c) => c.str).join(' ').trim();

  const observaciones: ObservacionPdf[] = [];

  anclas.forEach((ancla, i) => {
    const ambiente = unir(filas[i].filter((c) => c.x < borde));
    const descripcion = unir(filas[i].filter((c) => c.x >= borde));
    if (!ambiente && !descripcion) return;
    observaciones.push({ numero: ancla.str, ambiente, descripcion });
  });

  return observaciones;
}
// pdfjs-dist se importaba dinámicamente para no cargar al arranque, pero
// extraerActaPreEntregaPdf y extraerObservacionesPdf ya lo importan
// estáticamente → el bundle ya lo incluye. Import estático elimina el
// warning de Vite por mixed static/dynamic.
import { pdfjsLib } from './pdfWorkerSetup';

/**
 * Hay dos plantillas de papeleta distintas en circulación, con geometría y
 * orden de campos completamente distintos pero que describen lo mismo
 * (una solicitud/orden de visita de PostVenta + su lista de observaciones).
 *
 * - 'solicitud'    : plantilla original ("Condominio / Departamento / Edificio
 *                    / Requerimiento", tabla "Item / Ambiente / Descripción / Estado").
 * - 'orden_visita' : plantilla nueva ("ORDEN DE VISITA", Proyecto/Etapa/Torre/
 *                    Propietario, tabla "PARTIDA / RECINTO / OBSERVACIÓN /
 *                    COMENTARIO SUPERVISOR OV").
 *
 * Ambas exponen la MISMA forma de salida (PapeletaPdf) para no tener que
 * tocar el resto de PostVenta: los campos "genéricos" (torre, depto,
 * fechaAtencion, requerimiento) se rellenan con su equivalente semántico de
 * cada plantilla, y los campos específicos de cada una quedan disponibles
 * como opcionales por si se necesitan mostrar aparte.
 */
export type FormatoPapeleta = 'solicitud' | 'orden_visita';

export interface DatosSolicitud {
  /** Campos genéricos — siempre poblados, sea cual sea el formato de origen */
  condominio: string;
  depto: string;
  torre: string;
  requerimiento: string;
  /** Cuando el propietario ingresó la solicitud */
  fechaRegistro: string;
  /**
   * Cuando se agenda la visita. En el formato 'solicitud' viene con hora
   * real. En 'orden_visita' el PDF NO trae ninguna hora de visita — la
   * única hora impresa ahí es la de "Fecha Orden de Atención", que es
   * cuándo Aconcagua REGISTRÓ el pedido en su sistema, no cuándo va a ser
   * la visita. Usar esa hora como si fuera la de la visita inducía a
   * error (mostraba, por ejemplo, "18:09" cuando la visita real podía ser
   * a cualquier otra hora). Por eso en 'orden_visita' `horaAtencion` llega
   * SIEMPRE vacío: el profesional debe ingresarla a mano una vez que sepa
   * la hora real acordada con el cliente.
   */
  fechaAtencion: string;
  horaAtencion: string;

  /** Qué plantilla generó estos datos */
  formato: FormatoPapeleta;

  // --- Campos exclusivos de la plantilla 'orden_visita' (opcionales) ---
  proyecto?: string;
  etapa?: string;
  ordenN?: string;
  propietario?: string;
  telefonoContacto?: string;
  rut?: string;
  fechaEntregaUnidad?: string;
  fechaOrdenVisita?: string;
  nVivienda?: string;
  direccion?: string;
  /** Hora en que Aconcagua registró el pedido (NO es la hora de la visita) — solo informativo. */
  horaRegistro?: string;
}

export interface ObservacionPdf {
  numero: string;
  ambiente: string;
  descripcion: string;
  /** Solo viene poblado en la plantilla 'orden_visita' */
  partida?: string;
  /** Solo viene poblado en la plantilla 'orden_visita' */
  comentarioSupervisor?: string;
}

export interface PapeletaPdf {
  datos: DatosSolicitud;
  observaciones: ObservacionPdf[];
}

interface Celda {
  str: string;
  x: number;
  y: number;
  page: number;
}

const TOL_Y = 2; // tolerancia vertical en puntos

// Lee el archivo con FileReader en vez de file.arrayBuffer(): en el WebView de
// iOS, un PDF elegido desde Archivos/iCloud puede llegar diferido y
// arrayBuffer() resolver vacío. FileReader espera a que iOS lo materialice.
function leerArchivoComoArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo (¿está descargado de iCloud?)'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extrae datos de solicitud y observaciones de una papeleta de Post Venta,
 * detectando automáticamente cuál de las dos plantillas conocidas es.
 */
export async function extraerPapeletaPdf(file: File): Promise<PapeletaPdf> {
  // Carga pdfjs SOLO cuando se usa (no al arranque de la app).
  // Build 'legacy' para iOS < 17.4; worker con ?url para Vite (offline + MIME correcto).
  // Ambos vienen del mismo paquete pdfjs-dist pinned → misma versión garantizada.
  const buffer = await leerArchivoComoArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  // 1) Recolectar todas las celdas con su posición real
  const celdas: Celda[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // Se usa Array.from + índice numérico en vez de for...of: el motor de
    // JavaScript de iOS (WebKit) falla con "undefined is not a function" al
    // hacer for...of sobre tc.items si no expone un iterador estándar. La
    // indexación por número no depende de Symbol.iterator.
    const items: any[] = Array.isArray(tc.items) ? tc.items : Array.from(tc.items || []);
    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      if (!raw || !raw.transform) continue;
      const str = (raw.str || '').replace(/\s+/g, ' ').trim();
      if (!str) continue;
      celdas.push({ str, x: raw.transform[4], y: raw.transform[5], page: p });
    }
  }

  // 2) Detectar plantilla por un ancla de texto único de cada una.
  //    "ORDEN DE VISITA" es el título de la plantilla nueva; "item" es el
  //    encabezado de columna de la tabla de la plantilla original.
  const esOrdenVisita = celdas.some((c) => /^ORDEN DE VISITA$/i.test(c.str));

  if (esOrdenVisita) {
    return {
      datos: extraerDatosOrdenVisita(celdas),
      observaciones: extraerObservacionesOrdenVisita(celdas),
    };
  }

  const esSolicitud = celdas.some((c) => /^item$/i.test(c.str));
  if (esSolicitud) {
    return {
      datos: extraerDatosSolicitud(celdas),
      observaciones: extraerObservacionesSolicitud(celdas),
    };
  }

  throw new Error(
    'No se reconoció el formato de la papeleta (no es ni "Solicitud" ni "Orden de Visita").'
  );
}

// ====================================================================
//  PLANTILLA 1: "Solicitud" (original)
// ====================================================================

// ------------------------------------------------------------------
//  DATOS DE SOLICITUD
// ------------------------------------------------------------------
function extraerDatosSolicitud(celdas: Celda[]): DatosSolicitud {
  const enOrden = (arr: Celda[]) =>
    arr
      .slice()
      .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
      .map((c) => c.str)
      .join(' ');

  // Bloque superior: todo lo que está sobre "Quién registro / atiende".
  // Se acota así porque el bloque de personas repite etiquetas como "Fecha".
  const quien = celdas.find((c) => /^qui[eé]n\b/i.test(c.str));
  const limite = quien ? quien.y + TOL_Y : -Infinity;

  const cabecera = enOrden(celdas.filter((c) => c.page === 1 && c.y > limite));
  const completo = enOrden(celdas);

  const g = (texto: string, re: RegExp) => {
    const m = texto.match(re);
    return m ? m[1].trim() : '';
  };

  return {
    formato: 'solicitud',
    condominio: g(
      cabecera,
      /Condominio:\s*(.+?)\s+(?:N[°ºo]?\s*Departamento|Fecha\s+Atenci[oó]n|Edificio|Fecha\s+Escritura)/i
    ),
    depto: g(cabecera, /Departamento:\s*(\S+)/i),
    torre: g(cabecera, /Edificio:\s*(\S+)/i),
    requerimiento: g(cabecera, /Requerimiento\s*:?\s*(\d+)/i),
    fechaAtencion: g(cabecera, /Fecha\s+Atenci[oó]n\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i),
    horaAtencion: g(
      cabecera,
      /Hora\s+Atenci[oó]n\s*:?\s*(\d{1,2}:\d{2}(?::\d{2})?\s*a\s*\d{1,2}:\d{2}(?::\d{2})?)/i
    ),
    // Está dentro del bloque "Quién registro", por eso se busca en el texto completo
    fechaRegistro: g(completo, /Fecha\s+registro:\s*(\d{2}\/\d{2}\/\d{4})/i),
  };
}

// ------------------------------------------------------------------
//  TABLA DE OBSERVACIONES
// ------------------------------------------------------------------
/**
 * Por qué NO se usa texto plano para la tabla:
 * pdf.js concatena las celdas y el resultado es ambiguo — "1   BAÑO 1   Puerta..."
 * tiene exactamente la misma forma que "...marco 2   DORMITORIO 1   Puerta...".
 * Ningún regex puede distinguir el N° de ítem del número del ambiente.
 *
 * Por qué NO basta agrupar por Y:
 * en este template la descripción se dibuja alineada al TOPE de la celda,
 * mientras el ambiente queda más abajo. Es decir, la descripción de la fila N
 * tiene un Y MAYOR que su propio número de ítem.
 *
 * Algoritmo de la tabla: los números de ítem son anclas de fila. Cada celda se
 * asigna al ancla de mayor Y que sea <= Y de la celda. Las columnas se separan
 * por posición X real (mayor salto entre columnas).
 */
function extraerObservacionesSolicitud(celdas: Celda[]): ObservacionPdf[] {
  const header = celdas.find((c) => /^item$/i.test(c.str));
  if (!header) throw new Error('No se encontró la tabla "Lista Requerimientos" en el PDF.');

  const notas = celdas.find(
    (c) => /^notas:?$/i.test(c.str) && (c.page > header.page || c.y < header.y)
  );

  // La columna "Estado" marca el fin del área útil (a la derecha solo hay celdas vacías)
  const estado = celdas.find(
    (c) => /^estado$/i.test(c.str) && c.page === header.page && Math.abs(c.y - header.y) < TOL_Y
  );
  const xMax = estado ? estado.x - 5 : Infinity;

  const despuesDelHeader = (c: Celda) =>
    c.page > header.page || (c.page === header.page && c.y < header.y - TOL_Y);
  const antesDeNotas = (c: Celda) =>
    !notas || c.page < notas.page || (c.page === notas.page && c.y > notas.y + TOL_Y);

  const tabla = celdas.filter((c) => despuesDelHeader(c) && antesDeNotas(c) && c.x < xMax);
  if (tabla.length === 0) return [];

  // Anclas de fila = números de ítem (dígitos puros en la columna más a la izquierda)
  const xMin = Math.min(...tabla.map((c) => c.x));
  const anclas = tabla
    .filter((c) => /^\d+$/.test(c.str) && c.x <= xMin + 8)
    .sort((a, b) => a.page - b.page || b.y - a.y);

  if (anclas.length === 0) return [];

  const contenido = tabla.filter((c) => !anclas.includes(c));

  // Borde ambiente / descripción: mayor salto de X entre las celdas de contenido
  // (item→ambiente son ~10pt; ambiente→descripción son >100pt)
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

  // Asignar cada celda a su fila: primera ancla cuyo Y sea <= Y de la celda
  const filas: Celda[][] = anclas.map(() => []);

  for (const celda of contenido) {
    let idx = anclas.findIndex(
      (a) => a.page < celda.page || (a.page === celda.page && a.y <= celda.y + TOL_Y)
    );
    if (idx === -1) idx = anclas.length - 1; // celda por debajo de la última ancla
    filas[idx].push(celda);
  }

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

// ====================================================================
//  PLANTILLA 2: "Orden de Visita" (nueva)
// ====================================================================

// ------------------------------------------------------------------
//  DATOS DE LA ORDEN
// ------------------------------------------------------------------
/**
 * A diferencia de la plantilla 'solicitud', aquí las etiquetas y sus valores
 * suelen venir en el MISMO texto de pdf.js ("Etapa: PARQUE SAN JAVIER"), y
 * algunos valores se envuelven a la línea siguiente (la dirección parte en
 * una línea y termina en la otra). Por eso basta con leer todo en orden de
 * lectura (Y descendente, X ascendente) y aplicar regex sobre el texto
 * unido — no hace falta razonar por posición como en la tabla.
 */
function extraerDatosOrdenVisita(celdas: Celda[]): DatosSolicitud {
  const enOrden = (arr: Celda[]) =>
    arr
      .slice()
      .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
      .map((c) => c.str)
      .join(' ');

  // La cabecera de datos termina donde empieza la tabla de observaciones.
  const detalle = celdas.find((c) => /^Detalle de Observaciones:?$/i.test(c.str));
  const limite = detalle ? detalle.y : -Infinity;

  const cabecera = enOrden(celdas.filter((c) => c.page === 1 && c.y > limite));

  const g = (re: RegExp) => {
    const m = cabecera.match(re);
    return m ? m[1].trim() : '';
  };

  const proyecto = g(/Proyecto:\s*(.+?)\s*(?:Etapa:|$)/i);
  const etapa = g(/Etapa:\s*(.+?)\s*(?:Torre:|$)/i);
  // No-greedy + lookahead a "Orden N°": cuando Torre viene vacía (pasa en
  // la práctica, ver Formulario_Diagnostico_Visita5087672.pdf), \S+ sin
  // este límite capturaba por error la palabra "Orden" de la línea
  // siguiente ("Torre: Orden N° : 5087672" en el texto unido).
  const torre = g(/Torre:\s*(.*?)\s*(?=Orden N[°ºo])/i);
  const ordenN = g(/Orden N[°ºo]?\s*:?\s*(\d+)/i);
  const propietario = g(/Propietario:\s*(.+?)\s*(?:Tel[eé]fono Contacto:|$)/i);
  const telefonoContacto = g(/Tel[eé]fono Contacto:\s*(\S+)/i);
  const rut = g(/Rut:\s*([\d.Kk-]+)/i);
  const fechaOrdenAtencion = g(/Fecha Orden de Atenci[oó]n:\s*(\d{2}-\d{2}-\d{4})/i);
  const horaOrdenAtencion = g(/Fecha Orden de Atenci[oó]n:\s*\d{2}-\d{2}-\d{4}\s*(\d{2}:\d{2}:\d{2})/i);
  const fechaEntregaUnidad = g(/Fecha Entrega Unidad:\s*(\d{2}-\d{2}-\d{4})/i);
  const fechaOrdenVisita = g(/Fecha Orden de Visita:\s*(\d{2}-\d{2}-\d{4})/i);
  const nVivienda = g(/N[°ºo]?\s*Vivienda:\s*(\S+)/i);
  const direccion = g(/Direcci[oó]n:\s*(.+?)\s*(?:Detalle de Observaciones|$)/i);

  return {
    formato: 'orden_visita',
    // Campos genéricos, rellenados con su equivalente semántico:
    condominio: proyecto,
    depto: nVivienda,
    torre,
    requerimiento: ordenN,
    fechaRegistro: fechaOrdenAtencion,
    fechaAtencion: fechaOrdenVisita,
    // Vacío a propósito: ver el comentario en la interfaz DatosSolicitud.
    // No hay hora de visita real impresa en este formato.
    horaAtencion: '',
    // Campos exclusivos de esta plantilla:
    proyecto,
    etapa,
    ordenN,
    propietario,
    telefonoContacto,
    rut,
    fechaEntregaUnidad,
    fechaOrdenVisita,
    nVivienda,
    direccion,
    horaRegistro: horaOrdenAtencion,
  };
}

// ------------------------------------------------------------------
//  TABLA DE OBSERVACIONES ("Detalle de Observaciones")
// ------------------------------------------------------------------
/**
 * Esta plantilla SÍ tiene líneas de grilla reales y sus celdas se alinean
 * arriba de cada fila (a diferencia de la plantilla 'solicitud'), pero cada
 * columna puede envolver a un número de líneas distinto dentro de la misma
 * fila (ej. "PUERTA MUEBLE" en 2 líneas, con "BAÑO 1" centrado entre ambas;
 * o un comentario de supervisor de 6-7 líneas mientras las otras 3 columnas
 * de esa misma fila tienen 1 sola línea). Por eso no sirve anclar filas por
 * número de ítem (no hay columna de número) ni por igualdad exacta de Y por
 * columna.
 *
 * Algoritmo: se agrupan TODAS las celdas del área de la tabla (encabezado +
 * filas), PÁGINA POR PÁGINA (ver nota de multi-página abajo), en "bandas" de
 * Y usando el mayor salto vertical como separador de fila. El umbral de
 * separación NO asume cuál es "el" alto de línea normal del documento — se
 * calcula buscando el salto más grande entre los valores de salto únicos y
 * ordenados (la misma idea que ya se usa para encontrar el borde entre
 * columnas por X, aplicada al eje Y). Esto importa porque un mismo documento
 * puede tener MÁS DE UNA magnitud de salto "chico" real (ej. ~6.6pt para el
 * wrap ajustado de una columna angosta como PARTIDA, y ~13.2pt para el wrap
 * de una columna ancha como el comentario) — tomar el mínimo o la mediana de
 * esos saltos como "el" alto de línea puede fallar y hacer que cada línea de
 * un comentario largo se cuente como una fila nueva.
 *
 * La primera banda es siempre el encabezado (PARTIDA/RECINTO/OBSERVACIÓN/
 * COMENTARIO) y se descarta. Las columnas se asignan por cercanía en X a
 * cada encabezado.
 *
 * Multi-página: dos páginas distintas pueden compartir el mismo valor de Y
 * (el layout se repite), así que el clustering de filas se hace por PÁGINA,
 * nunca comparando Y entre páginas distintas — un cambio de página siempre
 * fuerza un corte de fila. Eso a su vez puede partir una celda a la mitad
 * justo en el borde de la página (una PARTIDA de 2 líneas, o un comentario
 * largo): la primera parte queda como la última "fila" de una página con
 * una sola columna llena, y el resto aparece al principio de la página
 * siguiente. Esa fila huérfana (exactamente 1 columna con texto, última de
 * su página) se fusiona como prefijo de esa misma columna en la fila
 * siguiente, en vez de quedar como una fila rota o de más.
 */

/** Salto más grande entre valores únicos y ordenados — separa el cluster de "saltos chicos" (intra-fila) del de separadores de fila reales, sin asumir cuál es la magnitud "normal". */
function umbralFilaNatural(saltos: number[]): number {
  const unicos = Array.from(new Set(saltos.map((g) => Math.round(g * 100) / 100))).sort((a, b) => a - b);
  if (unicos.length < 2) return (unicos[0] ?? 12) * 1.8;
  let mejorSalto = -1;
  let umbral = unicos[unicos.length - 1] * 0.9;
  for (let i = 1; i < unicos.length; i++) {
    const salto = unicos[i] - unicos[i - 1];
    if (salto > mejorSalto) {
      mejorSalto = salto;
      umbral = (unicos[i] + unicos[i - 1]) / 2;
    }
  }
  return umbral;
}

function extraerObservacionesOrdenVisita(celdas: Celda[]): ObservacionPdf[] {
  const partidaH = celdas.find((c) => /^PARTIDA$/i.test(c.str));
  const recintoH = celdas.find((c) => /^RECINTO$/i.test(c.str));
  const obsH = celdas.find((c) => /^OBSERVACIÓN$/i.test(c.str));
  // Tolerante a que el header venga partido palabra por palabra en varias
  // líneas ("COMENTARIO" / "SUPERVISOR" / "OV", cada uno su propio ítem de
  // texto) en vez de "COMENTARIO SUPERVISOR" junto — pasa en algunas
  // papeletas y antes hacía que no se encontrara la 4ª columna, mezclando
  // el comentario largo con la observación real.
  const comH = celdas.find((c) => /^COMENTARIO/i.test(c.str) && c.page === partidaH?.page);

  if (!partidaH || !recintoH || !obsH) {
    throw new Error('No se encontró la tabla "Detalle de Observaciones" en el PDF.');
  }

  // Footer real: la etiqueta "Observación:" (campo libre) viene DEBAJO de la
  // tabla, no confundir con el encabezado de columna "OBSERVACIÓN".
  const footer = celdas.find(
    (c) => /^Observaci[oó]n:?$/i.test(c.str) && (c.page > partidaH.page || c.y < partidaH.y)
  );

  const xIzquierda = partidaH.x - 5;
  const areaConEncabezado = celdas.filter(
    (c) =>
      (c.page > partidaH.page || (c.page === partidaH.page && c.y <= partidaH.y + 10)) &&
      (!footer || c.page < footer.page || (c.page === footer.page && c.y > footer.y + TOL_Y)) &&
      c.x >= xIzquierda
  );
  if (areaConEncabezado.length === 0) return [];

  // Límites de columna: punto medio entre encabezados consecutivos
  const colXs = comH ? [partidaH.x, recintoH.x, obsH.x, comH.x] : [partidaH.x, recintoH.x, obsH.x];
  const bordes: number[] = [];
  for (let i = 0; i < colXs.length - 1; i++) bordes.push((colXs[i] + colXs[i + 1]) / 2);
  const columnaDe = (x: number) => {
    for (let i = 0; i < bordes.length; i++) if (x < bordes[i]) return i;
    return bordes.length;
  };

  // El encabezado puede partirse en VARIAS líneas propias cuando una de sus
  // columnas es más angosta que su texto (ej. "COMENTARIO" / "SUPERVISOR" /
  // "OV", cada palabra en su propia línea dentro de la misma celda de
  // encabezado). Antes se asumía que el encabezado ocupaba SIEMPRE una sola
  // línea (la de mayor Y) y se descartaba con un simple slice(1) — cuando el
  // encabezado envolvía a más líneas, esas líneas de más quedaban sueltas y
  // se contaban como una fila de datos fantasma (comentario "OV", el resto
  // de columnas vacío).
  //
  // La forma robusta de no depender de "cuántas líneas mide el encabezado"
  // es identificarlo por CONTENIDO, no por posición: se busca dónde empieza
  // el primer dato real de la columna PARTIDA (cualquier texto ahí que NO
  // sea literalmente la palabra "PARTIDA" del título de columna). Todo lo
  // que esté por encima de esa fila es encabezado — sin importar en cuántas
  // líneas se haya partido — y se descarta de una sola vez.
  const primeraFilaDatoY = Math.max(
    -Infinity,
    ...areaConEncabezado
      .filter((c) => columnaDe(c.x) === 0 && !/^PARTIDA$/i.test(c.str))
      .map((c) => c.y)
  );
  const area = areaConEncabezado.filter((c) => c.y <= primeraFilaDatoY + TOL_Y);
  if (area.length === 0) return [];

  // Valores de Y únicos POR PÁGINA (nunca comparar Y entre páginas distintas).
  interface Marca { page: number; y: number }
  const marcas: Marca[] = [];
  const vistos = new Set<string>();
  for (const c of area.slice().sort((a, b) => a.page - b.page || b.y - a.y)) {
    const key = `${c.page}|${c.y}`;
    if (!vistos.has(key)) {
      vistos.add(key);
      marcas.push({ page: c.page, y: c.y });
    }
  }

  const saltos: number[] = [];
  for (let i = 1; i < marcas.length; i++) {
    if (marcas[i - 1].page === marcas[i].page) saltos.push(marcas[i - 1].y - marcas[i].y);
  }
  const umbralFila = umbralFilaNatural(saltos);

  const gruposMarca: Marca[][] = [];
  let actual: Marca[] = marcas.length ? [marcas[0]] : [];
  for (let i = 1; i < marcas.length; i++) {
    const mismaPagina = marcas[i - 1].page === marcas[i].page;
    const salto = mismaPagina ? marcas[i - 1].y - marcas[i].y : Infinity; // cambio de página = corte forzado
    if (!mismaPagina || salto > umbralFila) {
      gruposMarca.push(actual);
      actual = [marcas[i]];
    } else {
      actual.push(marcas[i]);
    }
  }
  if (actual.length) gruposMarca.push(actual);

  const ordenLectura = (a: Celda, b: Celda) => b.y - a.y || a.x - b.x;
  const unir = (arr: Celda[]) => arr.sort(ordenLectura).map((c) => c.str).join(' ').trim();

  interface FilaTabla { pagina: number; partida: string; recinto: string; observacion: string; comentario: string }
  let filas: FilaTabla[] = gruposMarca.map((grupo) => {
    const cells = area.filter((c) => grupo.some((m) => m.page === c.page && Math.abs(m.y - c.y) < TOL_Y));
    const porColumna: Celda[][] = [[], [], [], []];
    for (const c of cells) porColumna[columnaDe(c.x)].push(c);
    return {
      pagina: grupo[0].page,
      partida: unir(porColumna[0]),
      recinto: unir(porColumna[1]),
      observacion: unir(porColumna[2]),
      comentario: unir(porColumna[3]),
    };
  });

  // El encabezado ya se excluyó de `area` más arriba (por contenido, no por
  // posición) — acá todos los grupos son filas de datos reales, ninguno se
  // descarta.
  filas = filas.filter((f) => f.partida || f.recinto || f.observacion || f.comentario);

  // Fusión de filas huérfanas por corte de página (ver comentario de la
  // función): última fila de su página, con contenido en UNA sola columna.
  const CAMPOS = ['partida', 'recinto', 'observacion', 'comentario'] as const;
  const filasFinales: FilaTabla[] = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const siguiente = filas[i + 1];
    const llenos = CAMPOS.filter((k) => f[k]);
    const esUltimaDeSuPagina = siguiente && siguiente.pagina !== f.pagina;
    if (llenos.length === 1 && esUltimaDeSuPagina) {
      const campo = llenos[0];
      filas[i + 1] = { ...siguiente, [campo]: `${f[campo]} ${siguiente[campo]}`.trim() };
      continue; // se descarta el huérfano, ya quedó fusionado en la siguiente
    }
    filasFinales.push(f);
  }

  return filasFinales.map((f, i) => ({
    numero: String(i + 1),
    ambiente: f.recinto,
    descripcion: f.observacion,
    partida: f.partida,
    comentarioSupervisor: f.comentario,
  }));
}
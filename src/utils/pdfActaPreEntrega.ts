import jsPDF from 'jspdf';

// ============================================================================
// src/utils/pdfActaPreEntrega.ts
// Genera el Acta de Pre Entrega en PDF, replicando el formato de San Agustín.
// - Encabezado: incluye N° de proceso de venta y la web (dato fijo).
// - Punto 2: observaciones en flujo horizontal ocupando el ancho total de las
//   líneas; se agregan líneas nuevas solo cuando se llenan las originales (mín 5).
// - Firmas: bloque idéntico a la referencia (sin título, RUT espaciado,
//   rótulos "CLIENTE" y "p.<razón social>"), firma a mayor escala.
// ============================================================================

export interface ObsActa {
  ambiente: string;       // nombre del ambiente
  descripcion: string;    // texto de la observación
}

export interface ActaParams {
  // Datos del proyecto (columnas acta_* de proyectos)
  nombreInmobiliaria: string;   // "CONDOMINIO SAN AGUSTIN"
  direccion: string;            // "AV PARQUE CENTRAL 06682..."
  ciudad: string;               // "CORDILLERA"
  telefono: string;
  email: string;
  nombreLegal: string;          // "INMOBILIARIA SAN AGUSTÍN SPA"
  logoBase64?: string;          // logo circular (opcional) — data URI o raw base64

  // Datos del depto
  deptoNumero: string | number;
  edificio?: string;            // torre/edificio

  // Datos capturados al tomar obs
  propietarioNombre: string;
  propietarioRut: string;
  fechaPromesa: string;         // YYYY-MM-DD
  banco: string;

  // Inspector (usuario)
  inspectorNombre: string;
  inspectorRut: string;

  // Observaciones
  observaciones: ObsActa[];

  // Firma
  firmaPropietarioBase64?: string; // data URI o raw base64

  // Auto
  fechaGeneracion: Date;
  procesoVenta?: string;
}

// Web fija del condominio (dato fijo del encabezado).
const WEB_FIJA = 'http://www.itodoslossantos.cl';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const fechaLarga = (d: Date): string =>
  `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

const fechaPromesaLarga = (fechaStr: string): string => {
  if (!fechaStr) return '________________';
  const [y, m, d] = fechaStr.split('-').map(Number);
  if (!y || !m || !d) return fechaStr;
  return `${d} de ${MESES[m - 1]} de ${y}`;
};

const fechaHora = (d: Date): string => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()} ${hh}:${mi}:00`;
};

// RUT con espacios alrededor del guion, como en la referencia: "13.488.212 - 3"
const rutEspaciado = (rut: string): string => String(rut || '').replace('-', ' - ');

/**
 * Normaliza un Base64 a formato data URI si no lo está.
 * Maneja tanto "data:image/png;base64,..." como raw base64.
 */
const normalizarBase64 = (base64Str: string | undefined, mimeType = 'image/png'): string | null => {
  if (!base64Str || typeof base64Str !== 'string') return null;

  // Si ya es data URI, retornar tal cual
  if (base64Str.startsWith('data:')) {
    return base64Str;
  }

  // Si es raw base64, agregar prefijo
  if (base64Str.trim().length > 0) {
    return `data:${mimeType};base64,${base64Str}`;
  }

  return null;
};

export const generarActaPreEntrega = (p: ActaParams): jsPDF => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();   // 210
  const H = pdf.internal.pageSize.getHeight();  // 297
  const ML = 15, MR = 15;
  const CW = W - ML - MR;
  let y = 14;

  const setBold = () => pdf.setFont('helvetica', 'bold');
  const setNormal = () => pdf.setFont('helvetica', 'normal');
  const setItalic = () => pdf.setFont('helvetica', 'italic');

  const parrafo = (texto: string, size = 8.5, lineH = 4) => {
    pdf.setFontSize(size);
    const lineas = pdf.splitTextToSize(texto, CW);
    lineas.forEach((ln: string) => {
      if (y > H - 45) { pdf.addPage(); y = 20; }
      pdf.text(ln, ML, y);
      y += lineH;
    });
  };

  // ── HEADER: logo + datos inmobiliaria (izq) + depto/fecha (der) ──────────
  const headerTop = y;

  // Logo circular — con validación y manejo de errores mejorado
  const logoNormalizado = normalizarBase64(p.logoBase64, 'image/png');
  if (logoNormalizado) {
    try {
      // jsPDF acepta data URIs directamente
      pdf.addImage(logoNormalizado, 'PNG', ML, headerTop, 20, 20);
    } catch (err: any) {
      // Si falla, simplemente ignorar y continuar sin logo
      console.warn('Error al agregar logo:', err.message);
    }
  }

  const infoX = logoNormalizado ? ML + 24 : ML;
  pdf.setFontSize(8);
  setBold();
  pdf.text('INMOBILIARIA TODOS LOS SANTOS S.A.', infoX, headerTop + 3);
  setNormal();
  pdf.setFontSize(7.5);
  pdf.text(`CONDOMINIO ${p.nombreInmobiliaria.replace(/^CONDOMINIO\s+/i, '')}`, infoX, headerTop + 7);
  pdf.text(p.direccion, infoX, headerTop + 10.5);
  pdf.text(`Fono: ${p.telefono}`, infoX, headerTop + 14);
  pdf.text(`Email: ${p.email}`, infoX, headerTop + 17.5);
  // Web fija
  setItalic();
  pdf.text(WEB_FIJA, infoX, headerTop + 21);
  setNormal();

  // Datos depto (derecha)
  pdf.setFontSize(8);
  const derX = W - MR - 55;
  setBold();
  pdf.text(`Departamento N° ${p.deptoNumero}${p.edificio ? `, edificio ${p.edificio}` : ''}`, derX, headerTop + 3);
  setNormal();
  pdf.text(`Proceso de venta Nº ${p.procesoVenta || '-'}`, derX, headerTop + 7);
  pdf.text(`Fecha: ${fechaHora(p.fechaGeneracion)}`, derX, headerTop + 11);

  y = headerTop + 27;

  // ── TÍTULO ───────────────────────────────────────────────────────────────
  setBold();
  pdf.setFontSize(12);
  pdf.text('Acta de Pre Entrega', W / 2, y, { align: 'center' });
  setNormal();
  y += 8;

  // ── PUNTO 1 ────────────────────────────────────────────────────────────────
  parrafo(
    `1.- En ${p.ciudad}, a ${fechaLarga(p.fechaGeneracion)}, en virtud de la promesa de compra venta suscrita con fecha ${fechaPromesaLarga(p.fechaPromesa)} entre don(ña) ${p.propietarioNombre} y la ${p.nombreLegal}, don(ña) ${p.propietarioNombre} se realiza en este acto la revisión de PRE ENTREGA del departamento N° ${p.deptoNumero}${p.edificio ? ` - edificio ${p.edificio}` : ''} del ${p.nombreInmobiliaria} correspondiente al bien raíz comprendido en el documento antes referido.`
  );
  y += 2;

  // ── PUNTO 2: OBSERVACIONES (flujo horizontal, ancho completo, mínimo 5) ─────
  parrafo('2.- Luego de la revisión respectiva, don(ña) ' + p.propietarioNombre + ' realiza las siguientes observaciones:');
  y += 1;

  const obs = p.observaciones || [];
  pdf.setFontSize(8.5);

  // Observaciones SIN numerar, separadas por " / ", fluyen por las líneas.
  const obsTexto = obs
    .map(o => (o.ambiente ? `${o.ambiente}: ${o.descripcion}` : (o.descripcion || '')))
    .filter(t => t.trim().length > 0)
    .join(' / ');

  // El texto arranca después del rótulo "2.i.-" (ML+12) y llega hasta ML+CW.
  // Solo cuando el texto supera las líneas mínimas (5) se agregan renglones.
  const lineasObs: string[] = obsTexto ? pdf.splitTextToSize(obsTexto, CW - 12) : [];
  const MIN_LINEAS = 5;
  const totalLineas = Math.max(MIN_LINEAS, lineasObs.length);
  const obsLineH = 6;

  for (let i = 0; i < totalLineas; i++) {
    if (y > H - 55) { pdf.addPage(); y = 20; }
    // Rótulo de línea (siempre presente, al costado de la línea continua)
    pdf.text(`2.${i + 1}.-`, ML, y);
    // Texto de la observación que corresponde a esta línea (si hay)
    if (i < lineasObs.length) {
      pdf.text(lineasObs[i], ML + 12, y);
    }
    // Línea continua para escritura
    pdf.setLineWidth(0.2);
    pdf.line(ML + 12, y + 1.5, ML + CW, y + 1.5);
    y += obsLineH;
  }
  y += 3;

  // ── PUNTOS 3-9 (texto estándar) ─────────────────────────────────────────────
  parrafo(
    `3.- Las observaciones anteriormente formuladas por don(ña) ${p.propietarioNombre}, deberán ser resueltas por la ${p.nombreLegal}, siempre que correspondan de acuerdo al estándar del proyecto y a lo prometido vender, todo ello de acuerdo a los planos y especificaciones técnicas entregados y firmados por don(ña) ${p.propietarioNombre}.`
  );
  y += 1;

  parrafo('4.- La entrega de la propiedad se realizará de acuerdo a los plazos establecidos en la promesa de compra venta suscrita.');
  y += 1;

  parrafo(`5.- La ${p.nombreLegal} entrega en este acto a don(ña) ${p.propietarioNombre} los siguientes documentos:`);
  const docs = [
    '- Reglamento de Copropiedad del Condominio.',
    '- Manual de propietario elaborado por la Cámara Chilena de la Construcción.',
    '- Pauta de mantenciones y cuidados futuros de su nueva propiedad.',
    '- Garantía de Calidad y Protocolo de atención de Post Venta.',
    '- La vida en un condominio.',
  ];
  pdf.setFontSize(8.5);
  docs.forEach(d => {
    if (y > H - 45) { pdf.addPage(); y = 20; }
    pdf.text(d, ML + 5, y);
    y += 4;
  });
  y += 2;

  parrafo(`6.- Don(ña) ${p.propietarioNombre} se compromete a leer detenidamente todos y cada uno de los documentos antes entregados en el punto anterior, en forma previa a recibir su nueva propiedad, y acoger las recomendaciones señaladas oportunamente en cada caso que sea pertinente.`);
  y += 1;

  parrafo(`7.- La Inmobiliaria se reserva el derecho a futuro de exigir, previamente a la atención de los requerimientos de Garantía de Calidad y Post Venta que pueda formular don(ña) ${p.propietarioNombre} o quien sea propietario del inmueble en su momento dado, el previo y cabal cumplimiento a lo señalado en los documentos antes entregados en el punto 5.`);
  y += 1;

  parrafo(`8.- Por el presente documento don(ña) ${p.propietarioNombre} declara que ha revisado en detalle el departamento N° ${p.deptoNumero} del ${p.nombreInmobiliaria} y que éste se ajusta plenamente como producto, es decir: ubicación, distribución, especificaciones y demás atributos correspondiente, a la propiedad prometida vender de acuerdo a la promesa celebrada entre las partes con fecha ${fechaPromesaLarga(p.fechaPromesa)}, sin tener más observaciones que señalar que las previamente indicadas en el punto 2 de la presente acta. Lo anterior sin perjuicio a los requerimientos de Garantía de Calidad y Post Venta que posteriormente pueda formular el propietario del inmueble a la ${p.nombreLegal} que correspondan a defectos de los materiales empleados o sean producto de defectos ocultos de construcción, los cuales se atenderán de acuerdo a los procedimientos correspondientes.`);
  y += 1;

  parrafo(`9.- El cliente informa que el banco con que operará para el crédito hipotecario es ${p.banco || '________________'}.`);
  y += 8;

  // ── FIRMAS (idéntico a la referencia) ──────────────────────────────────────
  if (y > H - 55) {
    pdf.addPage();
    y = 20;
  }

  const firmaStartY = Math.max(y, 200);
  const separacion = CW / 2;
  const lineaY = firmaStartY + 30;          // líneas de firma
  const lineLength = (CW / 2) - 4;

  // Firma del propietario (imagen) — sobre la línea izquierda, a mayor escala
  const firmaNormalizada = normalizarBase64(p.firmaPropietarioBase64, 'image/png');
  if (firmaNormalizada) {
    try {
      pdf.addImage(firmaNormalizada, 'PNG', ML + 5, firmaStartY + 3, 58, 24);
    } catch (err: any) {
      console.warn('Error al agregar firma:', err.message);
    }
  }

  // Líneas continuas de firma
  pdf.setLineWidth(0.5);
  pdf.setDrawColor(0, 0, 0);
  pdf.line(ML + 5, lineaY, ML + 5 + lineLength, lineaY);                            // izquierda
  pdf.line(ML + separacion + 5, lineaY, ML + separacion + 5 + lineLength, lineaY);  // derecha

  // ── Columna izquierda: PROPIETARIO / CLIENTE ──
  pdf.setFontSize(8);
  setNormal();
  pdf.text('Nombres:', ML + 5, lineaY + 5);
  setBold();
  pdf.text(String(p.propietarioNombre), ML + 22, lineaY + 5);
  setNormal();
  pdf.text('RUT:', ML + 5, lineaY + 10);
  setBold();
  pdf.text(rutEspaciado(p.propietarioRut), ML + 22, lineaY + 10);
  setNormal();
  pdf.text('CLIENTE', ML + 22, lineaY + 16);

  // ── Columna derecha: INSPECTOR / INMOBILIARIA ──
  setNormal();
  pdf.text('Nombres:', ML + separacion + 5, lineaY + 5);
  setBold();
  pdf.text(String(p.inspectorNombre), ML + separacion + 22, lineaY + 5);
  setNormal();
  pdf.text('RUT:', ML + separacion + 5, lineaY + 10);
  setBold();
  pdf.text(rutEspaciado(p.inspectorRut), ML + separacion + 22, lineaY + 10);
  setNormal();
  pdf.text(`p.${p.nombreLegal}`, ML + separacion + 5, lineaY + 16);

  return pdf;
};

export default generarActaPreEntrega;
/**
 * pdfPostventa.ts
 * Informe de reparación Post Venta, estilo carta corporativa VAIN.
 *
 * Devuelve un Blob. Guardar o compartir es responsabilidad del llamador,
 * que ya distingue nativo de navegador; hacerlo acá obligaba a importar
 * Filesystem y Share, que en el navegador fallan.
 *
 * FMS — VAIN Proyectos 2026
 */

import jsPDF from 'jspdf';

// ─── logo VAIN (PNG base64, recortado, fondo blanco) ───────────────────────────
const LOGO_VAIN =
  'data:image/png;base64,' +
  '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';


// ─── tipos ────────────────────────────────────────────────────────────────────

export interface ObservacionInforme {
  numero:            string;
  ambiente:          string;
  /** Texto original de la papeleta, tal como lo escribió el cliente */
  solicitudCliente:  string;
  /** Lo que constató y ejecutó el inspector */
  observacion:       string;
  partida?:          string;
  causa?:            string;
  estado:            string;
  /** data URL o URL pública */
  fotoAntes?:        string;
  fotoDespues?:      string;
}

export interface DatosPostventa {
  proyecto:        string;
  torre:           string;
  depto:           string;
  nRequerimiento?: string;
  /** N° de informe a mostrar en la cabecera (ej: PV-2026-000125). Si no se
   *  entrega, se deriva del nRequerimiento y el año. */
  nInforme?:       string;
  fechaAtencion?:  string;   // dd/mm/aaaa, tal como viene de la papeleta
  horaAtencion?:   string;
  /** Nombre y apellido de quien realizó la revisión */
  revisor:         string;
  receptorNombre:  string;
  receptorRut:     string;
  observaciones:   ObservacionInforme[];
  firmaDataUrl:    string;
  fecha:           Date;
}

// ─── constantes de layout ─────────────────────────────────────────────────────

const AZUL        = '#1e3a5f';
const GRIS        = '#64748b';
const GRIS_LIGHT  = '#94a3b8';
const NEGRO       = '#0f172a';
const FONDO_FICHA = '#f8fafc';
const BORDE       = '#e2e8f0';
const VERDE       = '#15803d';
const AMBAR       = '#b45309';

const ML    = 20;
const MR    = 20;
const PW    = 210;
const PH    = 297;
const CW    = PW - ML - MR;
const PIE_H = 15;

// ─── helpers ──────────────────────────────────────────────────────────────────

const formatFecha = (d: Date): string =>
  d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

interface ImgInfo { b64: string; w: number; h: number }

/** Carga una imagen (data URL o URL remota) y la normaliza a JPEG base64 */
const cargarImagen = (src?: string): Promise<ImgInfo> =>
  new Promise<ImgInfo>((resolve) => {
    if (!src) { resolve({ b64: '', w: 0, h: 0 }); return; }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        resolve({
          b64: canvas.toDataURL('image/jpeg', 0.85),
          w: img.naturalWidth,
          h: img.naturalHeight,
        });
      } catch {
        resolve({ b64: '', w: 0, h: 0 });
      }
    };
    img.onerror = () => resolve({ b64: '', w: 0, h: 0 });
    img.src = src;
  });

// ─── clase DocBuilder ─────────────────────────────────────────────────────────

class DocBuilder {
  pdf: jsPDF;
  y: number;

  constructor() {
    this.pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    this.y = 0;
  }

  check(needed: number) {
    if (this.y + needed > PH - PIE_H) {
      this.pdf.addPage();
      this.y = 18;
    }
  }

  hline(x1: number, x2: number, grosor = 0.3, color = BORDE) {
    this.pdf.setDrawColor(color);
    this.pdf.setLineWidth(grosor);
    this.pdf.line(x1, this.y, x2, this.y);
  }

  agregarPies() {
    const total = this.pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.pdf.setPage(p);
      const pieY = PH - 10;
      this.pdf.setDrawColor(BORDE);
      this.pdf.setLineWidth(0.3);
      this.pdf.line(ML, pieY - 4, PW - MR, pieY - 4);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setFontSize(7);
      this.pdf.setTextColor(GRIS_LIGHT);
      this.pdf.text('Informe generado por App VAIN Proyectos  #FMS', ML, pieY);
      this.pdf.text(`Pág. ${p} / ${total}`, PW - MR, pieY, { align: 'right' });
    }
  }
}

// ─── función principal ────────────────────────────────────────────────────────

export const generatePdfPostventa = async (datos: DatosPostventa): Promise<Blob> => {
  const depto = String(datos.depto);
  const doc = new DocBuilder();
  const pdf = doc.pdf;

  const anio = datos.fecha.getFullYear();
  const nInforme = datos.nInforme
    || (datos.nRequerimiento
        ? `PV-${anio}-${String(datos.nRequerimiento).replace(/\D/g, '').padStart(6, '0')}`
        : `PV-${anio}`);

  // ── logo VAIN (imagen oficial) ─────────────────────────────────────────────
  const LOGO_RATIO = 1.8692;  // ancho / alto del PNG recortado
  const dibujarLogo = (x: number, yTop: number) => {
    const h = 12;                 // alto del logo en mm
    const w = h * LOGO_RATIO;     // ancho proporcional
    try {
      pdf.addImage(LOGO_VAIN, 'PNG', x, yTop, w, h);
    } catch {
      // Respaldo: si por algún motivo la imagen falla, dibuja la palabra
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.setTextColor(AZUL);
      pdf.text('VAIN', x, yTop + 11);
    }
  };

  // ── cabecera ──────────────────────────────────────────────────────────────
  dibujarLogo(ML, 10);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(NEGRO);
  pdf.text('INFORME DE VISITA', PW / 2, 17, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(GRIS);
  pdf.text('POST VENTA', PW / 2, 22.5, { align: 'center' });

  const rx = 152;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(GRIS_LIGHT);
  pdf.text('Fecha', rx, 13);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(NEGRO);
  pdf.text(formatFecha(datos.fecha), rx, 17);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(GRIS_LIGHT);
  pdf.text('N° de informe', rx, 22);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(NEGRO);
  pdf.text(nInforme, rx, 26);

  pdf.setDrawColor(AZUL);
  pdf.setLineWidth(0.6);
  pdf.line(ML, 31, PW - MR, 31);

  doc.y = 40;

  // ── helpers de sección y tabla ────────────────────────────────────────────
  const seccion = (num: number, titulo: string) => {
    doc.check(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(AZUL);
    pdf.text(`${num}. ${titulo.toUpperCase()}`, ML, doc.y);
    doc.y += 5;
  };

  const tabla = (headers: string[], valores: string[]) => {
    const n = headers.length;
    const colW = CW / n;
    const hH = 7;
    const dH = 9;
    doc.check(hH + dH + 6);

    const yH = doc.y;

    // encabezado con fondo gris + fila de datos
    pdf.setFillColor(FONDO_FICHA);
    pdf.setDrawColor(BORDE);
    pdf.setLineWidth(0.3);
    pdf.rect(ML, yH, CW, hH, 'FD');
    pdf.rect(ML, yH + hH, CW, dH, 'D');

    // divisores verticales
    for (let i = 1; i < n; i++) {
      const vx = ML + i * colW;
      pdf.line(vx, yH, vx, yH + hH + dH);
    }

    // texto encabezado
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(GRIS);
    headers.forEach((h, i) => {
      pdf.text(h.toUpperCase(), ML + i * colW + colW / 2, yH + hH / 2 + 1.2, { align: 'center' });
    });

    // texto datos
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(NEGRO);
    valores.forEach((v, i) => {
      pdf.text(v || '—', ML + i * colW + colW / 2, yH + hH + dH / 2 + 1.5,
        { align: 'center', maxWidth: colW - 4 });
    });

    doc.y = yH + hH + dH + 7;
  };

  // ── 1. información del departamento ────────────────────────────────────────
  seccion(1, 'Información del departamento');
  tabla(
    ['Proyecto', 'Torre', 'Departamento'],
    [String(datos.proyecto), String(datos.torre), depto],
  );

  // ── 2. atención ────────────────────────────────────────────────────────────
  seccion(2, 'Atención');
  tabla(
    ['Fecha', 'Horario', 'Revisó'],
    [datos.fechaAtencion || formatFecha(datos.fecha), datos.horaAtencion || '—', datos.revisor || '—'],
  );

  // ── 3. requerimientos atendidos ────────────────────────────────────────────
  seccion(3, 'Requerimientos atendidos');

  for (let i = 0; i < datos.observaciones.length; i++) {
    const o = datos.observaciones[i];

    // altura de la tarjeta de texto (encabezado + solicitud + observación + tira)
    const lineasSol = pdf.splitTextToSize(String(o.solicitudCliente || '—'), CW - 8) as string[];
    const lineasObs = pdf.splitTextToSize(String(o.observacion || '—'), CW - 8) as string[];

    const headH   = 8;
    const padTop  = 4;
    const labelH  = 4;
    const gap     = 2;
    const sepGap  = 4;
    const stripH  = 8;
    const solBlock = labelH + lineasSol.length * 4 + gap;
    const obsBlock = labelH + lineasObs.length * 4 + gap;
    const cardH = headH + padTop + solBlock + sepGap + obsBlock + 1 + stripH;

    // fotos: cargar antes para calcular alto y no partir la observación
    const fotoW    = (CW - 6) / 2;
    const fotoMaxH = 50;
    const titH     = 6;
    const [antes, despues] = await Promise.all([
      cargarImagen(o.fotoAntes),
      cargarImagen(o.fotoDespues),
    ]);
    const altoFoto = (info: ImgInfo) =>
      !info.b64 || info.w === 0 ? 0 : Math.min(fotoMaxH, fotoW * (info.h / info.w));
    const fotoH = Math.max(altoFoto(antes), altoFoto(despues), 30);

    doc.check(cardH + 4 + titH + fotoH + 10);
    const cardY = doc.y;

    // encabezado de la tarjeta (fondo gris)
    pdf.setFillColor(FONDO_FICHA);
    pdf.rect(ML, cardY, CW, headH, 'F');
    pdf.setDrawColor(BORDE);
    pdf.setLineWidth(0.3);
    pdf.line(ML, cardY + headH, ML + CW, cardY + headH);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(AZUL);
    pdf.text(`${o.numero}. ${o.ambiente || 'Sin ambiente'}`, ML + 4, cardY + headH / 2 + 1.5);

    const esSolucionado = String(o.estado).toUpperCase() === 'SOLUCIONADO';
    pdf.setFontSize(7);
    pdf.setTextColor(esSolucionado ? VERDE : AMBAR);
    pdf.text(String(o.estado).toUpperCase(), ML + CW - 4, cardY + headH / 2 + 1.5, { align: 'right' });

    // solicitud del cliente
    let cy = cardY + headH + padTop;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(AZUL);
    pdf.text('SOLICITUD DEL CLIENTE', ML + 4, cy);
    cy += labelH;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(NEGRO);
    lineasSol.forEach((l, li) => pdf.text(l, ML + 4, cy + li * 4));
    cy += lineasSol.length * 4 + gap;

    // separador
    pdf.setDrawColor(BORDE);
    pdf.setLineWidth(0.2);
    pdf.line(ML + 4, cy, ML + CW - 4, cy);
    cy += sepGap;

    // observación del inspector
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(GRIS);
    pdf.text('OBSERVACIÓN DEL INSPECTOR', ML + 4, cy);
    cy += labelH;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(NEGRO);
    lineasObs.forEach((l, li) => pdf.text(l, ML + 4, cy + li * 4));
    cy += lineasObs.length * 4 + gap;

    // tira de metadatos: 4 celdas separadas por barras
    pdf.setDrawColor(BORDE);
    pdf.setLineWidth(0.2);
    pdf.line(ML, cy, ML + CW, cy);
    const stripTop = cy;
    const celdas = [
      o.partida ? `Partida: ${o.partida}` : 'Partida: —',
      o.causa ? `Causa: ${o.causa}` : 'Causa: —',
    ];
    const props = [0.5, 0.5];
    let cx = ML;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(GRIS);
    for (let c = 0; c < celdas.length; c++) {
      const w = CW * props[c];
      if (c > 0) {
        pdf.setDrawColor(BORDE);
        pdf.line(cx, stripTop, cx, stripTop + stripH);
      }
      pdf.text(celdas[c], cx + 3, stripTop + stripH / 2 + 1.2, { maxWidth: w - 5 });
      cx += w;
    }
    cy = stripTop + stripH;

    // borde exterior de la tarjeta
    pdf.setDrawColor(BORDE);
    pdf.setLineWidth(0.3);
    pdf.rect(ML, cardY, CW, cy - cardY, 'D');

    // fotos con barra de título
    doc.y = cy + 4;
    const py = doc.y;
    const colA = ML;
    const colD = ML + fotoW + 6;

    const panel = (x: number, info: ImgInfo, titulo: string) => {
      pdf.setFillColor(FONDO_FICHA);
      pdf.setDrawColor(BORDE);
      pdf.setLineWidth(0.3);
      pdf.rect(x, py, fotoW, titH, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(GRIS);
      pdf.text(titulo, x + fotoW / 2, py + titH / 2 + 1.2, { align: 'center' });

      pdf.rect(x, py + titH, fotoW, fotoH, 'D');
      if (info.b64) {
        const h = altoFoto(info);
        pdf.addImage(info.b64, 'JPEG', x, py + titH + (fotoH - h) / 2, fotoW, h);
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(GRIS_LIGHT);
        pdf.text('Sin foto', x + fotoW / 2, py + titH + fotoH / 2, { align: 'center' });
      }
    };

    panel(colA, antes, 'ESTADO ANTERIOR');
    panel(colD, despues, 'ESTADO POSTERIOR');

    doc.y = py + titH + fotoH + 8;
  }

  // ── 4. conformidad ─────────────────────────────────────────────────────────
  seccion(4, 'Conformidad');
  doc.check(48);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(GRIS);
  pdf.text(
    'Quien recibe declara conformidad con los trabajos descritos en este informe.',
    ML, doc.y,
  );
  doc.y += 8;

  const firmaW = 85;
  const firmaH = 28;
  const firmaX = ML;
  const baseY = doc.y;

  if (datos.firmaDataUrl) {
    pdf.addImage(datos.firmaDataUrl, 'PNG', firmaX, baseY, firmaW, firmaH);
  }
  pdf.setDrawColor(NEGRO);
  pdf.setLineWidth(0.4);
  pdf.line(firmaX, baseY + firmaH, firmaX + firmaW, baseY + firmaH);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(GRIS_LIGHT);
  pdf.text('Firma de quien recibe', firmaX + firmaW / 2, baseY + firmaH + 4, { align: 'center' });

  // caja de datos del receptor a la derecha
  const boxX = 128;
  const boxW = PW - MR - boxX;
  const boxY = baseY - 2;
  const rowH = 9;
  const boxH = rowH * 3;

  pdf.setDrawColor(BORDE);
  pdf.setLineWidth(0.3);
  pdf.rect(boxX, boxY, boxW, boxH, 'D');

  const filas: [string, string][] = [
    ['NOMBRE',       datos.receptorNombre || '—'],
    ['RUT',          datos.receptorRut || '—'],
    ['DEPARTAMENTO', `${depto} - Torre ${datos.torre}`],
  ];
  filas.forEach(([lab, val], r) => {
    const cyRow = boxY + r * rowH + rowH / 2 + 1.2;
    if (r > 0) {
      pdf.setDrawColor(BORDE);
      pdf.setLineWidth(0.2);
      pdf.line(boxX, boxY + r * rowH, boxX + boxW, boxY + r * rowH);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(GRIS_LIGHT);
    pdf.text(lab, boxX + 4, cyRow);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(NEGRO);
    pdf.text(String(val), boxX + boxW - 4, cyRow, { align: 'right' });
  });

  doc.y = Math.max(baseY + firmaH + 10, boxY + boxH + 8);

  // ── 5. revisión ────────────────────────────────────────────────────────────
  seccion(5, 'Revisión');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(GRIS_LIGHT);
  pdf.text('REVISIÓN REALIZADA POR', ML, doc.y);
  doc.y += 4.5;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(NEGRO);
  pdf.text(String(datos.revisor || '—'), ML, doc.y);

  // ── pies ───────────────────────────────────────────────────────────────────
  doc.agregarPies();

  return pdf.output('blob');
};

/**
 * Redimensiona una imagen base64 respetando la proporción.
 * Se mantiene por compatibilidad: lo exportaba la versión anterior de este
 * archivo y puede haber otros módulos importándolo.
 */
export const resizeImageToBase64 = async (
  base64: string,
  maxWidth: number,
  maxHeight: number,
): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
      } else if (height > maxHeight) {
        width = Math.round(width * (maxHeight / height));
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
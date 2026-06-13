/**
 * pdfPostventa.ts
 * Genera el informe PDF de Post Venta estilo carta corporativa VAIN.
 * Usa jsPDF (ya instalado en el proyecto).
 * FMS — VAIN Proyectos 2026
 */

import jsPDF from 'jspdf';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface TrabajoPDF {
  descripcion:    string;
  fotoAntesUrl:   string;
  fotoDespuesUrl: string;
}

export interface DatosPostventa {
  proyecto:            string;
  torre:               string;
  depto:               string;
  propietarioNombre:   string;
  propietarioRut:      string;
  propietarioTelefono: string;
  trabajos:            TrabajoPDF[];
  firmaDataUrl:        string;
  fecha:               Date;
}

// ─── constantes de layout ─────────────────────────────────────────────────────

const AZUL        = '#1e3a5f';
const GRIS        = '#64748b';
const GRIS_LIGHT  = '#94a3b8';
const NEGRO       = '#0f172a';
const FONDO_FICHA = '#f8fafc';

const ML    = 20;
const MR    = 20;
const PW    = 210;
const PH    = 297;
const CW    = PW - ML - MR;
const PIE_H = 15;

// ─── helpers ──────────────────────────────────────────────────────────────────

const formatFecha = (d: Date): string =>
  d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

const urlABase64 = (url: string): Promise<{ b64: string; w: number; h: number }> =>
  new Promise<{ b64: string; w: number; h: number }>((resolve) => {
    if (!url) { resolve({ b64: '', w: 0, h: 0 }); return; }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve({ b64: canvas.toDataURL('image/jpeg', 0.85), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => resolve({ b64: '', w: 0, h: 0 });
    img.src = url;
  });

// ─── clase DocBuilder ─────────────────────────────────────────────────────────

class DocBuilder {
  pdf:   jsPDF;
  y:     number;
  pages: number = 1;

  constructor() {
    this.pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    this.y   = 0;
  }

  check(needed: number) {
    if (this.y + needed > PH - PIE_H) {
      this.pdf.addPage();
      this.pages++;
      this.y = 18;
    }
  }

  skip(mm: number) { this.y += mm; }

  hline(x1: number, x2: number, grosor = 0.3, color = '#e2e8f0') {
    this.pdf.setDrawColor(color);
    this.pdf.setLineWidth(grosor);
    this.pdf.line(x1, this.y, x2, this.y);
  }

  text(
    txt: string, x: number, size: number, color = NEGRO,
    style: 'normal' | 'bold' = 'normal', align: 'left' | 'right' | 'center' = 'left',
    maxWidth?: number,
  ) {
    this.pdf.setFont('helvetica', style);
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(color);
    const opts: any = { align };
    if (maxWidth) opts.maxWidth = maxWidth;
    this.pdf.text(txt, x, this.y, opts);
  }

  textBlock(txt: string, x: number, maxW: number, size: number, color = NEGRO, lineH = 5): number {
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(color);
    const lines = this.pdf.splitTextToSize(txt, maxW) as string[];
    let consumed = 0;
    for (const line of lines) {
      this.check(lineH);
      this.pdf.text(line, x, this.y);
      this.y += lineH;
      consumed += lineH;
    }
    return consumed;
  }

  rect(x: number, w: number, h: number, fill: string, stroke?: string) {
    if (stroke) { this.pdf.setDrawColor(stroke); this.pdf.setLineWidth(0.3); }
    this.pdf.setFillColor(fill);
    stroke
      ? this.pdf.rect(x, this.y, w, h, 'FD')
      : this.pdf.rect(x, this.y, w, h, 'F');
  }

  agregarPies() {
    const total = this.pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.pdf.setPage(p);
      const pieY = PH - 10;
      this.pdf.setDrawColor('#e2e8f0');
      this.pdf.setLineWidth(0.3);
      this.pdf.line(ML, pieY - 4, PW - MR, pieY - 4);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setFontSize(7);
      this.pdf.setTextColor(GRIS_LIGHT);
      this.pdf.text('Informe generado por App VAIN Proyectos  \u2039FMS\u203A', ML, pieY);
      this.pdf.text(`Pág. ${p} / ${total}`, PW - MR, pieY, { align: 'right' });
    }
  }
}

// ─── función principal ────────────────────────────────────────────────────────

export const generarPDFPostventa = async (datos: DatosPostventa): Promise<void> => {

  const depto = String(datos.depto);

  const doc = new DocBuilder();
  const pdf  = doc.pdf;

  // ── 1. franja azul superior ───────────────────────────────────────────────
  pdf.setFillColor(AZUL);
  pdf.rect(0, 0, PW, 14, 'F');

  // ── 2. cabecera ───────────────────────────────────────────────────────────
  // Título dentro de la franja
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor('#ffffff');
  pdf.text('INFORME DE REPARACIÓN — POST VENTA', ML, 9);

  // Fecha alineada a la derecha dentro de la franja
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text(formatFecha(datos.fecha), PW - MR, 9, { align: 'right' });

  doc.y = 20;

  // Logo VAIN en azul bajo la franja
  // Para reemplazar por imagen: pdf.addImage(logoBase64, 'PNG', ML, 16, 28, 8);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(AZUL);
  pdf.text('VAIN', ML, doc.y);

  doc.y = 28;

  // ── 3. secciones de ficha ─────────────────────────────────────────────────

  const dibujarSeccion = (titulo: string) => {
    doc.check(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(AZUL);
    pdf.text(titulo.toUpperCase(), ML, doc.y);
    doc.y += 1.5;
    doc.hline(ML, PW - MR, 0.5, AZUL);
    doc.y += 4;
  };

  const dibujarFichaFila = (items: { label: string; valor: string }[], cols = 2) => {
    const colW   = CW / cols;
    const startY = doc.y;
    items.forEach((item, i) => {
      const col  = i % cols;
      const fila = Math.floor(i / cols);
      const x    = ML + col * colW;
      const y    = startY + fila * 10;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(GRIS_LIGHT);
      pdf.text(item.label, x, y);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(NEGRO);
      pdf.text(item.valor || '—', x, y + 4);
    });
    const filas = Math.ceil(items.length / cols);
    doc.y = startY + filas * 10 + 2;
  };

  dibujarSeccion('Información del departamento');
  dibujarFichaFila([
    { label: 'Proyecto',     valor: String(datos.proyecto) },
    { label: 'Torre',        valor: String(datos.torre) },
    { label: 'Departamento', valor: depto },
  ], 3);

  dibujarSeccion('Datos del propietario');
  dibujarFichaFila([
    { label: 'Nombre',   valor: String(datos.propietarioNombre) },
    { label: 'RUT',      valor: String(datos.propietarioRut) },
    { label: 'Teléfono', valor: String(datos.propietarioTelefono) || '—' },
  ], 3);

  // ── 4. trabajos ───────────────────────────────────────────────────────────
  dibujarSeccion('Trabajos realizados');

  for (let i = 0; i < datos.trabajos.length; i++) {
    const t = datos.trabajos[i];
    doc.check(12);

    // encabezado trabajo
    doc.rect(ML, CW, 8, FONDO_FICHA, '#e2e8f0');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(AZUL);
    pdf.text(`Trabajo ${i + 1}`, ML + 3, doc.y + 5.5);
    doc.y += 8;

    // descripción
    const descLines = pdf.splitTextToSize(String(t.descripcion), CW - 8) as string[];
    const descH = descLines.length * 4.5 + 6;
    doc.check(descH);

    pdf.setFillColor(FONDO_FICHA);
    pdf.rect(ML, doc.y, CW, descH, 'F');
    pdf.setFillColor(AZUL);
    pdf.rect(ML, doc.y, 2, descH, 'F');

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(NEGRO);
    const yDescStart = doc.y + 4;
    descLines.forEach((line, li) => {
      pdf.text(line, ML + 5, yDescStart + li * 4.5);
    });
    doc.y += descH + 3;

    // fotos
    const fotoW   = (CW - 6) / 2;
    const fotoMaxH = 52;

    const [imgAntes, imgDespues] = await Promise.all([
      urlABase64(t.fotoAntesUrl),
      urlABase64(t.fotoDespuesUrl),
    ]);

    const calcH = (info: { b64: string; w: number; h: number }) => {
      if (!info.b64 || info.w === 0) return 0;
      return Math.min(fotoMaxH, fotoW * (info.h / info.w));
    };

    const fotoH = Math.max(calcH(imgAntes), calcH(imgDespues), 28);
    doc.check(fotoH + 16);

    const colA = ML;
    const colD = ML + fotoW + 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(GRIS);
    pdf.text('Estado anterior',  colA + fotoW / 2, doc.y, { align: 'center' });
    pdf.text('Estado posterior', colD + fotoW / 2, doc.y, { align: 'center' });
    doc.y += 3;

    // caja antes
    pdf.setDrawColor('#e2e8f0');
    pdf.setLineWidth(0.3);
    pdf.rect(colA, doc.y, fotoW, fotoH);
    if (imgAntes.b64) {
      const hReal = calcH(imgAntes);
      pdf.addImage(imgAntes.b64, 'JPEG', colA, doc.y + (fotoH - hReal) / 2, fotoW, hReal);
    } else {
      pdf.setFontSize(7); pdf.setTextColor(GRIS_LIGHT);
      pdf.text('Sin foto', colA + fotoW / 2, doc.y + fotoH / 2, { align: 'center' });
    }

    // caja después
    pdf.rect(colD, doc.y, fotoW, fotoH);
    if (imgDespues.b64) {
      const hReal = calcH(imgDespues);
      pdf.addImage(imgDespues.b64, 'JPEG', colD, doc.y + (fotoH - hReal) / 2, fotoW, hReal);
    } else {
      pdf.setFontSize(7); pdf.setTextColor(GRIS_LIGHT);
      pdf.text('Sin foto', colD + fotoW / 2, doc.y + fotoH / 2, { align: 'center' });
    }

    doc.y += fotoH + 8;
  }

  // ── 5. firma ──────────────────────────────────────────────────────────────
  dibujarSeccion('Conformidad del propietario');
  doc.check(48);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(GRIS);
  pdf.text(
    'El propietario declara conformidad con todos los trabajos descritos en este informe.',
    ML, doc.y,
  );
  doc.y += 8;

  const firmaW = 90;
  const firmaH = 30;
  const firmaX = ML;
  const datosX = ML + firmaW + 10;

  if (datos.firmaDataUrl) {
    pdf.addImage(datos.firmaDataUrl, 'PNG', firmaX, doc.y, firmaW, firmaH);
  }

  const firmaBaseY = doc.y;

  // línea de firma
  pdf.setDrawColor(NEGRO);
  pdf.setLineWidth(0.4);
  pdf.line(firmaX, firmaBaseY + firmaH, firmaX + firmaW, firmaBaseY + firmaH);

  // etiqueta bajo la línea
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(GRIS_LIGHT);
  pdf.text('Firma del propietario', firmaX + firmaW / 2, firmaBaseY + firmaH + 4, { align: 'center' });

  // datos propietario (columna derecha)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(NEGRO);
  pdf.text(String(datos.propietarioNombre), datosX, firmaBaseY + 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(GRIS);
  pdf.text(`RUT: ${String(datos.propietarioRut)}`, datosX, firmaBaseY + 16);
  pdf.text(`Propietario depto ${depto}`, datosX, firmaBaseY + 21);

  doc.y = firmaBaseY + firmaH + 10;

  // ── 6. pies de página ─────────────────────────────────────────────────────
  doc.agregarPies();

  // ── 7. compartir ──────────────────────────────────────────────────────────
  const fecha  = datos.fecha.toISOString().slice(0, 10).replace(/-/g, '');
  const nombre = `PostVenta_${String(datos.proyecto).replace(/\s+/g, '_')}_${depto}_${fecha}.pdf`;

  const pdfBlob = pdf.output('blob');
  const reader  = new FileReader();

  reader.onloadend = async () => {
    const b64 = (reader.result as string).split(',')[1];
    await Filesystem.writeFile({ path: nombre, data: b64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: nombre, directory: Directory.Cache });
    await Share.share({ title: nombre, url: uri, dialogTitle: 'Compartir informe Post Venta' });
  };

  reader.readAsDataURL(pdfBlob);
};
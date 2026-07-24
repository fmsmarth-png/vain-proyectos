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
const AZUL_CLARO  = '#eff6ff';
const BORDE_AZUL  = '#bfdbfe';
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
      this.pdf.text('Informe generado por App VAIN Proyectos  \u2039FMS\u203A', ML, pieY);
      this.pdf.text(`Pág. ${p} / ${total}`, PW - MR, pieY, { align: 'right' });
    }
  }
}

// ─── función principal ────────────────────────────────────────────────────────

export const generatePdfPostventa = async (datos: DatosPostventa): Promise<Blob> => {
  const depto = String(datos.depto);
  const doc = new DocBuilder();
  const pdf = doc.pdf;

  // ── 1. franja azul superior ───────────────────────────────────────────────
  pdf.setFillColor(AZUL);
  pdf.rect(0, 0, PW, 14, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor('#ffffff');
  pdf.text('INFORME DE REPARACIÓN — POST VENTA', ML, 9);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text(formatFecha(datos.fecha), PW - MR, 9, { align: 'right' });

  // ── 2. logo ───────────────────────────────────────────────────────────────
  doc.y = 20;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(AZUL);
  pdf.text('VAIN', ML, doc.y);

  if (datos.nRequerimiento) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(GRIS);
    pdf.text(`Requerimiento N° ${datos.nRequerimiento}`, PW - MR, doc.y, { align: 'right' });
  }

  doc.y = 28;

  // ── 3. fichas ─────────────────────────────────────────────────────────────

  const seccion = (titulo: string) => {
    doc.check(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(AZUL);
    pdf.text(titulo.toUpperCase(), ML, doc.y);
    doc.y += 1.5;
    doc.hline(ML, PW - MR, 0.5, AZUL);
    doc.y += 4;
  };

  const ficha = (items: { label: string; valor: string }[], cols = 3) => {
    const colW = CW / cols;
    const startY = doc.y;
    items.forEach((item, i) => {
      const x = ML + (i % cols) * colW;
      const y = startY + Math.floor(i / cols) * 10;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(GRIS_LIGHT);
      pdf.text(item.label, x, y);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(NEGRO);
      pdf.text(item.valor || '—', x, y + 4, { maxWidth: colW - 4 });
    });
    doc.y = startY + Math.ceil(items.length / cols) * 10 + 2;
  };

  seccion('Información del departamento');
  ficha([
    { label: 'Proyecto',     valor: String(datos.proyecto) },
    { label: 'Torre',        valor: String(datos.torre) },
    { label: 'Departamento', valor: depto },
  ]);

  seccion('Atención');
  ficha([
    { label: 'Fecha',   valor: datos.fechaAtencion || formatFecha(datos.fecha) },
    { label: 'Horario', valor: datos.horaAtencion || '—' },
    { label: 'Revisó',  valor: datos.revisor || '—' },
  ]);

  // ── 4. observaciones ──────────────────────────────────────────────────────
  seccion('Requerimientos atendidos');

  for (let i = 0; i < datos.observaciones.length; i++) {
    const o = datos.observaciones[i];

    // — encabezado —
    doc.check(14);
    pdf.setDrawColor(BORDE);
    pdf.setLineWidth(0.3);
    pdf.setFillColor(FONDO_FICHA);
    pdf.rect(ML, doc.y, CW, 8, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(AZUL);
    pdf.text(`${o.numero}. ${o.ambiente || 'Sin ambiente'}`, ML + 3, doc.y + 5.5);

    const esSolucionado = String(o.estado).toUpperCase() === 'SOLUCIONADO';
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(esSolucionado ? VERDE : AMBAR);
    pdf.text(String(o.estado), PW - MR - 3, doc.y + 5.5, { align: 'right' });
    doc.y += 8;

    // — solicitud del cliente —
    const bloque = (
      etiqueta: string,
      texto: string,
      fondo: string,
      borde: string,
      acento: string,
    ) => {
      const lineas = pdf.splitTextToSize(String(texto || '—'), CW - 10) as string[];
      const h = lineas.length * 4.2 + 9;
      doc.check(h);

      pdf.setFillColor(fondo);
      pdf.setDrawColor(borde);
      pdf.setLineWidth(0.3);
      pdf.rect(ML, doc.y, CW, h, 'FD');
      pdf.setFillColor(acento);
      pdf.rect(ML, doc.y, 2, h, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(GRIS_LIGHT);
      pdf.text(etiqueta.toUpperCase(), ML + 5, doc.y + 4);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(NEGRO);
      lineas.forEach((l, li) => pdf.text(l, ML + 5, doc.y + 8.5 + li * 4.2));

      doc.y += h + 2;
    };

    bloque('Solicitud del cliente', o.solicitudCliente, AZUL_CLARO, BORDE_AZUL, AZUL);
    bloque('Observación del inspector', o.observacion, FONDO_FICHA, BORDE, GRIS);

    // — partida / causa —
    if (o.partida || o.causa) {
      doc.check(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(GRIS);
      const detalle = [
        o.partida ? `Partida: ${o.partida}` : null,
        o.causa ? `Causa: ${o.causa}` : null,
      ].filter(Boolean).join('   ·   ');
      pdf.text(detalle, ML + 2, doc.y + 3);
      doc.y += 6;
    }

    // — fotos —
    const fotoW = (CW - 6) / 2;
    const fotoMaxH = 52;

    const [antes, despues] = await Promise.all([
      cargarImagen(o.fotoAntes),
      cargarImagen(o.fotoDespues),
    ]);

    const alto = (info: ImgInfo) =>
      !info.b64 || info.w === 0 ? 0 : Math.min(fotoMaxH, fotoW * (info.h / info.w));

    const fotoH = Math.max(alto(antes), alto(despues), 28);
    doc.check(fotoH + 16);

    const colA = ML;
    const colD = ML + fotoW + 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(GRIS);
    pdf.text('Estado anterior',  colA + fotoW / 2, doc.y, { align: 'center' });
    pdf.text('Estado posterior', colD + fotoW / 2, doc.y, { align: 'center' });
    doc.y += 3;

    const caja = (x: number, info: ImgInfo) => {
      pdf.setDrawColor(BORDE);
      pdf.setLineWidth(0.3);
      pdf.rect(x, doc.y, fotoW, fotoH);
      if (info.b64) {
        const h = alto(info);
        pdf.addImage(info.b64, 'JPEG', x, doc.y + (fotoH - h) / 2, fotoW, h);
      } else {
        pdf.setFontSize(7);
        pdf.setTextColor(GRIS_LIGHT);
        pdf.text('Sin foto', x + fotoW / 2, doc.y + fotoH / 2, { align: 'center' });
      }
    };

    caja(colA, antes);
    caja(colD, despues);

    doc.y += fotoH + 10;
  }

  // ── 5. conformidad ────────────────────────────────────────────────────────
  seccion('Conformidad');
  doc.check(52);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(GRIS);
  pdf.text(
    'Quien recibe declara conformidad con los trabajos descritos en este informe.',
    ML, doc.y,
  );
  doc.y += 8;

  const firmaW = 90;
  const firmaH = 30;
  const firmaX = ML;
  const datosX = ML + firmaW + 10;
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

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(NEGRO);
  pdf.text(String(datos.receptorNombre || '—'), datosX, baseY + 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(GRIS);
  pdf.text(`RUT: ${String(datos.receptorRut || '—')}`, datosX, baseY + 16);
  pdf.text(`Depto ${depto} · Torre ${datos.torre}`, datosX, baseY + 21);

  doc.y = baseY + firmaH + 12;

  // — revisor —
  doc.check(12);
  doc.hline(ML, PW - MR);
  doc.y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(GRIS_LIGHT);
  pdf.text('REVISIÓN REALIZADA POR', ML, doc.y);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(NEGRO);
  pdf.text(String(datos.revisor || '—'), ML, doc.y + 5);

  // ── 6. pies ───────────────────────────────────────────────────────────────
  doc.agregarPies();

  return pdf.output('blob');
};
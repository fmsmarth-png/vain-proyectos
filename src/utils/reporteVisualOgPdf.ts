// src/utils/reporteVisualOgPdf.ts
// Genera el PDF de "Reporte Visual OG": una página de resumen (KPIs, desglose
// por tipo, lista de deptos) seguida de una página por cada departamento con
// el plano de cada ambiente (con los mismos hotspots que ya se ven en
// pantalla en RevisionOGResumen.tsx) + su tabla de fallas.
//
// El encabezado grande de cada depto ("Depto X" + línea gruesa) se repite en
// TODAS las páginas de ese depto — no solo en la primera — para que sea
// imposible confundirse de departamento al hojear el reporte impreso.

import jsPDF from 'jspdf';
import { LOGO_VAIN } from '../helpers/pdfPostventa';

// ── Paleta (misma que el resto de los PDF del proyecto) ─────────────────────
const NEGRO       = '#0f172a';
const GRIS        = '#64748b';
const GRIS_LIGHT  = '#94a3b8';
const GRIS_TENUE  = '#cbd5e1'; // más claro que GRIS_LIGHT, para marcas discretas (ej. "FMS")
const BORDE       = '#e2e8f0';
const AMBAR       = '#a16207';
const AMBAR_BG    = '#fffbeb';
const VERDE       = '#15803d';
const CIAN        = '#06b6d4';
const CIAN_BG     = '#d6f5fa';
const FONDO_SUAVE = '#f8fafc';

const LOGO_RATIO = 1.8692; // ancho / alto del PNG del logo (mismo que pdfPostventa.ts)

// ── Clasificación por tipo (mismo criterio usado en pantalla) ───────────────
type Cat = 'picado' | 'puntereo' | 'copa' | 'yeso' | 'pordefinir';
const catAccion = (accion: string | null): Cat => {
  const a = (accion || '').toLowerCase();
  if (a.includes('picado'))   return 'picado';
  if (a.includes('puntereo')) return 'puntereo';
  if (a === 'copa')           return 'copa';
  if (a === 'yeso')           return 'yeso';
  return 'pordefinir';
};
const CATS: { key: Cat; label: string }[] = [
  { key: 'picado',     label: 'Picado' },
  { key: 'puntereo',   label: 'Puntereo' },
  { key: 'copa',       label: 'Copa' },
  { key: 'yeso',       label: 'Yeso' },
  { key: 'pordefinir', label: 'Por definir' },
];
const labelReparacion = (accion: string | null): string =>
  CATS.find(c => c.key === catAccion(accion))?.label ?? 'Por definir';

// Respaldo cuando la tolerancia todavía no tiene un código asignado en
// Calibrador de Elementos: se calcula uno a partir del texto de la
// reparación, para que el plano siga siendo útil mientras se completa el
// catálogo de códigos. El código real (asignado a mano) siempre tiene
// prioridad sobre este respaldo.
const CODIGO_FALLBACK: Record<Cat, string> = {
  picado: 'PI', puntereo: 'PU', copa: 'C', yeso: 'Y', pordefinir: '?',
};

const esPendiente = (estado: string | null) => (estado ?? 'PENDIENTE') !== 'SOLUCIONADO';

// ── Tipos de entrada ─────────────────────────────────────────────────────────
export interface ReportePdfRow {
  ambiente: string | null;
  elemento: string | null;
  tolerancia: string | null;
  accion: string | null;
  codigo: string | null; // código corto de la reparación (PI, PU, C, Y...)
  estado: string | null;
}

export interface ReportePdfDepto {
  departamento_id: string;
  id_obra: string | null;
  numero: number;
  piso: number | null;
  torre: string | null; // por depto, para reportes que abarcan varias torres
  plano_version_id: string | null;
  rows: ReportePdfRow[]; // filas de este depto, ya filtradas por vista + solo pendientes
}

export interface PlanoAmbientePdf {
  titulo: string;
  imagen_url: string | null;
  ancho_orig: number;
  alto_orig: number;
  elementos: { elemento: string; pos_x: number; pos_y: number; ancho: number; alto: number }[];
}

export interface ReportePdfParams {
  proyecto: string;
  contextoLabel: string; // ej. "Torre F15-16 · Piso 5" — para el subtítulo de portada
  vistaLabel: string;    // General | Albañilería | Copa | Yeso
  soloPendientes: boolean;
  deptos: ReportePdfDepto[];
  obtenerPlano: (
    departamentoId: string,
    planoVersionId: string | null,
  ) => Promise<{ ambientes: PlanoAmbientePdf[] } | null>;
}

// ── Carga de imagen apta para PDF (mismo patrón que fichaReparacionCanvas) ──
const cargarImagen = (url: string): Promise<HTMLImageElement | null> =>
  new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = async () => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        const img2 = new Image();
        img2.onload = () => { resolve(img2); URL.revokeObjectURL(obj); };
        img2.onerror = () => { resolve(null); URL.revokeObjectURL(obj); };
        img2.src = obj;
      } catch {
        resolve(null);
      }
    };
    img.src = url;
  });

export async function generarReporteVisualOgPdf(p: ReportePdfParams): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = 210, PAGE_H = 297;
  const ML = 18, MT = 16, MB = 16;
  const usableW = PAGE_W - ML * 2;

  let y = MT;

  const truncar = (texto: string, maxWidth: number): string => {
    let t = texto;
    if (doc.getTextWidth(t) <= maxWidth) return t;
    while (t.length > 1 && doc.getTextWidth(t + '…') > maxWidth) t = t.slice(0, -1);
    return t + '…';
  };

  const linea = (grosor = 0.2, color = BORDE) => {
    doc.setDrawColor(color);
    doc.setLineWidth(grosor);
    doc.line(ML, y, ML + usableW, y);
  };

  const dibujarLogo = (x: number, yTop: number, h = 11) => {
    const w = h * LOGO_RATIO;
    try { doc.addImage(LOGO_VAIN, 'PNG', x, yTop, w, h); }
    catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(NEGRO);
      doc.text('Vain', x, yTop + 5);
    }
  };

  // Salta de página si lo que sigue (alto en mm) no cabe. Si se pasa una
  // función de repintado (el encabezado grande del depto), se vuelve a
  // dibujar en la página nueva — así nunca se pierde de vista en qué depto
  // se está parado.
  const asegurarEspacio = (alto: number, repintar?: () => void) => {
    if (y + alto > PAGE_H - MB) {
      doc.addPage();
      y = MT;
      if (repintar) repintar();
    }
  };

  // ============================================================
  // PÁGINA 1 — Resumen
  // ============================================================
  dibujarLogo(ML, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(GRIS_TENUE);
  doc.text('FMS', ML + usableW, y + 3, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(GRIS_LIGHT);
  const fechaTxt = new Date().toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  doc.text(`Generado ${fechaTxt}`, ML + usableW, y + 9, { align: 'right' });
  y += 15;
  linea(); y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(NEGRO);
  doc.text('Reporte de reparaciones obra gruesa', ML, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(GRIS);
  doc.text(`${p.proyecto} · ${p.contextoLabel}`, ML, y);
  y += 9;

  // Chips: vista activa + solo pendientes
  const dibujarChip = (texto: string, x: number, color: string, bg: string): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const w = doc.getTextWidth(texto) + 6;
    doc.setFillColor(bg);
    doc.roundedRect(x, y - 4, w, 6, 3, 3, 'F');
    doc.setTextColor(color);
    doc.text(texto, x + 3, y);
    return w;
  };
  let chipX = ML;
  chipX += dibujarChip(`Vista: ${p.vistaLabel}`, chipX, GRIS, '#f1f5f9') + 3;
  if (p.soloPendientes) dibujarChip('Solo pendientes', chipX, AMBAR, AMBAR_BG);
  y += 11;

  // KPIs
  const todasLasFilas = p.deptos.flatMap(d => d.rows);
  const total = todasLasFilas.length;
  const pendientes = todasLasFilas.filter(r => esPendiente(r.estado)).length;
  const solucionadas = total - pendientes;
  const avance = total > 0 ? Math.round((solucionadas / total) * 100) : 0;

  const kpis: { label: string; valor: string; color: string }[] = [
    { label: 'Total', valor: String(total), color: NEGRO },
    { label: 'Pendientes', valor: String(pendientes), color: AMBAR },
    { label: 'Solucionadas', valor: String(solucionadas), color: VERDE },
    { label: 'Avance', valor: `${avance}%`, color: NEGRO },
  ];
  const kpiGap = 4;
  const kpiW = (usableW - kpiGap * 3) / 4;
  kpis.forEach((k, i) => {
    const x = ML + i * (kpiW + kpiGap);
    doc.setFillColor(FONDO_SUAVE);
    doc.roundedRect(x, y, kpiW, 17, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(k.color);
    doc.text(k.valor, x + kpiW / 2, y + 8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(GRIS_LIGHT);
    doc.text(k.label, x + kpiW / 2, y + 13.5, { align: 'center' });
  });
  y += 23;

  // Desglose por tipo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(GRIS_LIGHT);
  doc.text('Desglose por tipo', ML, y);
  y += 6;

  const colTotalX = ML + usableW - 24, colPendX = ML + usableW;
  doc.setFontSize(7.5);
  doc.setTextColor(GRIS_LIGHT);
  doc.text('Tipo', ML, y);
  doc.text('Total', colTotalX, y, { align: 'right' });
  doc.text('Pend.', colPendX, y, { align: 'right' });
  y += 3;
  linea(); y += 5.5;

  CATS.forEach(c => {
    const items = todasLasFilas.filter(r => catAccion(r.accion) === c.key);
    if (items.length === 0) return;
    const pend = items.filter(r => esPendiente(r.estado)).length;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(NEGRO);
    doc.text(c.label, ML, y);
    doc.text(String(items.length), colTotalX, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(pend > 0 ? AMBAR : VERDE);
    doc.text(pend > 0 ? `${pend} pend.` : 'listo', colPendX, y, { align: 'right' });
    y += 6.5;
  });
  y += 2; linea(0.5, NEGRO); y += 8;

  // Detalle por departamento
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(GRIS_LIGHT);
  doc.text('Detalle por departamento', ML, y);
  y += 7;

  p.deptos.forEach(d => {
    asegurarEspacio(11);
    const label = d.id_obra || `Depto ${d.numero}`;
    const desgloseTxt = CATS
      .map(c => ({ ...c, n: d.rows.filter(r => catAccion(r.accion) === c.key).length }))
      .filter(x => x.n > 0)
      .map(x => `${x.label} ${x.n}`)
      .join(' · ');
    const dPend = d.rows.filter(r => esPendiente(r.estado)).length;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(NEGRO);
    doc.text(label, ML, y);
    doc.setTextColor(dPend > 0 ? AMBAR : VERDE);
    doc.text(dPend > 0 ? `${dPend} pend.` : 'listo', ML + usableW, y, { align: 'right' });
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(GRIS_LIGHT);
    doc.text(desgloseTxt || '—', ML, y);
    y += 4;
    doc.setDrawColor(BORDE); doc.setLineWidth(0.15);
    doc.line(ML, y, ML + usableW, y);
    y += 6;
  });

  // ============================================================
  // UNA PÁGINA POR DEPARTAMENTO
  // ============================================================
  for (const d of p.deptos) {
    doc.addPage();
    y = MT;

    const idLabel = d.id_obra || `Depto ${d.numero}`;
    const pisoTxt = d.piso == null ? '' : d.piso === -1 ? ' · Sin piso' : ` · Piso ${d.piso}`;
    const torreTxt = d.torre ? `Torre ${d.torre}` : 'Torre —';

    // Encabezado grande del depto — se vuelve a dibujar en cada página nueva
    // que abra este mismo depto (ver asegurarEspacio más abajo).
    const dibujarHeaderDepto = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(NEGRO);
      doc.text(`Depto ${idLabel}`, ML, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(GRIS_LIGHT);
      doc.text('Vain', ML + usableW, y - 3, { align: 'right' });
      y += 6;
      doc.setFontSize(10.5);
      doc.setTextColor(GRIS);
      doc.text(`${torreTxt}${pisoTxt}`, ML, y);
      y += 4;
      doc.setDrawColor(NEGRO);
      doc.setLineWidth(0.8);
      doc.line(ML, y, ML + usableW, y);
      y += 9;
    };
    dibujarHeaderDepto();

    const plano = await p.obtenerPlano(d.departamento_id, d.plano_version_id);

    const porAmbiente = new Map<string, ReportePdfRow[]>();
    d.rows.forEach(r => {
      const key = r.ambiente || 'General';
      const arr = porAmbiente.get(key) ?? [];
      arr.push(r);
      porAmbiente.set(key, arr);
    });

    for (const [ambNombre, filas] of porAmbiente.entries()) {
      const pa = plano?.ambientes.find(a => a.titulo.toLowerCase() === ambNombre.toLowerCase());

      // Alto máximo del plano por ambiente, para que quepan ~2 ambientes por
      // página en vez de que uno solo ocupe casi toda la hoja. Si el plano es
      // más alto que ancho (vertical), se angosta y se centra en vez de usar
      // todo el ancho disponible.
      const MAX_IMG_H = 82;
      let imgW = usableW;
      let imgH = pa?.imagen_url && pa.ancho_orig > 0
        ? (pa.alto_orig / pa.ancho_orig) * imgW
        : 0;
      if (imgH > MAX_IMG_H) {
        imgH = MAX_IMG_H;
        imgW = pa!.alto_orig > 0 ? (pa!.ancho_orig / pa!.alto_orig) * imgH : usableW;
      }
      const imgX = ML + (usableW - imgW) / 2;

      // Reserva el espacio del título + plano juntos, para que no queden
      // separados por un salto de página.
      asegurarEspacio(7 + imgH + (imgH > 0 ? 6 : 0), dibujarHeaderDepto);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(GRIS);
      doc.text(ambNombre, ML, y);
      y += 6;

      if (pa?.imagen_url && imgH > 0) {
        const img = await cargarImagen(pa.imagen_url);
        if (img) {
          const x0 = imgX, y0 = y;
          try {
            doc.addImage(img, 'PNG', x0, y0, imgW, imgH);
          } catch {
            // Si la imagen no se pudo insertar, se sigue igual con la tabla.
          }
          doc.setDrawColor(BORDE); doc.setLineWidth(0.2);
          doc.rect(x0, y0, imgW, imgH);

          const nombresConFalla = new Set(filas.map(f => f.elemento).filter(Boolean) as string[]);
          const codigosPorElemento = new Map<string, string>();
          filas.forEach(f => {
            if (!f.elemento) return;
            const cod = (f.codigo || CODIGO_FALLBACK[catAccion(f.accion)]).toUpperCase();
            const actual = codigosPorElemento.get(f.elemento);
            if (!actual) codigosPorElemento.set(f.elemento, cod);
            else if (!actual.split('/').includes(cod)) codigosPorElemento.set(f.elemento, `${actual}/${cod}`);
          });

          const sx = imgW / pa.ancho_orig;
          const sy = imgH / pa.alto_orig;
          pa.elementos
            .filter(e => nombresConFalla.has(e.elemento))
            .forEach(el => {
              const rx = x0 + el.pos_x * sx;
              const ry = y0 + el.pos_y * sy;
              const rw = el.ancho * sx;
              const rh = el.alto * sy;
              doc.setFillColor(CIAN_BG);
              doc.rect(rx, ry, rw, rh, 'F');
              doc.setDrawColor(CIAN);
              doc.setLineWidth(0.5);
              doc.rect(rx, ry, rw, rh);

              // Código de la reparación (PI/PU/C/Y), centrado dentro del
              // recuadro — para reconocer qué hacer en cada punto sin tener
              // que cruzar con la tabla de abajo.
              const codigoTxt = codigosPorElemento.get(el.elemento) ?? '?';
              let fs = 8.5;
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(fs);
              while (fs > 5 && (doc.getTextWidth(codigoTxt) > rw - 1 || fs > rh * 2)) {
                fs -= 0.5;
                doc.setFontSize(fs);
              }
              doc.setTextColor('#0e7490');
              doc.text(codigoTxt, rx + rw / 2, ry + rh / 2 + fs * 0.12, { align: 'center' });
            });
          y += imgH + 6;
        }
      }

      // Tabla de fallas del ambiente
      asegurarEspacio(10, dibujarHeaderDepto);
      const cElem = ML, cRep = ML + usableW * 0.46, cEst = ML + usableW;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(GRIS_LIGHT);
      doc.text('Elemento', cElem, y);
      doc.text('Reparación', cRep, y);
      doc.text('Estado', cEst, y, { align: 'right' });
      y += 3.5;
      doc.setDrawColor(BORDE); doc.setLineWidth(0.15);
      doc.line(ML, y, ML + usableW, y);
      y += 6.5;

      filas.forEach(f => {
        asegurarEspacio(7, dibujarHeaderDepto);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(NEGRO);
        doc.text(truncar(f.elemento || '—', usableW * 0.42), cElem, y);
        doc.setTextColor(GRIS);
        doc.text(truncar(labelReparacion(f.accion), usableW * 0.4), cRep, y);
        const pend = esPendiente(f.estado);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(pend ? AMBAR : VERDE);
        doc.text(pend ? 'Pendiente' : 'Solucionado', cEst, y, { align: 'right' });
        y += 7;
      });
      y += 4;
    }
  }

  // ============================================================
  // Pie de página en todas las páginas
  // ============================================================
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(BORDE); doc.setLineWidth(0.2);
    doc.line(ML, PAGE_H - MB, ML + usableW, PAGE_H - MB);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(GRIS_LIGHT);
    doc.text('App Vain Proyectos· reporte generado automáticamente', ML, PAGE_H - MB + 5);
    doc.text(`Página ${i} de ${totalPaginas}`, ML + usableW, PAGE_H - MB + 5, { align: 'right' });
  }

  return doc.output('blob');
}
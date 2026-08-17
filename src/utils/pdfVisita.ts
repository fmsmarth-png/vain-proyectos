/**
 * pdfVisita.ts
 * Genera y comparte el reporte de cierre de una visita de obra en formato .docx (Word),
 * editable, pensado para pegarse como cuerpo de un correo corporativo.
 *
 * Diseño de informe (v2):
 *   - Encabezado membretado (se repite en cada página).
 *   - Ficha de datos en tabla (proyecto, fecha real de la visita, inspector, frente).
 *   - Resumen con indicadores (KPIs): total, generales, por depto, y desglose de
 *     programa (en programa / atraso / adelanto).
 *   - Secciones numeradas. Cada observación es una tarjeta con barra de color a la
 *     izquierda, código de referencia (G1, D2…), comparación teórico/real y su
 *     registro fotográfico.
 *
 * Fotos: se conserva `tamanioContain()` (object-fit: contain, sin distorsión).
 *
 * Uso:  await generarDOCVisita(visitaId, proyectoNombre, frenteMoldaje?);
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  VerticalAlign,
  WidthType,
  BorderStyle,
  ShadingType,
  TableLayoutType,
} from 'docx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../supabase';

// ─── Paleta (hex sin '#': formato que pide docx) ──────────────────────────────
const C = {
  azul:      '1E3A5F',
  azulMid:   '4A7AB5',
  rojo:      'DC2626',
  verde:     '16A34A',
  azulLink:  '2563EB',
  negro:     '111827',
  oscuro:    '374151',
  gris:      '6B7280',
  grisClaro: '9CA3AF',
  borde:     'E5E7EB',
  blanco:    'FFFFFF',
  fichaFill: 'F1F5F9',
  obsFill:   'F8FAFC',
  trFill:    'F8FAFC',
  headerSub: 'B4C8E6',
};

// ─── Layout ────────────────────────────────────────────────────────────────────
const MM_A_TWIP = 56.6929;
const MM_A_PX   = 96 / 25.4;

const MARGEN_MM   = 18;
const CONTENT_MM  = 210 - MARGEN_MM * 2;
const CONTENT_PX  = Math.round(CONTENT_MM * MM_A_PX);

const MAX_ALTO_FOTO_MM = 52;
const MAX_ALTO_FOTO_PX = Math.round(MAX_ALTO_FOTO_MM * MM_A_PX);
const MAX_FOTOS_POR_FILA = 3;

const mm = (n: number) => Math.round(n * MM_A_TWIP);
const pt = (n: number) => Math.round(n * 2); // docx `size` en half-points

const SIN_BORDES = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const B = { style: BorderStyle.SINGLE, size: 2, color: C.borde };
const BORDES_FINOS = {
  top: B, bottom: B, left: B, right: B, insideHorizontal: B, insideVertical: B,
};

// ─── Helpers de imagen (SIN CAMBIOS — respetan proporción original) ────────────

interface ImagenInfo {
  data: Uint8Array;
  type: 'jpg' | 'png';
  w: number;
  h: number;
}

async function obtenerImagenInfo(url: string): Promise<ImagenInfo | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();

    let natW = 4, natH = 3;
    try {
      const bmp = await createImageBitmap(blob);
      natW = bmp.width;
      natH = bmp.height;
      bmp.close();
    } catch { /* fallback 4:3 */ }

    const buffer = new Uint8Array(await blob.arrayBuffer());
    const type: 'jpg' | 'png' = blob.type.includes('png') ? 'png' : 'jpg';

    return { data: buffer, type, w: natW, h: natH };
  } catch { return null; }
}

function tamanioContain(natW: number, natH: number, maxW: number, maxH: number) {
  const escala = Math.min(maxW / natW, maxH / natH);
  return {
    width:  Math.max(1, Math.round(natW * escala)),
    height: Math.max(1, Math.round(natH * escala)),
  };
}

function construirFilaFotos(fotos: ImagenInfo[]): Table | null {
  if (!fotos.length) return null;

  const visibles = fotos.slice(0, MAX_FOTOS_POR_FILA);
  const n = visibles.length;
  const anchoCeldaPx = Math.floor(CONTENT_PX / n);
  const pctCelda = Math.floor(100 / n);

  const celdas = visibles.map((foto) => {
    const { width, height } = tamanioContain(foto.w, foto.h, anchoCeldaPx - 6, MAX_ALTO_FOTO_PX);
    return new TableCell({
      width: { size: pctCelda, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 40, right: 40 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({ data: foto.data, type: foto.type, transformation: { width, height } }),
          ],
        }),
      ],
    });
  });

  const restantes = fotos.length - MAX_FOTOS_POR_FILA;

  const tabla = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SIN_BORDES,
    rows: [new TableRow({ children: celdas })],
  });

  if (restantes > 0) (tabla as any)._restantes = restantes;
  return tabla;
}

function indicadorMasFotos(restantes: number): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 40, after: 120 },
    children: [
      new TextRun({ text: `+${restantes} foto${restantes > 1 ? 's' : ''} más`, italics: true, size: pt(7), color: C.grisClaro }),
    ],
  });
}

// ─── Helpers de estructura ──────────────────────────────────────────────────────

/** Ficha de datos en tabla (etiqueta | valor). */
function fichaTabla(filas: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDES_FINOS,
    rows: filas.map(([label, valor]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: C.fichaFill, color: 'auto' },
          margins: { top: 70, bottom: 70, left: 130, right: 80 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new TextRun({ text: label.toUpperCase(), bold: true, size: pt(7), color: C.gris })] })],
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          margins: { top: 70, bottom: 70, left: 130, right: 130 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new TextRun({ text: valor, bold: true, size: pt(9.5), color: C.negro })] })],
        }),
      ],
    })),
  });
}

interface KPI { valor: string | number; label: string; color: string; }

/** Fila de indicadores (KPIs). */
function kpiTabla(items: KPI[]): Table {
  const pct = Math.floor(100 / items.length);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDES_FINOS,
    rows: [new TableRow({
      children: items.map(k => new TableCell({
        width: { size: pct, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 110, bottom: 110, left: 40, right: 40 },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: String(k.valor), bold: true, size: pt(17), color: k.color })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: k.label.toUpperCase(), size: pt(6.5), color: C.gris })] }),
        ],
      })),
    })],
  });
}

/** Título de sección numerado. */
function tituloSeccion(numero: number, texto: string): Paragraph {
  return new Paragraph({
    spacing: { before: 320, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.azul, space: 6 } },
    children: [
      new TextRun({ text: `${numero}.  `, bold: true, size: pt(10), color: C.azul }),
      new TextRun({ text: texto.toUpperCase(), bold: true, size: pt(9), color: C.azul }),
    ],
  });
}

/** Celda "Teórico / Real". */
function celdaTR(label: string, valor: string, sub?: string): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: C.trFill, color: 'auto' },
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [
      new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: label.toUpperCase(), size: pt(6.5), color: C.grisClaro })] }),
      new Paragraph({ children: [new TextRun({ text: valor, size: pt(8.5), color: C.oscuro, bold: true })] }),
      ...(sub ? [new Paragraph({ children: [new TextRun({ text: sub, size: pt(7), color: C.gris })] })] : []),
    ],
  });
}

/** Tarjeta de observación (barra de color + código + teórico/real + texto + fotos). */
function bloqueObs(p: {
  codigo: string;
  ubicacion: string;
  accent: string;
  desfaseTexto?: string;
  teorico?: { actividad?: string; cuadrilla?: string };
  real?: string;
  observacion?: string;
  fotos: ImagenInfo[];
}): Table {
  const contenido: (Paragraph | Table)[] = [];

  // Encabezado: código + ubicación
  contenido.push(new Paragraph({
    spacing: { after: p.desfaseTexto ? 40 : 90 },
    children: [
      new TextRun({ text: p.codigo, bold: true, size: pt(8), color: p.accent }),
      new TextRun({ text: '    ' + p.ubicacion, bold: true, size: pt(9.5), color: C.negro }),
    ],
  }));

  // Estado de programa (atraso / adelanto / en programa)
  if (p.desfaseTexto) {
    contenido.push(new Paragraph({
      spacing: { after: 90 },
      children: [new TextRun({ text: p.desfaseTexto, bold: true, size: pt(7.5), color: p.accent })],
    }));
  }

  // Comparación teórico vs real
  if (p.teorico?.actividad || p.real) {
    contenido.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDES_FINOS,
      rows: [new TableRow({
        children: [
          celdaTR('Programa teórico', p.teorico?.actividad || '—', p.teorico?.cuadrilla),
          celdaTR('Actividad real', p.real || '—'),
        ],
      })],
    }));
    contenido.push(new Paragraph({ spacing: { after: 90 }, children: [] }));
  }

  // Texto de la observación (callout con fondo suave)
  if (p.observacion) {
    contenido.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: SIN_BORDES,
      rows: [new TableRow({
        children: [new TableCell({
          shading: { type: ShadingType.CLEAR, fill: C.obsFill, color: 'auto' },
          margins: { top: 90, bottom: 90, left: 130, right: 130 },
          children: [new Paragraph({ children: [new TextRun({ text: p.observacion, size: pt(9.5), color: C.oscuro })] })],
        })],
      })],
    }));
    contenido.push(new Paragraph({ spacing: { after: p.fotos.length ? 90 : 40 }, children: [] }));
  }

  // Registro fotográfico
  if (p.fotos.length > 0) {
    contenido.push(new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: 'REGISTRO FOTOGRÁFICO', size: pt(6.5), color: C.grisClaro })] }));
    const t = construirFilaFotos(p.fotos);
    if (t) {
      contenido.push(t);
      const rest = (t as any)._restantes;
      if (rest) contenido.push(indicadorMasFotos(rest));
    }
  }

  // Envoltura con barra de acento a la izquierda (ancho fijo para que la franja
  // sea delgada de verdad y no un bloque; layout fijo evita el autofit de Word)
  const ANCHO_TOTAL = mm(CONTENT_MM);
  const ANCHO_ACENTO = 55; // ~1 mm
  return new Table({
    width: { size: ANCHO_TOTAL, type: WidthType.DXA },
    columnWidths: [ANCHO_ACENTO, ANCHO_TOTAL - ANCHO_ACENTO],
    layout: TableLayoutType.FIXED,
    borders: SIN_BORDES,
    rows: [new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: ANCHO_ACENTO, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: p.accent, color: 'auto' },
          children: [new Paragraph({ children: [] })],
        }),
        new TableCell({
          width: { size: ANCHO_TOTAL - ANCHO_ACENTO, type: WidthType.DXA },
          margins: { left: 160, top: 40, bottom: 40 },
          children: contenido,
        }),
      ],
    })],
  });
}

/** Estado de desfase → texto + color. */
function estadoDesfase(desfase: number | null | undefined): { texto: string; color: string } {
  if (desfase === null || desfase === undefined) return { texto: '', color: C.azulMid };
  if (desfase === 0) return { texto: '● En programa', color: C.verde };
  if (desfase < 0)   return { texto: `● Atraso ${Math.abs(desfase)} día${Math.abs(desfase) > 1 ? 's' : ''}`, color: C.rojo };
  return { texto: `● Adelanto ${desfase} día${desfase > 1 ? 's' : ''}`, color: C.azulLink };
}

// ─── Función principal ──────────────────────────────────────────────────────────

export async function generarDOCVisita(
  visitaId: string,
  proyectoNombre: string,
  frenteMoldaje?: string
): Promise<void> {

  // ── 1. Datos de la visita + inspector (para fecha real y autoría) ────────────
  const { data: visita } = await supabase
    .from('visitas_obra')
    .select('creado_por, iniciada_en, terminada_en')
    .eq('id', visitaId)
    .maybeSingle();

  let inspectorNombre = '';
  if (visita?.creado_por) {
    const { data: insp } = await supabase
      .from('usuarios')
      .select('nombre, email, rol')
      .eq('id', visita.creado_por)
      .maybeSingle();
    inspectorNombre = insp?.nombre || insp?.email || '';
  }

  // ── 2. Observaciones ─────────────────────────────────────────────────────────
  const { data: obs } = await supabase
    .from('visita_observaciones')
    .select(`
      *,
      torres        ( nombre ),
      departamentos ( numero, id_obra, piso )
    `)
    .eq('visita_id', visitaId)
    .order('creado_en');

  const todas     = (obs ?? []) as any[];
  const generales = todas.filter(o => o.nivel === 'proyecto' || o.nivel === 'torre');
  const deptoObs  = todas.filter(o => o.nivel === 'departamento');

  // ── 3. Fotos en paralelo ─────────────────────────────────────────────────────
  const fetchFotos = async (o: any) => {
    const urls: string[] = Array.isArray(o.fotos_urls) ? o.fotos_urls.slice(0, 5) : [];
    const resultados = await Promise.all(urls.map(obtenerImagenInfo));
    return resultados.filter(Boolean) as ImagenInfo[];
  };
  const [fotosGen, fotosDepto] = await Promise.all([
    Promise.all(generales.map(fetchFotos)),
    Promise.all(deptoObs.map(fetchFotos)),
  ]);

  // ── 4. Fecha REAL de la visita (no la de hoy) ────────────────────────────────
  const fechaBase = visita?.iniciada_en ? new Date(visita.iniciada_en) : new Date();
  let fecha = fechaBase.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  fecha = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  const conAtraso   = deptoObs.filter(o => (o.desfase_dias ?? 0) < 0).length;
  const conAdelanto = deptoObs.filter(o => (o.desfase_dias ?? 0) > 0).length;
  const enPrograma  = deptoObs.filter(o => o.desfase_dias === 0).length;

  // ── 5. Cuerpo del documento ──────────────────────────────────────────────────
  const cuerpo: (Paragraph | Table)[] = [];

  // Título
  cuerpo.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: 'INFORME DE VISITA A OBRA', bold: true, size: pt(16), color: C.azul })],
  }));
  cuerpo.push(new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: proyectoNombre, size: pt(11), color: C.gris })],
  }));

  // Ficha de datos
  const filasFicha: [string, string][] = [
    ['Fecha de visita', fecha],
  ];
  if (inspectorNombre) filasFicha.push(['Inspector', inspectorNombre]);
  if (frenteMoldaje)   filasFicha.push(['Frente de referencia', `Moldaje Monolítico — ${frenteMoldaje}`]);
  filasFicha.push(['Observaciones', `${todas.length} en total`]);
  cuerpo.push(fichaTabla(filasFicha));

  // Resumen (KPIs)
  cuerpo.push(new Paragraph({ spacing: { before: 220, after: 80 }, children: [new TextRun({ text: 'RESUMEN', bold: true, size: pt(7.5), color: C.gris })] }));
  cuerpo.push(kpiTabla([
    { valor: todas.length,     label: 'Total obs.',   color: C.azul },
    { valor: generales.length, label: 'Generales',    color: C.negro },
    { valor: deptoObs.length,  label: 'Por depto.',   color: C.negro },
  ]));
  if (deptoObs.length > 0) {
    cuerpo.push(new Paragraph({ spacing: { after: 40 }, children: [] }));
    cuerpo.push(kpiTabla([
      { valor: enPrograma,  label: 'En programa', color: C.verde },
      { valor: conAtraso,   label: 'Con atraso',  color: C.rojo },
      { valor: conAdelanto, label: 'Con adelanto', color: C.azulLink },
    ]));
  }

  // Sección 1: Observaciones generales
  if (generales.length > 0) {
    cuerpo.push(tituloSeccion(1, `Observaciones generales (${generales.length})`));
    generales.forEach((o, i) => {
      const ubic = o.nivel === 'torre' ? `Torre ${o.torres?.nombre ?? '—'}` : 'Proyecto — general';
      cuerpo.push(bloqueObs({
        codigo: `G${i + 1}`,
        ubicacion: ubic,
        accent: C.azulMid,
        observacion: o.observacion || undefined,
        fotos: fotosGen[i] || [],
      }));
      cuerpo.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    });
  }

  // Sección 2: Observaciones por departamento
  if (deptoObs.length > 0) {
    const numSeccion = generales.length > 0 ? 2 : 1;
    cuerpo.push(tituloSeccion(numSeccion, `Observaciones por departamento (${deptoObs.length})`));
    deptoObs.forEach((o, i) => {
      const d = o.departamentos;
      const torreLabel = o.torres?.nombre ? `Torre ${o.torres.nombre} · ` : '';
      const ubic = d ? `${torreLabel}Depto ${d.numero ?? d.id_obra} · Piso ${d.piso ?? '—'}` : `${torreLabel}—`;
      const est = estadoDesfase(o.desfase_dias);
      cuerpo.push(bloqueObs({
        codigo: `D${i + 1}`,
        ubicacion: ubic,
        accent: est.color,
        desfaseTexto: est.texto || undefined,
        teorico: (o.actividad_teorica || o.cuadrilla_teorica) ? { actividad: o.actividad_teorica, cuadrilla: o.cuadrilla_teorica } : undefined,
        real: o.actividad_real || undefined,
        observacion: o.observacion || undefined,
        fotos: fotosDepto[i] || [],
      }));
      cuerpo.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    });
  }

  // Si no hay nada
  if (todas.length === 0) {
    cuerpo.push(new Paragraph({
      spacing: { before: 200 },
      children: [new TextRun({ text: 'La visita no registró observaciones.', italics: true, size: pt(9.5), color: C.gris })],
    }));
  }

  // ── 6. Encabezado y pie (se repiten en cada página) ──────────────────────────
  const header = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: SIN_BORDES,
        rows: [new TableRow({
          children: [new TableCell({
            shading: { type: ShadingType.CLEAR, fill: C.azul, color: 'auto' },
            margins: { top: 110, bottom: 110, left: 180, right: 180 },
            children: [
              new Paragraph({
                tabStops: [{ type: 'right' as any, position: mm(CONTENT_MM) - 200 }],
                children: [
                  new TextRun({ text: 'VAIN PROYECTOS', bold: true, size: pt(11.5), color: C.blanco }),
                  new TextRun({ text: `\tINFORME DE VISITA A OBRA`, size: pt(7.5), color: C.headerSub }),
                ],
              }),
              new Paragraph({
                children: [new TextRun({ text: 'App de registro y seguimiento de observaciones', size: pt(7), color: C.headerSub })],
              }),
            ],
          })],
        })],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.borde, space: 4 } },
        tabStops: [{ type: 'right' as any, position: mm(CONTENT_MM) }],
        children: [
          new TextRun({ text: 'Generado por app VAIN Proyectos ‹FMS› · Distribución interna', size: pt(6.5), color: C.grisClaro }),
          new TextRun({
            children: ['\t', 'Pág. ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
            size: pt(6.5),
            color: C.grisClaro,
          } as any),
        ],
      }),
    ],
  });

  // ── 7. Documento ──────────────────────────────────────────────────────────
  const documento = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: pt(9.5), color: C.oscuro },
          paragraph: { spacing: { line: 264 } },
        },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: mm(20), bottom: mm(16), left: mm(MARGEN_MM), right: mm(MARGEN_MM) } },
      },
      headers: { default: header },
      footers: { default: footer },
      children: cuerpo,
    }],
  });

  // ── 8. Exportar ──────────────────────────────────────────────────────────
  const nombreArchivo = `Visita_${proyectoNombre.replace(/\s+/g, '_')}_${fechaBase.toISOString().slice(0, 10)}.docx`;
  const esCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();

  if (esCapacitor) {
    try {
      const base64 = await Packer.toBase64String(documento);
      const { uri } = await Filesystem.writeFile({
        path: nombreArchivo,
        data: base64,
        directory: Directory.Documents,
      });
      await Share.share({
        title: `Visita ${proyectoNombre}`,
        text: `Reporte de visita de obra — ${proyectoNombre}`,
        url: uri,
        dialogTitle: 'Compartir o guardar reporte',
      });
    } catch (e) {
      console.error('Error exportando DOCX en Android:', e);
      throw e; // propagar: el llamador avisa y ofrece regenerar desde el historial
    }
  } else {
    const blob = await Packer.toBlob(documento);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}
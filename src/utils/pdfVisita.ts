/**
 * docVisita.ts
 * Genera y comparte el reporte de cierre de una visita de obra en formato .docx (Word),
 * editable por el usuario final. Reemplaza a pdfVisita.ts.
 *
 * Por qué se veían distorsionadas las fotos en la versión PDF:
 *   En `dibujarFotos` el ancho (fotoW) quedaba FIJO y solo la altura se acotaba con
 *   `Math.min(fotoW * ratio, MAX_ALTO)`. Cuando la altura calculada superaba MAX_ALTO,
 *   jsPDF dibujaba la imagen igual con `addImage(..., fotoW, h)`: ancho completo + alto
 *   recortado = la imagen se "aplastaba" verticalmente. La proporción nunca se
 *   recalculaba en ambos ejes a la vez.
 *
 * Fix aplicado acá: `tamanioContain()` calcula UN solo factor de escala
 *   (el mínimo entre ancho/alto disponible) y lo aplica a ambos ejes. Así la imagen
 *   siempre conserva su proporción original (estilo "object-fit: contain"); si no llena
 *   la celda, simplemente queda centrada con espacio en blanco alrededor — nunca estirada.
 *
 * Dependencias nuevas:
 *   npm install docx
 *
 * Dependencias ya presentes en el proyecto (se mantienen):
 *   - @capacitor/filesystem
 *   - @capacitor/share
 *
 * Uso:
 *   await generarDOCVisita(visitaId, proyectoNombre, frenteMoldaje?);
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
} from 'docx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../supabase';

// ─── Paleta (hex, sin '#': formato que pide docx) ─────────────────────────────
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
};

// ─── Layout ────────────────────────────────────────────────────────────────────
const MM_A_TWIP = 56.6929;
const MM_A_PX   = 96 / 25.4; // a 96dpi, que es lo que asume docx para `transformation`

const MARGEN_MM   = 18;
const CONTENT_MM  = 210 - MARGEN_MM * 2; // A4 menos márgenes ≈ 174mm
const CONTENT_PX  = Math.round(CONTENT_MM * MM_A_PX);

const MAX_ALTO_FOTO_MM = 52;
const MAX_ALTO_FOTO_PX = Math.round(MAX_ALTO_FOTO_MM * MM_A_PX);
const MAX_FOTOS_POR_FILA = 3;

const mm = (n: number) => Math.round(n * MM_A_TWIP);
const pt = (n: number) => Math.round(n * 2); // docx `size` está en half-points

// Sin bordes de tabla visibles (las usamos solo para layout, no como grilla)
const SIN_BORDES = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

// ─── Helpers de imagen ─────────────────────────────────────────────────────────

interface ImagenInfo {
  data: Uint8Array;
  type: 'jpg' | 'png';
  w: number;
  h: number;
}

/** Descarga una imagen desde Storage y obtiene sus bytes + dimensiones reales */
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

/**
 * Calcula ancho/alto finales aplicando UN solo factor de escala a ambos ejes
 * (equivalente a `object-fit: contain`). Nunca distorsiona la imagen.
 */
function tamanioContain(natW: number, natH: number, maxW: number, maxH: number) {
  const escala = Math.min(maxW / natW, maxH / natH);
  return {
    width:  Math.max(1, Math.round(natW * escala)),
    height: Math.max(1, Math.round(natH * escala)),
  };
}

/**
 * Construye una "fila" de hasta 3 fotos lado a lado, cada una centrada en su celda
 * y escalada con `tamanioContain` (proporción siempre respetada).
 */
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
            new ImageRun({
              data: foto.data,
              type: foto.type,
              transformation: { width, height },
            }),
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

  if (restantes > 0) {
    // Se agrega como tabla + el indicador se inserta aparte en el llamador
    (tabla as any)._restantes = restantes;
  }

  return tabla;
}

function indicadorMasFotos(restantes: number): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 40, after: 120 },
    children: [
      new TextRun({
        text: `+${restantes} foto${restantes > 1 ? 's' : ''} más`,
        italics: true,
        size: pt(7),
        color: C.grisClaro,
      }),
    ],
  });
}

// ─── Helpers de texto / estructura ─────────────────────────────────────────────

function tituloSeccion(texto: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 240, after: 80 },
      border: {
        top:    { style: BorderStyle.SINGLE, size: 18, color: C.azul, space: 4 },
        bottom: { style: BorderStyle.SINGLE, size: 4,  color: C.borde, space: 6 },
      },
      children: [
        new TextRun({
          text: texto.toUpperCase(),
          bold: true,
          size: pt(7.5),
          color: C.gris,
        }),
      ],
    }),
  ];
}

function divisor(): Paragraph {
  return new Paragraph({
    spacing: { before: 100, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.borde, space: 1 } },
    children: [],
  });
}

function filaFicha(label: string, valor: string): Paragraph {
  return new Paragraph({
    spacing: { after: 70 },
    children: [
      new TextRun({ text: `${label.padEnd(12, ' ')}  `, size: pt(7.5), color: C.grisClaro }),
      new TextRun({ text: valor, bold: true, size: pt(9), color: C.negro }),
    ],
  });
}

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

// ─── Bloque: observación general (proyecto / torre) ────────────────────────────

function bloqueObservacionGeneral(obs: any, fotos: ImagenInfo[]): (Paragraph | Table)[] {
  const nivelLabel = obs.nivel === 'torre'
    ? `Torre ${obs.torres?.nombre ?? '—'}`
    : 'Proyecto general';

  const out: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 80 },
      tabStops: [{ type: 'right' as any, position: mm(CONTENT_MM) }],
      children: [
        new TextRun({ text: nivelLabel, bold: true, size: pt(8.5), color: C.negro }),
        new TextRun({ text: `\t${horaDe(obs.creado_en)}`, size: pt(7.5), color: C.grisClaro }),
      ],
    }),
  ];

  if (obs.observacion) {
    out.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: obs.observacion, size: pt(9.5), color: C.oscuro })],
    }));
  }

  if (fotos.length > 0) {
    const tablaFotos = construirFilaFotos(fotos);
    if (tablaFotos) {
      out.push(tablaFotos);
      const restantes = (tablaFotos as any)._restantes;
      if (restantes) out.push(indicadorMasFotos(restantes));
    }
  }

  return out;
}

// ─── Bloque: observación por departamento (con acento de color + teórico/real) ─

function bloqueObservacionDepto(obs: any, fotos: ImagenInfo[]): Table {
  const depto = obs.departamentos;
  const deptoLabel = depto ? `Depto ${depto.numero ?? depto.id_obra} · Piso ${depto.piso ?? '—'}` : '—';
  const torreLabel = obs.torres?.nombre ? `Torre ${obs.torres.nombre} · ` : '';

  let desfaseTexto = '';
  let colorAcento = C.azulMid;
  if (obs.desfase_dias !== null && obs.desfase_dias !== undefined) {
    if (obs.desfase_dias === 0) {
      desfaseTexto = '● En programa'; colorAcento = C.verde;
    } else if (obs.desfase_dias < 0) {
      desfaseTexto = `● Atraso ${Math.abs(obs.desfase_dias)} día${Math.abs(obs.desfase_dias) > 1 ? 's' : ''}`;
      colorAcento = C.rojo;
    } else {
      desfaseTexto = `● Adelanto ${obs.desfase_dias} día${obs.desfase_dias > 1 ? 's' : ''}`;
      colorAcento = C.azulLink;
    }
  }

  const contenido: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: `${torreLabel}${deptoLabel}`, bold: true, size: pt(8.5), color: C.negro }),
        new TextRun({ text: `   ${horaDe(obs.creado_en)}`, size: pt(7.5), color: C.grisClaro }),
      ],
    }),
  ];

  if (desfaseTexto) {
    contenido.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: desfaseTexto, bold: true, size: pt(7.5), color: colorAcento })],
    }));
  }

  if (obs.actividad_teorica || obs.actividad_real) {
    contenido.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: SIN_BORDES,
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: 'TEÓRICO', size: pt(6.5), color: C.grisClaro })] }),
              new Paragraph({ children: [new TextRun({ text: obs.actividad_teorica || '—', size: pt(8), color: C.oscuro })] }),
              ...(obs.cuadrilla_teorica ? [new Paragraph({ children: [new TextRun({ text: obs.cuadrilla_teorica, size: pt(7), color: C.grisClaro })] })] : []),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: 'REAL', size: pt(6.5), color: C.grisClaro })] }),
              new Paragraph({ children: [new TextRun({ text: obs.actividad_real || '—', size: pt(8), color: C.oscuro })] }),
            ],
          }),
        ],
      })],
    }));
    contenido.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  }

  if (obs.observacion) {
    contenido.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: obs.observacion, size: pt(9.5), color: C.oscuro })],
    }));
  }

  if (fotos.length > 0) {
    const tablaFotos = construirFilaFotos(fotos);
    if (tablaFotos) {
      contenido.push(tablaFotos);
      const restantes = (tablaFotos as any)._restantes;
      if (restantes) contenido.push(indicadorMasFotos(restantes));
    }
  }

  // Envoltura con acento de color a la izquierda (tabla 2 columnas: barra + contenido)
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SIN_BORDES,
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 2, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: colorAcento, color: 'auto' },
          children: [new Paragraph({ children: [] })],
        }),
        new TableCell({
          width: { size: 98, type: WidthType.PERCENTAGE },
          margins: { left: 120 },
          children: contenido,
        }),
      ],
    })],
  });
}

// ─── Función principal ──────────────────────────────────────────────────────────

export async function generarDOCVisita(
  visitaId: string,
  proyectoNombre: string,
  frenteMoldaje?: string
): Promise<void> {

  // ── 1. Fetch observaciones ───────────────────────────────────────────────────
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

  // ── 2. Fetch fotos en paralelo ───────────────────────────────────────────────
  const fetchFotos = async (o: any) => {
    const urls: string[] = Array.isArray(o.fotos_urls) ? o.fotos_urls.slice(0, 5) : [];
    const resultados = await Promise.all(urls.map(obtenerImagenInfo));
    return resultados.filter(Boolean) as ImagenInfo[];
  };

  const [fotosGen, fotosDepto] = await Promise.all([
    Promise.all(generales.map(fetchFotos)),
    Promise.all(deptoObs.map(fetchFotos)),
  ]);

  // ── 3. Fecha / resumen ───────────────────────────────────────────────────────
  let fecha = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  fecha = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  const conAtraso   = deptoObs.filter(o => (o.desfase_dias ?? 0) < 0).length;
  const conAdelanto = deptoObs.filter(o => (o.desfase_dias ?? 0) > 0).length;
  const enPrograma  = deptoObs.filter(o => (o.desfase_dias ?? 0) === 0).length;

  let resumen = `Durante la visita de obra efectuada el día de hoy se registraron ${todas.length} observaciones en total`;
  if (generales.length > 0) resumen += `: ${generales.length} de carácter general`;
  if (deptoObs.length > 0)  resumen += ` y ${deptoObs.length} correspondientes a unidades habitacionales específicas`;
  resumen += '.';
  if (deptoObs.length > 0) {
    resumen += ` De los departamentos inspeccionados, ${conAtraso} presentan atraso respecto al programa teórico, ${conAdelanto} muestran adelanto y ${enPrograma} se encuentran en programa.`;
  }
  resumen += ' A continuación se detalla cada observación junto con el registro fotográfico asociado.';

  // ── 4. Armar cuerpo del documento ────────────────────────────────────────────
  const cuerpo: (Paragraph | Table)[] = [];

  cuerpo.push(filaFicha('Proyecto', proyectoNombre));
  cuerpo.push(filaFicha('Visitado', fecha));
  if (frenteMoldaje) cuerpo.push(filaFicha('Frente', `Moldaje Monolítico — ${frenteMoldaje}`));
  cuerpo.push(filaFicha('Obs. total', `${todas.length} (${generales.length} generales · ${deptoObs.length} por departamento)`));
  cuerpo.push(new Paragraph({
    spacing: { before: 60, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: C.azul, space: 4 } },
    children: [],
  }));

  cuerpo.push(new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: resumen, size: pt(9.5), color: C.oscuro })],
  }));

  if (generales.length > 0) {
    cuerpo.push(...tituloSeccion(`Observaciones generales (${generales.length})`));
    generales.forEach((o, i) => {
      cuerpo.push(...bloqueObservacionGeneral(o, fotosGen[i]));
      if (i < generales.length - 1) cuerpo.push(divisor());
    });
  }

  if (deptoObs.length > 0) {
    cuerpo.push(...tituloSeccion(`Observaciones por departamento (${deptoObs.length})`));
    deptoObs.forEach((o, i) => {
      cuerpo.push(bloqueObservacionDepto(o, fotosDepto[i]));
      cuerpo.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
      if (i < deptoObs.length - 1) cuerpo.push(divisor());
    });
  }

  // ── 5. Encabezado y pie de página (se repiten en cada página) ───────────────
  const header = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: SIN_BORDES,
        rows: [new TableRow({
          children: [new TableCell({
            shading: { type: ShadingType.CLEAR, fill: C.azul, color: 'auto' },
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            children: [
              new Paragraph({
                tabStops: [{ type: 'right' as any, position: mm(CONTENT_MM) }],
                children: [
                  new TextRun({ text: 'VAIN PROYECTOS', bold: true, size: pt(11), color: C.blanco }),
                  new TextRun({ text: `\t${fecha}`, size: pt(7.5), color: C.blanco }),
                ],
              }),
              new Paragraph({
                children: [new TextRun({ text: 'CALIDAD · VISITA DE OBRA', size: pt(7), color: 'B4C8E6' })],
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
          new TextRun({ text: 'Informe generado por app VAIN Proyectos ‹FMS›', size: pt(6.5), color: C.grisClaro }),
          new TextRun({
            children: ['\t', 'Pág. ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
            size: pt(6.5),
            color: C.grisClaro,
          } as any),
        ],
      }),
    ],
  });

  // ── 6. Documento ──────────────────────────────────────────────────────────
  const documento = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: mm(20), bottom: mm(16), left: mm(MARGEN_MM), right: mm(MARGEN_MM) },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children: cuerpo,
    }],
  });

  // ── 7. Exportar ──────────────────────────────────────────────────────────
  const nombreArchivo = `Visita_${proyectoNombre.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`;
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
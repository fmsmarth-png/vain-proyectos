/**
 * pdfVisita.ts
 * Genera y comparte el PDF de cierre de una visita de obra.
 * Estilo: carta/correo corporativo — sin cajas, texto corrido, fotos proporcionales.
 *
 * Dependencias ya presentes en el proyecto:
 *   - jspdf
 *   - @capacitor/filesystem
 *   - @capacitor/share
 *
 * Uso:
 *   await generarPDFVisita(visitaId, proyectoNombre, supabase, frenteMoldaje?);
 */

import jsPDF from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../supabase';

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  azul:      [30,  58,  95]  as [number, number, number],
  azulMid:   [74, 122, 181]  as [number, number, number],
  rojo:      [220,  38,  38] as [number, number, number],
  verde:     [22,  163,  74] as [number, number, number],
  azulLink:  [37,  99, 235]  as [number, number, number],
  negro:     [17,  24,  39]  as [number, number, number],
  oscuro:    [55,  65,  81]  as [number, number, number],
  gris:      [107, 114, 128] as [number, number, number],
  grisClaro: [156, 163, 175] as [number, number, number],
  borde:     [229, 231, 235] as [number, number, number],
  blanco:    [255, 255, 255] as [number, number, number],
};

// ─── Constantes de layout ──────────────────────────────────────────────────────
const PAGE_W   = 210;          // A4 ancho mm
const PAGE_H   = 297;          // A4 alto mm
const MARGIN   = 18;           // margen izq/der
const CONTENT  = PAGE_W - MARGIN * 2;  // 174mm
const FOOTER_H = 12;           // zona reservada para footer
const SAFE_BOT = PAGE_H - FOOTER_H;   // límite inferior de contenido

// ─── Helpers de bajo nivel ────────────────────────────────────────────────────

function rgb(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(...color);
}

function fillRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  color: [number, number, number]
) {
  doc.setFillColor(...color);
  doc.rect(x, y, w, h, 'F');
}

function hLine(doc: jsPDF, x1: number, x2: number, y: number, color: [number, number, number], lw = 0.2) {
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  doc.line(x1, y, x2, y);
}

function accentLine(doc: jsPDF, x: number, y: number, h: number, color: [number, number, number]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.8);
  doc.line(x, y, x, y + h);
}

/** Convierte URL pública de Storage → base64 para jsPDF */
async function urlABase64(url: string): Promise<{ b64: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();

    // Obtener dimensiones reales via createImageBitmap
    let natW = 4, natH = 3;
    try {
      const bmp = await createImageBitmap(blob);
      natW = bmp.width;
      natH = bmp.height;
      bmp.close();
    } catch { /* fallback 4:3 */ }

    const b64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(null);
      reader.readAsDataURL(blob);
    });

    return { b64, w: natW, h: natH };
  } catch { return null; }
}

// ─── Clase de documento ───────────────────────────────────────────────────────

class DocBuilder {
  doc:     jsPDF;
  y:       number = 0;
  pagina:  number = 1;
  proyecto: string;
  fecha:   string;

  constructor(proyecto: string) {
    this.doc     = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    this.proyecto = proyecto;
    this.fecha   = new Date().toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    this.fecha   = this.fecha.charAt(0).toUpperCase() + this.fecha.slice(1);
  }

  // ── Footer fijo ────────────────────────────────────────────────────────────
  private dibujarFooter() {
    const d = this.doc;
    hLine(d, MARGIN, PAGE_W - MARGIN, PAGE_H - FOOTER_H + 1, C.borde);

    d.setFontSize(6.5);
    d.setFont('helvetica', 'normal');
    rgb(d, C.grisClaro);
    d.text(
      'Informe generado por app VAIN Proyectos  \u2039FMS\u203A',
      MARGIN,
      PAGE_H - FOOTER_H + 5
    );
    d.text(
      `Pág. ${this.pagina}`,
      PAGE_W - MARGIN,
      PAGE_H - FOOTER_H + 5,
      { align: 'right' }
    );
  }

  // ── Nueva página ───────────────────────────────────────────────────────────
  nuevaPagina() {
    this.dibujarFooter();
    this.doc.addPage();
    this.pagina++;
    this.y = 16;
  }

  // ── Verificar espacio; si no cabe, nueva página ────────────────────────────
  check(necesita: number) {
    if (this.y + necesita > SAFE_BOT - FOOTER_H) this.nuevaPagina();
  }

  // ── Texto con check automático ─────────────────────────────────────────────
  texto(
    txt: string,
    x: number,
    opts: {
      size?: number;
      font?: 'normal' | 'bold' | 'italic';
      color?: [number, number, number];
      align?: 'left' | 'right' | 'center';
      maxW?: number;
    } = {}
  ) {
    const { size = 9, font = 'normal', color = C.oscuro, align = 'left', maxW } = opts;
    this.doc.setFontSize(size);
    this.doc.setFont('helvetica', font);
    rgb(this.doc, color);
    this.doc.text(txt, x, this.y, { align, maxWidth: maxW });
  }

  // ── Párrafo multilínea con wrap ────────────────────────────────────────────
  parrafo(
    txt: string,
    indent = 0,
    opts: { size?: number; color?: [number, number, number]; lineH?: number } = {}
  ): number {
    const { size = 9.5, color = C.oscuro, lineH = 4.8 } = opts;
    const maxW = CONTENT - indent;
    const lineas = this.doc.setFontSize(size)
      && this.doc.splitTextToSize(txt, maxW);

    this.check(lineas.length * lineH + 2);
    this.doc.setFontSize(size);
    this.doc.setFont('helvetica', 'normal');
    rgb(this.doc, color);
    lineas.forEach((l: string, i: number) => {
      this.doc.text(l, MARGIN + indent, this.y + i * lineH);
    });
    const alto = lineas.length * lineH;
    this.y += alto;
    return alto;
  }

  // ── Espacio vertical ───────────────────────────────────────────────────────
  skip(mm: number) { this.y += mm; }

  // ── Línea horizontal ───────────────────────────────────────────────────────
  divisor(alpha: [number, number, number] = C.borde, lw = 0.2) {
    hLine(this.doc, MARGIN, PAGE_W - MARGIN, this.y, alpha, lw);
    this.skip(3);
  }

  // ── Título de sección estilo membrete ─────────────────────────────────────
  seccion(titulo: string) {
    this.check(10);
    // línea de acento izquierda
    accentLine(this.doc, MARGIN, this.y - 4, 6.5, C.azul);
    this.doc.setFontSize(7.5);
    this.doc.setFont('helvetica', 'bold');
    rgb(this.doc, C.gris);
    this.doc.text(titulo.toUpperCase(), MARGIN + 4, this.y);
    this.y += 5;
    hLine(this.doc, MARGIN, PAGE_W - MARGIN, this.y, C.borde);
    this.y += 4;
  }

  // ── Fotos en fila, proporcionales ─────────────────────────────────────────
  async dibujarFotos(fotos: Array<{ b64: string; w: number; h: number }>) {
    if (!fotos.length) return;

    const MAX_FOTOS = 3;
    const MAX_ALTO  = 52;   // mm máximo de altura por foto
    const GAP       = 3;
    const visible   = fotos.slice(0, MAX_FOTOS);
    const n         = visible.length;
    const fotoW     = (CONTENT - GAP * (n - 1)) / n;

    // Calcular la altura máxima del bloque (respetando aspect ratio de cada foto)
    let altoBloque = 0;
    const alturas = visible.map(f => {
      const ratio = f.h / f.w;
      const h = Math.min(fotoW * ratio, MAX_ALTO);
      altoBloque = Math.max(altoBloque, h);
      return h;
    });

    this.check(altoBloque + 4);

    visible.forEach((f, i) => {
      const x  = MARGIN + i * (fotoW + GAP);
      const h  = alturas[i];
      // centrar verticalmente en el bloque si hay fotos de distinto alto
      const dy = (altoBloque - h) / 2;
      try {
        this.doc.addImage(f.b64, 'JPEG', x, this.y + dy, fotoW, h);
      } catch { /* imagen corrupta — omitir */ }
    });

    this.y += altoBloque + 2;

    // Indicador "+N más" si hay fotos extra
    if (fotos.length > MAX_FOTOS) {
      this.doc.setFontSize(7);
      this.doc.setFont('helvetica', 'italic');
      rgb(this.doc, C.grisClaro);
      this.doc.text(
        `+${fotos.length - MAX_FOTOS} foto${fotos.length - MAX_FOTOS > 1 ? 's' : ''} más`,
        PAGE_W - MARGIN,
        this.y,
        { align: 'right' }
      );
      this.skip(3);
    }
  }

  // ── Finalizar: footer de la última página + numeración total ──────────────
  finalizar() {
    this.dibujarFooter();
    const total = (this.doc.internal as any).getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.doc.setPage(p);
      this.doc.setFontSize(6.5);
      this.doc.setFont('helvetica', 'normal');
      rgb(this.doc, C.grisClaro);
      // actualizar numeración correcta si hubo varias páginas
      this.doc.text(
        `Pág. ${p} / ${total}`,
        PAGE_W - MARGIN,
        PAGE_H - FOOTER_H + 5,
        { align: 'right' }
      );
    }
  }
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function generarPDFVisita(
  visitaId: string,
  proyectoNombre: string,
  frenteMoldaje?: string
): Promise<void> {

  // ── 1. Fetch observaciones ─────────────────────────────────────────────────
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

  // ── 2. Fetch fotos en paralelo ─────────────────────────────────────────────
  const fetchFotos = async (o: any) => {
    const urls: string[] = Array.isArray(o.fotos_urls) ? o.fotos_urls.slice(0, 5) : [];
    const resultados = await Promise.all(urls.map(urlABase64));
    return resultados.filter(Boolean) as Array<{ b64: string; w: number; h: number }>;
  };

  const [fotosGen, fotosDepto] = await Promise.all([
    Promise.all(generales.map(fetchFotos)),
    Promise.all(deptoObs.map(fetchFotos)),
  ]);

  // ── 3. Iniciar documento ───────────────────────────────────────────────────
  const db = new DocBuilder(proyectoNombre);
  const d  = db.doc;

  // ── 4. ENCABEZADO / MEMBRETE ───────────────────────────────────────────────
  // Franja azul angosta
  fillRect(d, 0, 0, PAGE_W, 18, C.azul);

  d.setFontSize(13);
  d.setFont('helvetica', 'bold');
  rgb(d, C.blanco);
  d.text('VAIN PROYECTOS', MARGIN, 11);

  d.setFontSize(7);
  d.setFont('helvetica', 'normal');
  d.setTextColor(180, 200, 230);
  d.text('CALIDAD · VISITA DE OBRA', MARGIN, 15.5);

  // Fecha en encabezado (derecha)
  d.setFontSize(7.5);
  rgb(d, C.blanco);
  d.text(db.fecha, PAGE_W - MARGIN, 11, { align: 'right' });

  db.y = 26;

  // ── 5. BLOQUE DESTINATARIO (tipo ficha de carta) ───────────────────────────
  const col1 = MARGIN;
  const col2 = MARGIN + 28;

  const filaFicha = (label: string, valor: string) => {
    d.setFontSize(7.5);
    d.setFont('helvetica', 'normal');
    rgb(d, C.grisClaro);
    d.text(label, col1, db.y);
    rgb(d, C.negro);
    d.setFont('helvetica', 'bold');
    d.text(valor, col2, db.y);
    db.skip(4.5);
  };

  filaFicha('Proyecto',  proyectoNombre);
  filaFicha('Visitado',  db.fecha);
  if (frenteMoldaje) filaFicha('Frente', `Moldaje Monolítico — ${frenteMoldaje}`);
  filaFicha('Obs. total', `${todas.length} (${generales.length} generales · ${deptoObs.length} por departamento)`);

  db.skip(3);
  hLine(d, MARGIN, PAGE_W - MARGIN, db.y, C.azul, 0.5);
  db.skip(6);

  // ── 6. PÁRRAFO DE RESUMEN ──────────────────────────────────────────────────
  const conAtraso   = deptoObs.filter(o => (o.desfase_dias ?? 0) < 0).length;
  const conAdelanto = deptoObs.filter(o => (o.desfase_dias ?? 0) > 0).length;
  const enPrograma  = deptoObs.filter(o => (o.desfase_dias ?? 0) === 0).length;

  let resumen = `Durante la visita de obra efectuada el día de hoy se registraron ${todas.length} observaciones en total`;
  if (generales.length > 0) resumen += `: ${generales.length} de carácter general`;
  if (deptoObs.length > 0)  resumen += ` y ${deptoObs.length} correspondientes a unidades habitacionales específicas`;
  resumen += '.';
  if (deptoObs.length > 0) {
    resumen += ` De los departamentos inspeccionados, ${conAtraso} presentan atraso respecto al programa teórico`;
    resumen += `, ${conAdelanto} muestran adelanto y ${enPrograma} se encuentran en programa.`;
  }
  resumen += ' A continuación se detalla cada observación junto con el registro fotográfico asociado.';

  db.parrafo(resumen, 0, { size: 9.5, color: C.oscuro });
  db.skip(6);

  // ── 7. SECCIÓN: OBSERVACIONES GENERALES ───────────────────────────────────
  if (generales.length > 0) {
    db.seccion(`Observaciones generales (${generales.length})`);

    for (let i = 0; i < generales.length; i++) {
      const obs  = generales[i];
      const foto = fotosGen[i];

      const nivelLabel = obs.nivel === 'torre'
        ? `Torre ${obs.torres?.nombre ?? '—'}`
        : 'Proyecto general';
      const hora = new Date(obs.creado_en).toLocaleTimeString('es-CL', {
        hour: '2-digit', minute: '2-digit'
      });

      db.check(18);

      // Encabezado de la obs
      d.setFontSize(8.5);
      d.setFont('helvetica', 'bold');
      rgb(d, C.negro);
      d.text(nivelLabel, MARGIN, db.y);
      d.setFontSize(7.5);
      d.setFont('helvetica', 'normal');
      rgb(d, C.grisClaro);
      d.text(hora, PAGE_W - MARGIN, db.y, { align: 'right' });
      db.skip(5);

      // Texto observación
      if (obs.observacion) {
        db.parrafo(obs.observacion, 0, { size: 9.5, color: C.oscuro });
        db.skip(2);
      }

      // Fotos
      if (foto.length > 0) {
        await db.dibujarFotos(foto);
        db.skip(2);
      }

      // Divisor entre obs
      if (i < generales.length - 1) {
        db.divisor();
      } else {
        db.skip(4);
      }
    }
  }

  // ── 8. SECCIÓN: OBSERVACIONES POR DEPARTAMENTO ────────────────────────────
  if (deptoObs.length > 0) {
    // Salto de página si ya vamos por más de la mitad
    if (db.y > PAGE_H * 0.55) db.nuevaPagina();
    else db.skip(2);

    db.seccion(`Observaciones por departamento (${deptoObs.length})`);

    for (let i = 0; i < deptoObs.length; i++) {
      const obs  = deptoObs[i];
      const foto = fotosDepto[i];

      const depto      = obs.departamentos;
      const deptoLabel = depto
        ? `Depto ${depto.numero ?? depto.id_obra} · Piso ${depto.piso ?? '—'}`
        : '—';
      const torreLabel = obs.torres?.nombre ? `Torre ${obs.torres.nombre} · ` : '';
      const hora = new Date(obs.creado_en).toLocaleTimeString('es-CL', {
        hour: '2-digit', minute: '2-digit'
      });

      // Desfase
      let desfaseLabel = '';
      let desfaseColor: [number, number, number] = C.gris;
      if (obs.desfase_dias !== null && obs.desfase_dias !== undefined) {
        if (obs.desfase_dias === 0) {
          desfaseLabel = '● En programa';
          desfaseColor = C.verde;
        } else if (obs.desfase_dias < 0) {
          desfaseLabel = `● Atraso ${Math.abs(obs.desfase_dias)} día${Math.abs(obs.desfase_dias) > 1 ? 's' : ''}`;
          desfaseColor = C.rojo;
        } else {
          desfaseLabel = `● Adelanto ${obs.desfase_dias} día${obs.desfase_dias > 1 ? 's' : ''}`;
          desfaseColor = C.azulLink;
        }
      }

      db.check(20);

      // Acento izquierdo coloreado según desfase
      const bordeColor = obs.desfase_dias === null
        ? C.azulMid
        : obs.desfase_dias < 0
          ? C.rojo
          : obs.desfase_dias > 0
            ? C.azulLink
            : C.verde;

      // Encabezado depto
      d.setFontSize(8.5);
      d.setFont('helvetica', 'bold');
      rgb(d, C.negro);
      d.text(`${torreLabel}${deptoLabel}`, MARGIN, db.y);
      d.setFontSize(7.5);
      d.setFont('helvetica', 'normal');
      rgb(d, C.grisClaro);
      d.text(hora, PAGE_W - MARGIN, db.y, { align: 'right' });
      db.skip(5);

      // Desfase en texto
      if (desfaseLabel) {
        d.setFontSize(7.5);
        d.setFont('helvetica', 'bold');
        rgb(d, desfaseColor);
        d.text(desfaseLabel, MARGIN, db.y);
        db.skip(4.5);
      }

      // Teórico / Real en dos columnas de texto
      if (obs.actividad_teorica || obs.actividad_real) {
        const halfW = CONTENT / 2 - 4;

        if (obs.actividad_teorica) {
          d.setFontSize(6.5);
          d.setFont('helvetica', 'normal');
          rgb(d, C.grisClaro);
          d.text('TEÓRICO', MARGIN, db.y);

          d.setFontSize(8);
          rgb(d, C.oscuro);
          const linTeo = d.splitTextToSize(obs.actividad_teorica, halfW);
          linTeo.forEach((l: string, li: number) => d.text(l, MARGIN, db.y + 3.5 + li * 4));

          if (obs.cuadrilla_teorica) {
            const linCuad = linTeo.length;
            d.setFontSize(7);
            rgb(d, C.grisClaro);
            d.text(obs.cuadrilla_teorica, MARGIN, db.y + 3.5 + linCuad * 4);
          }
        }

        if (obs.actividad_real) {
          const xr = MARGIN + CONTENT / 2 + 2;
          d.setFontSize(6.5);
          d.setFont('helvetica', 'normal');
          rgb(d, C.grisClaro);
          d.text('REAL', xr, db.y);

          d.setFontSize(8);
          rgb(d, C.oscuro);
          const linReal = d.splitTextToSize(obs.actividad_real, halfW);
          linReal.forEach((l: string, li: number) => d.text(l, xr, db.y + 3.5 + li * 4));
        }

        db.skip(13);
      }

      // Acento izquierdo (dibujado aquí para cubrir todo el bloque)
      // Se pinta ANTES de que y avance más
      const yInicioAcento = db.y;

      // Texto de la observación
      if (obs.observacion) {
        db.parrafo(obs.observacion, 0, { size: 9.5, color: C.oscuro });
        db.skip(2);
      }

      // Fotos
      if (foto.length > 0) {
        await db.dibujarFotos(foto);
        db.skip(2);
      }

      // Acento izquierdo real (línea vertical fina)
      const alturaBloque = db.y - yInicioAcento;
      if (alturaBloque > 0) {
        accentLine(d, MARGIN - 2, yInicioAcento - 12, alturaBloque + 12, bordeColor);
      }

      // Divisor
      if (i < deptoObs.length - 1) {
        db.divisor();
      } else {
        db.skip(4);
      }
    }
  }

  // ── 9. CIERRE DEL DOCUMENTO ────────────────────────────────────────────────
  db.finalizar();

  // ── 10. EXPORTAR ──────────────────────────────────────────────────────────
  const nombreArchivo = `Visita_${proyectoNombre.replace(/\s+/g, '_')}_${
    new Date().toISOString().slice(0, 10)
  }.pdf`;

  const pdfBlob    = d.output('blob');
  const pdfDataUri = d.output('datauristring');
  const pdfBase64  = pdfDataUri.split(',')[1];

  const esCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();

  if (esCapacitor) {
    try {
      const { uri } = await Filesystem.writeFile({
        path:      nombreArchivo,
        data:      pdfBase64,
        directory: Directory.Documents,
      });
      await Share.share({
        title:      `Visita ${proyectoNombre}`,
        text:       `Reporte de visita de obra — ${proyectoNombre}`,
        url:        uri,
        dialogTitle: 'Compartir o guardar reporte',
      });
    } catch (e) {
      console.error('Error exportando PDF en Android:', e);
    }
  } else {
    const url = URL.createObjectURL(pdfBlob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}
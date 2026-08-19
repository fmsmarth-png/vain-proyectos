/**
 * Genera un PDF de observaciones Pre Entrega con formato IDÉNTICO a Reportes.tsx
 * Patrón: html2canvas sobre elementos ocultos + jsPDF (mismo que Reportes)
 * Archivo: src/utils/generarPDFObservacionesPreEntrega.ts
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

interface Observacion {
  id: string;
  numero?: number;
  ambiente: string;
  observacion: string;
  foto_url?: string | null;
  partida_afectada?: string;
  estado?: string;
  causa?: string;
  fecha_creacion?: string;
}

interface ConfiguracionPDF {
  proyectoNombre: string;
  torreName: string;
  deptoNumero: string;
  torreFrente?: string;
  deptoId_obra?: string;
  observaciones: Observacion[];
  dark: boolean;
  onProgreso?: (msg: string, porcentaje: number) => void;
}

const estadoLabel: Record<string, string> = {
  pendiente:   'Pendiente',
  PENDIENTE:   'Pendiente',
  solucionado: 'Solucionado',
  SOLUCIONADO: 'Solucionado',
  aprobado:    'Aprobado',
  rechazado:   'Rechazado',
};

const estadoColor: Record<string, string> = {
  pendiente:   '#ef4444',
  PENDIENTE:   '#ef4444',
  solucionado: '#3b82f6',
  SOLUCIONADO: '#3b82f6',
  aprobado:    '#22c55e',
  rechazado:   '#ef4444',
};

const comprimirImagenUrl = (url: string, maxW = 1400): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      if (width > maxW) { height = Math.round(height * maxW / width); width = maxW; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve('');
    img.src = url + '?t=' + Date.now();
  });
};

const capturarElemento = async (el: HTMLElement, ancho = 750): Promise<HTMLCanvasElement> => {
  const ow = el.style.width, omw = el.style.maxWidth, ot = el.style.transform;
  el.style.width = `${ancho}px`; el.style.maxWidth = `${ancho}px`; el.style.transform = 'none';
  await new Promise(r => setTimeout(r, 50));
  const canvas = await html2canvas(el, {
    scale: 2, useCORS: true, backgroundColor: '#ffffff',
    width: ancho, windowWidth: ancho, windowHeight: el.scrollHeight,
    logging: false, allowTaint: false, foreignObjectRendering: false,
  });
  el.style.width = ow; el.style.maxWidth = omw; el.style.transform = ot;
  return canvas;
};

const guardarPDF = async (pdf: jsPDF, nombre: string) => {
  const esNativo = (window as any).Capacitor?.isNativePlatform?.() ?? false;
  if (esNativo) {
    const pdfBlob = pdf.output('blob');
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i += 8192) {
      binary += String.fromCharCode(...uint8Array.subarray(i, i + 8192));
    }
    const base64 = btoa(binary);
    const result = await Filesystem.writeFile({ path: nombre, data: base64, directory: Directory.Cache });
    await Share.share({ title: nombre, url: result.uri, dialogTitle: 'Compartir o guardar PDF' });
  } else {
    pdf.save(nombre);
  }
};

const agregarPiesDePagina = (pdf: jsPDF, margen: number) => {
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text('Reporte generado por App VAIN Proyectos.   <FMS>', pdfW / 2, pdfH - 5, { align: 'center' });
    pdf.text(`Pág. ${p} / ${total}`, pdfW - margen, pdfH - 5, { align: 'right' });
  }
};

export const generarPDFObservacionesPreEntrega = async (config: ConfiguracionPDF) => {
  const {
    proyectoNombre, torreName, deptoNumero, torreFrente,
    deptoId_obra, observaciones, onProgreso,
  } = config;

  if (observaciones.length === 0) throw new Error('No hay observaciones para generar PDF');

  const PIE_PAGINA_MM = 10;
  const estiloReporte = 'background: #ffffff; font-family: Arial, sans-serif; color: #000000;';

  // Agrupar por ambiente (mismo patrón que Reportes)
  const porAmbiente: Record<string, Observacion[]> = {};
  observaciones.forEach(obs => {
    const key = obs.ambiente || 'Sin ambiente';
    if (!porAmbiente[key]) porAmbiente[key] = [];
    porAmbiente[key].push(obs);
  });

  const registrosPlanos: Observacion[] = [];
  Object.values(porAmbiente).forEach(fallas => fallas.forEach(r => registrosPlanos.push(r)));

  // Crear container oculto
  const container = document.createElement('div');
  container.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 750px;';
  document.body.appendChild(container);

  try {
    // ═══════════════════════════════════════════════════
    // HEADER (idéntico a Reportes.tsx)
    // ═══════════════════════════════════════════════════
    const headerEl = document.createElement('div');
    headerEl.style.cssText = `${estiloReporte} padding: 20px 24px 16px; border-bottom: 2px solid #1e3a5f; width: 750px;`;
    headerEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">INFORME PRE ENTREGA</div>
          <div style="font-size: 20px; font-weight: 700; color: #1e3a5f; margin-bottom: 8px;">${proyectoNombre}</div>
          <div style="display: flex; gap: 24px; font-size: 13px; color: #374151;">
            <span>Torre ${torreName}${torreFrente ? ` · ${torreFrente}` : ''}</span>
            <span>Depto ${deptoNumero}${deptoId_obra ? ` · ${deptoId_obra}` : ''}</span>
            <span>Fecha: ${new Date().toLocaleDateString('es-CL')}</span>
          </div>
        </div>
        <div style="text-align: center;">
          <img src="/logo-vain-azul.png" style="height: 100px; object-fit: contain; display: block;" alt="VAIN" />
          <div style="font-size: 9px; color: #9ca3af; margin-top: 4px; letter-spacing: 1px;">&lt;FMS&gt;</div>
        </div>
      </div>
    `;
    container.appendChild(headerEl);

    // ═══════════════════════════════════════════════════
    // RESUMEN POR AMBIENTE (idéntico a Reportes.tsx)
    // ═══════════════════════════════════════════════════
    const resumenEl = document.createElement('div');
    resumenEl.style.cssText = `${estiloReporte} padding: 16px 24px; width: 750px;`;

    let resumenRows = '';
    let idx = 0;
    Object.entries(porAmbiente).forEach(([amb, fallas]) => {
      const bg = idx % 2 === 0 ? '#f8fafc' : '#fff';
      const total = fallas.length;
      const pend = fallas.filter(f => f.estado === 'PENDIENTE' || f.estado === 'pendiente').length;
      const sol = fallas.filter(f => f.estado === 'SOLUCIONADO' || f.estado === 'solucionado').length;
      const apr = fallas.filter(f => f.estado === 'aprobado').length;
      resumenRows += `
        <tr style="background: ${bg};">
          <td style="padding: 7px 12px; border-bottom: 1px solid #e5e7eb;">${amb}</td>
          <td style="padding: 7px 12px; text-align: center; border-bottom: 1px solid #e5e7eb;">${total}</td>
          <td style="padding: 7px 12px; text-align: center; border-bottom: 1px solid #e5e7eb; color: #ef4444;">${pend}</td>
          <td style="padding: 7px 12px; text-align: center; border-bottom: 1px solid #e5e7eb; color: #3b82f6;">${sol}</td>
          <td style="padding: 7px 12px; text-align: center; border-bottom: 1px solid #e5e7eb; color: #22c55e;">${apr}</td>
        </tr>`;
      idx++;
    });

    const totalObs = observaciones.length;
    const totalPend = observaciones.filter(o => o.estado === 'PENDIENTE' || o.estado === 'pendiente').length;
    const totalSol = observaciones.filter(o => o.estado === 'SOLUCIONADO' || o.estado === 'solucionado').length;
    const totalApr = observaciones.filter(o => o.estado === 'aprobado').length;

    resumenEl.innerHTML = `
      <div style="font-size: 13px; font-weight: 700; color: #1e3a5f; margin-bottom: 10px;">RESUMEN POR AMBIENTE</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #1e3a5f; color: #fff;">
            <th style="padding: 8px 12px; text-align: left;">Ambiente</th>
            <th style="padding: 8px 12px; text-align: center;">Total</th>
            <th style="padding: 8px 12px; text-align: center;">Pendientes</th>
            <th style="padding: 8px 12px; text-align: center;">Solucionadas</th>
            <th style="padding: 8px 12px; text-align: center;">Aprobadas</th>
          </tr>
        </thead>
        <tbody>
          ${resumenRows}
          <tr style="background: #1e3a5f; color: #fff; font-weight: 700;">
            <td style="padding: 8px 12px;">TOTAL</td>
            <td style="padding: 8px 12px; text-align: center;">${totalObs}</td>
            <td style="padding: 8px 12px; text-align: center;">${totalPend}</td>
            <td style="padding: 8px 12px; text-align: center;">${totalSol}</td>
            <td style="padding: 8px 12px; text-align: center;">${totalApr}</td>
          </tr>
        </tbody>
      </table>
      <div style="font-size: 13px; font-weight: 700; color: #1e3a5f; margin-top: 20px; margin-bottom: 8px;">LISTA DE DETALLES</div>
    `;
    container.appendChild(resumenEl);

    // ═══════════════════════════════════════════════════
    // OBSERVACIONES POR AMBIENTE (idéntico a Reportes.tsx)
    // ═══════════════════════════════════════════════════
    const registrosEls: HTMLDivElement[] = [];
    const detallesContainer = document.createElement('div');
    detallesContainer.style.cssText = `${estiloReporte} padding: 0 24px; width: 750px;`;

    Object.entries(porAmbiente).forEach(([amb, fallas]) => {
      fallas.forEach((r, fIdx) => {
        const idxGlobal = registrosPlanos.indexOf(r);
        const el = document.createElement('div');
        el.style.cssText = `${estiloReporte} width: 750px;`;

        const estado = r.estado || 'PENDIENTE';
        const eColor = estadoColor[estado] || '#ef4444';
        const eLabel = estadoLabel[estado] || estado;

        let html = '';
        if (fIdx === 0) {
          html += `<div style="background: #1e3a5f; color: #fff; padding: 6px 12px; font-size: 12px; font-weight: 700;">${amb}</div>`;
        }

        html += `
          <div style="border: 1px solid #e5e7eb; background: ${fIdx % 2 === 0 ? '#f8fafc' : '#ffffff'}; padding: 12px; display: flex; gap: 12px; align-items: flex-start;">
            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 12px; font-weight: 600; color: #1e3a5f;">#${idxGlobal + 1} — ${r.partida_afectada || 'Sin partida'}</span>
                <span style="font-size: 10px; padding: 2px 8px; border-radius: 20px; background: ${eColor}20; color: ${eColor}; font-weight: 600;">${eLabel}</span>
              </div>
              <div style="font-size: 12px; color: #374151; margin-bottom: 4px;"><strong>Observación:</strong> ${r.observacion || '—'}</div>
              ${r.causa ? `<div style="font-size: 12px; color: #374151;"><strong>Causa:</strong> ${r.causa}</div>` : ''}
            </div>
            ${r.foto_url ? `<img data-foto-idx="${idxGlobal}" src="${r.foto_url}" crossorigin="anonymous" style="width: 200px; height: 150px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" />` : ''}
          </div>
        `;

        el.innerHTML = html;
        detallesContainer.appendChild(el);
        registrosEls.push(el);
      });
    });
    container.appendChild(detallesContainer);

    // Esperar a que el DOM se renderice
    await new Promise(r => setTimeout(r, 100));

    // ═══════════════════════════════════════════════════
    // COMPRIMIR FOTOS (mismo patrón que Reportes.tsx)
    // ═══════════════════════════════════════════════════
    onProgreso?.('Preparando informe...', 0);
    const fotosComprimidas: Record<number, string> = {};
    let fotosConUrl = 0;
    const totalFotos = registrosPlanos.filter(r => r.foto_url).length;

    for (let i = 0; i < registrosPlanos.length; i++) {
      const r = registrosPlanos[i];
      if (r.foto_url) {
        fotosConUrl++;
        onProgreso?.(`Comprimiendo foto ${fotosConUrl}/${totalFotos}...`, Math.round((fotosConUrl / totalFotos) * 40));
        try {
          const b64 = await comprimirImagenUrl(r.foto_url!);
          if (b64) fotosComprimidas[i] = b64;
        } catch {}
        await new Promise(r => setTimeout(r, 80));
      }
    }

    // Asignar fotos comprimidas
    onProgreso?.('Generando páginas del PDF...', 45);
    container.querySelectorAll('[data-foto-idx]').forEach((el: Element) => {
      const i = parseInt((el as HTMLElement).dataset.fotoIdx ?? '-1');
      if (fotosComprimidas[i]) (el as HTMLImageElement).src = fotosComprimidas[i];
    });
    await new Promise(r => setTimeout(r, 100));

    // ═══════════════════════════════════════════════════
    // GENERAR PDF (mismo patrón que Reportes.tsx)
    // ═══════════════════════════════════════════════════
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const margen = 10;
    const anchoUtil = pdfW - margen * 2;
    let cursorY = margen;

    const agregarCanvas = (canvas: HTMLCanvasElement, saltoSiNoCabe = true) => {
      const imgH = (canvas.height * anchoUtil) / canvas.width;
      if (saltoSiNoCabe && cursorY + imgH > pdfH - margen - PIE_PAGINA_MM) {
        pdf.addPage(); cursorY = margen;
      }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margen, cursorY, anchoUtil, imgH);
      cursorY += imgH + 4;
    };

    // Capturar header
    onProgreso?.('Capturando encabezado...', 50);
    agregarCanvas(await capturarElemento(headerEl), false);

    // Capturar resumen
    onProgreso?.('Capturando resumen...', 55);
    agregarCanvas(await capturarElemento(resumenEl));

    // Capturar cada registro (igual que Reportes)
    const total = registrosEls.length;
    for (let i = 0; i < registrosEls.length; i++) {
      const el = registrosEls[i];
      onProgreso?.(`Procesando registro ${i + 1} de ${total}...`, 55 + Math.round((i / total) * 40));
      const canvas = await capturarElemento(el);
      const imgH = (canvas.height * anchoUtil) / canvas.width;
      if (cursorY + imgH > pdfH - margen - PIE_PAGINA_MM) { pdf.addPage(); cursorY = margen; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margen, cursorY, anchoUtil, imgH);
      cursorY += imgH + 3;
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 50));
    }

    // Pies de página
    agregarPiesDePagina(pdf, margen);

    // Guardar
    onProgreso?.('Guardando archivo...', 97);
    const nombre = `Informe_PreEntrega_${proyectoNombre}_Torre${torreName}_Depto${deptoNumero}.pdf`.replace(/\s+/g, '_');
    await guardarPDF(pdf, nombre);

    onProgreso?.('', 100);
    return nombre;
  } finally {
    document.body.removeChild(container);
  }
};
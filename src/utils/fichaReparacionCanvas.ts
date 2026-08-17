// src/utils/fichaReparacionCanvas.ts
// Compone una "ficha de reparación" (afiche vertical) como imagen PNG para
// compartir por WhatsApp. Aplana el plano del ambiente (imagen de fondo del
// bucket público + recuadros cian de los elementos) en un solo canvas, más
// una tabla de reparaciones con sus valores y el total del depto.
// FMS · Agosto 2026
//
// Unidad atómica: 1 ficha = 1 depto, 1 gremio. Las imágenes de ambiente se
// cargan con crossOrigin='anonymous' (bucket público) para poder exportar el
// canvas sin "tainting". Fallback: fetch→blob→objectURL si el crossOrigin falla.

export interface FichaObs {
  elemento: string;
  tipo_revision: string | null; // MURO | PIERNA | VANO
  reparacion: string;           // etiqueta legible: Picado / Puntereo / Copa / Yeso
  valor: number;                // $ (0 si sin tarifa)
}

export interface FichaElemento {
  elemento: string;
  pos_x: number; pos_y: number; ancho: number; alto: number;
}

export interface FichaAmbiente {
  titulo: string;
  imagen_url: string | null;
  ancho_orig: number;
  alto_orig: number;
  elementos: FichaElemento[]; // solo los que tienen obs del gremio
  obs: FichaObs[];            // obs del gremio en este ambiente
}

export interface FichaData {
  gremio: 'albanileria' | 'yeso';
  gremioLabel: string;    // 'ALBAÑILERÍA' | 'YESO'
  proyecto: string;
  torre: string;
  piso: number | null;
  depto: number | string;
  idObra: string | null;  // ej '1F24.2' → posición del depto en la planta
  frente: string | null;  // ej 'F23-24' → pares de la torre (impar izq, par der)
  ambientes: FichaAmbiente[];
  total: number;
}

// Carga una imagen apta para canvas export (crossOrigin anónimo; fallback blob).
const cargarImagen = (url: string): Promise<HTMLImageElement | null> =>
  new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = async () => {
      // Fallback: descargar como blob y usar objectURL (mismo origen efectivo)
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

const fmtCLP = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

// Colores (claros, alto contraste; ficha siempre en fondo claro para imprimir/leer)
const C = {
  fondo: '#ffffff',
  barra: '#1e3a5f',
  barraAlb: '#0e7490',   // cian oscuro para albañilería
  barraYeso: '#7c3aed',  // violeta para yeso
  texto: '#0f172a',
  textoSuave: '#64748b',
  linea: '#e2e8f0',
  hotspot: '#06b6d4',
  hotspotFill: 'rgba(6,182,212,0.28)',
  verde: '#15803d',
  chipBg: '#ecfeff',
};

// Envuelve texto en varias líneas si excede el ancho
const wrap = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
};

// ── Ubicación en la planta (mini-mapa) ───────────────────────────────────────
// frente: 'F23-24' → [23,24] (impar izquierda, par derecha). 'F27' → [27] medio frente.
const parsearFrente = (frente: string | null): number[] => {
  if (!frente) return [];
  return frente.toUpperCase().replace(/\s/g, '').replace(/^F/, '')
    .split('-').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
};
// id_obra: '1F24.2' → { piso:1, par:24, suf:2 }
const parsearIdObra = (idObra: string | null) => {
  const m = (idObra || '').match(/(\d+)\s*F\s*(\d+)\s*\.\s*(\d+)/i);
  if (!m) return null;
  return { piso: +m[1], par: +m[2], suf: +m[3] };
};

// Dibuja el mini-mapa de ubicación. Devuelve el alto consumido.
const dibujarUbicacion = (
  ctx: CanvasRenderingContext2D,
  x: number, yTop: number, w: number,
  data: FichaData,
): number => {
  const pares = parsearFrente(data.frente);
  const info  = parsearIdObra(data.idObra);
  if (pares.length === 0 || !info) return 0; // sin datos → no dibujar

  const piso    = info.piso ?? (data.piso ?? 1);
  const parIzq  = pares.find(n => n % 2 === 1) ?? pares[0];
  const parDer  = pares.length >= 2 ? (pares.find(n => n % 2 === 0) ?? pares[1]) : null;
  const dobleCol = parDer !== null;

  // Layout (compacto)
  const tituloH = 24;
  const accesoH = 18;
  const gap = 10;
  const cellH = 62;
  const gridH = accesoH + cellH * 2 + gap + accesoH;
  const totalH = tituloH + gridH + 16;

  // Título
  ctx.fillStyle = '#64748b';
  ctx.font = '600 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('UBICACIÓN EN LA PLANTA', x, yTop + 4);

  let y = yTop + tituloH;

  // ACCESO superior
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ACCESO', x + w / 2, y + 3);
  y += accesoH;

  // Mini-mapa más angosto que el ancho total (se ve más "plano", no gigante)
  const mapaW = Math.min(w, 420);
  const x0 = x + (w - mapaW) / 2;
  const colW = dobleCol ? (mapaW - gap) / 2 : mapaW * 0.5;
  const xIzq = x0 + (dobleCol ? 0 : (mapaW - colW) / 2);
  const xDer = x0 + colW + gap;

  // Dibuja una celda (rótulo estilo id_obra), resaltando la activa
  const celda = (cx: number, cy: number, par: number, suf: number) => {
    const activa = par === info.par && suf === info.suf;
    ctx.fillStyle = activa ? 'rgba(74,222,128,0.35)' : '#ffffff';
    ctx.strokeStyle = activa ? '#15803d' : '#cbd5e1';
    ctx.lineWidth = activa ? 2.5 : 1.25;
    ctx.fillRect(cx, cy, colW, cellH);
    ctx.strokeRect(cx, cy, colW, cellH);
    const label = `${piso}F${par}.${suf}`;
    ctx.font = '700 17px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const tw = ctx.measureText(label).width + 18;
    const px = cx + (colW - tw) / 2;
    const py = cy + (cellH - 26) / 2;
    ctx.fillStyle = activa ? '#15803d' : '#1e3a5f';
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.arcTo(px + tw, py, px + tw, py + 26, r);
    ctx.arcTo(px + tw, py + 26, px, py + 26, r);
    ctx.arcTo(px, py + 26, px, py, r);
    ctx.arcTo(px, py, px + tw, py, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + tw / 2, py + 14);
    ctx.textBaseline = 'top';
  };

  // Fila superior (.2) y fila inferior (.1)
  celda(xIzq, y, parIzq, 2);
  if (dobleCol && parDer !== null) celda(xDer, y, parDer, 2);
  y += cellH + gap;
  celda(xIzq, y, parIzq, 1);
  if (dobleCol && parDer !== null) celda(xDer, y, parDer, 1);
  y += cellH;

  // ACCESO inferior
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ACCESO', x + w / 2, y + 3);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  return totalH;
};

// Alto estimado del mini-mapa (para el layout previo); 0 si no hay datos.
const altoUbicacion = (data: FichaData): number => {
  const pares = parsearFrente(data.frente);
  const info  = parsearIdObra(data.idObra);
  if (pares.length === 0 || !info) return 0;
  const tituloH = 24, accesoH = 18, gap = 10, cellH = 62;
  return tituloH + (accesoH + cellH * 2 + gap + accesoH) + 16;
};

/**
 * Genera la ficha como Blob PNG. Ancho fijo 1080px (nítido en WhatsApp).
 */
export const generarFichaReparacion = async (data: FichaData): Promise<Blob> => {
  const W = 1080;
  const PAD = 40;
  const innerW = W - PAD * 2;
  const scale = 2; // densidad para nitidez

  // Pre-cargar todas las imágenes de ambiente
  const imgs = await Promise.all(
    data.ambientes.map(a => (a.imagen_url ? cargarImagen(a.imagen_url) : Promise.resolve(null)))
  );

  // ── PASO 1: medir alto total (layout) ──────────────────────────────────────
  // Creamos un canvas temporal solo para medir texto.
  const meas = document.createElement('canvas').getContext('2d')!;
  const rowH = 34;          // alto de fila de tabla
  const headerH = 150;      // barra superior
  const ambTituloH = 46;
  const ambGap = 28;
  const tablaHeadH = 34;
  const footerH = 90;

  // Alto de imagen de cada ambiente al ancho innerW
  const ambImgH: number[] = data.ambientes.map((a, i) => {
    const img = imgs[i];
    if (!img || !a.ancho_orig) return 0;
    return (a.alto_orig / a.ancho_orig) * innerW;
  });

  let totalH = headerH + 24;
  const ubicH = altoUbicacion(data);
  totalH += ubicH;
  data.ambientes.forEach((a, i) => {
    totalH += ambTituloH;
    totalH += ambImgH[i] + 12;
    totalH += tablaHeadH;
    totalH += a.obs.length * rowH;
    totalH += ambGap;
  });
  totalH += footerH + PAD;

  // ── PASO 2: pintar ─────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = Math.ceil(totalH) * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Fondo
  ctx.fillStyle = C.fondo;
  ctx.fillRect(0, 0, W, totalH);

  // Barra superior (color según gremio)
  const barraColor = data.gremio === 'yeso' ? C.barraYeso : C.barraAlb;
  ctx.fillStyle = barraColor;
  ctx.fillRect(0, 0, W, headerH);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(data.gremioLabel, PAD, 28);

  ctx.font = '500 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const pisoTxt = data.piso === null || data.piso === -1 ? '' : ` · Piso ${data.piso}`;
  ctx.fillText(`${data.proyecto}`, PAD, 78);
  ctx.font = '700 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillStyle = '#ffffff';
  const idLabel = data.idObra || `Depto ${data.depto}`;
  ctx.fillText(`Torre ${data.torre}${pisoTxt} · ${idLabel}`, PAD, 108);

  let y = headerH + 24;

  // Mini-mapa de ubicación en la planta (si hay datos de frente/id_obra)
  if (ubicH > 0) {
    const usado = dibujarUbicacion(ctx, PAD, y, innerW, data);
    y += usado;
  }

  // Por cada ambiente
  data.ambientes.forEach((a, i) => {
    // Título ambiente
    ctx.fillStyle = C.texto;
    ctx.font = '700 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(a.titulo, PAD, y + 8);
    y += ambTituloH;

    // Imagen del ambiente (vertical/natural) + recuadros
    const img = imgs[i];
    const imgH = ambImgH[i];
    if (img && imgH > 0) {
      const x0 = PAD, y0 = y;
      // fondo por si la imagen tiene transparencias
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x0, y0, innerW, imgH);
      ctx.drawImage(img, x0, y0, innerW, imgH);

      // Escalado idéntico al de la app: pos/orig × render
      const sx = innerW / a.ancho_orig;
      const sy = imgH / a.alto_orig;
      a.elementos.forEach(el => {
        const rx = x0 + el.pos_x * sx;
        const ry = y0 + el.pos_y * sy;
        const rw = el.ancho * sx;
        const rh = el.alto * sy;
        ctx.fillStyle = C.hotspotFill;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = C.hotspot;
        ctx.lineWidth = 3;
        ctx.strokeRect(rx, ry, rw, rh);
        // etiqueta del elemento
        ctx.font = '700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        const lbl = el.elemento;
        const tw = ctx.measureText(lbl).width + 10;
        const lx = Math.min(rx, x0 + innerW - tw);
        const ly = Math.max(y0, ry - 22);
        ctx.fillStyle = '#0891b2';
        ctx.fillRect(lx, ly, tw, 20);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(lbl, lx + 5, ly + 2);
      });

      // borde de la imagen
      ctx.strokeStyle = C.linea;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, innerW, imgH);
      y += imgH + 12;
    }

    // Tabla de reparaciones del ambiente
    // Columnas: Elemento | Tipo | Reparación | Valor
    const colX = [PAD, PAD + innerW * 0.42, PAD + innerW * 0.62, PAD + innerW * 0.84];
    ctx.fillStyle = C.textoSuave;
    ctx.font = '600 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('Elemento', colX[0], y + 8);
    ctx.fillText('Tipo', colX[1], y + 8);
    ctx.fillText('Reparación', colX[2], y + 8);
    ctx.textAlign = 'right';
    ctx.fillText('Valor', PAD + innerW, y + 8);
    ctx.textAlign = 'left';
    y += tablaHeadH;
    ctx.strokeStyle = C.linea;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + innerW, y); ctx.stroke();

    a.obs.forEach(ob => {
      ctx.font = '500 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = C.texto;
      // elemento (recortado si muy largo)
      let elTxt = ob.elemento;
      const maxElW = innerW * 0.40;
      while (ctx.measureText(elTxt).width > maxElW && elTxt.length > 4) elTxt = elTxt.slice(0, -2);
      if (elTxt !== ob.elemento) elTxt += '…';
      ctx.fillText(elTxt, colX[0], y + 6);

      ctx.fillStyle = C.textoSuave;
      ctx.font = '500 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(ob.tipo_revision || '—', colX[1], y + 7);
      ctx.fillText(ob.reparacion, colX[2], y + 7);

      ctx.textAlign = 'right';
      ctx.fillStyle = ob.valor > 0 ? C.verde : C.textoSuave;
      ctx.font = '700 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(ob.valor > 0 ? fmtCLP(ob.valor) : '—', PAD + innerW, y + 6);
      ctx.textAlign = 'left';

      y += rowH;
      ctx.strokeStyle = C.linea;
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + innerW, y); ctx.stroke();
    });

    y += ambGap;
  });

  // Footer: total del depto
  ctx.fillStyle = data.gremio === 'yeso' ? '#f5f3ff' : '#ecfeff';
  ctx.fillRect(0, y, W, footerH);
  ctx.fillStyle = C.texto;
  ctx.font = '600 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(`Total ${data.gremioLabel.toLowerCase()} · ${data.idObra || `Depto ${data.depto}`}`, PAD, y + 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = data.total > 0 ? C.verde : C.textoSuave;
  ctx.font = '800 36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(data.total > 0 ? fmtCLP(data.total) : 'Sin tarifa', PAD + innerW, y + 26);
  ctx.textAlign = 'left';

  // Exportar
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob null'))), 'image/png', 0.95);
  });
};
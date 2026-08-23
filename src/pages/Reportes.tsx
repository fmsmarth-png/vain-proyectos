import {
  IonContent, IonPage, IonHeader, IonToolbar,
  IonTitle, IonSpinner, IonMenuButton
} from '@ionic/react';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabase';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { useTheme } from '../Context/ThemeContext';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { cache } from '../Context/CacheContext';

const estadoLabel: Record<string, string> = {
  pendiente:   'Pendiente',
  solucionado: 'Solucionado',
  aprobado:    'Aprobado',
  rechazado:   'Rechazado',
};

const estadoColor: Record<string, string> = {
  pendiente:   '#ef4444',
  solucionado: '#3b82f6',
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

const Reportes: React.FC = () => {
  const headerRef       = useRef<HTMLDivElement>(null);
  const resumenRef      = useRef<HTMLDivElement>(null);
  const registrosRefs   = useRef<(HTMLDivElement | null)[]>([]);
  const zcHeaderRef     = useRef<HTMLDivElement>(null);
  const zcResumenRef    = useRef<HTMLDivElement>(null);
  const zcRegistrosRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg          = dark ? '#0B1220' : '#f0f4f8';
  const border      = dark ? '#243550'  : '#e2e8f0';
  const textPrimary = dark ? '#f9fafb' : '#0f172a';
  const textMuted   = dark ? '#5D728F' : '#94a3b8';
  const toolbar     = dark ? '#0E1728' : '#1e3a5f';
  const inputBg     = dark ? '#1B2C48' : '#ffffff';
  const inputBorder = dark ? '#243550' : '#cbd5e1';
  const sepLine     = dark
    ? 'linear-gradient(90deg, transparent, #243550, transparent)'
    : 'linear-gradient(90deg, transparent, #e2e8f0, transparent)';

  const [proyectos, setProyectos]     = useState<any[]>([]);
  const [torres, setTorres]           = useState<any[]>([]);
  const [deptos, setDeptos]           = useState<any[]>([]);
  const [registros, setRegistros]     = useState<any[]>([]);
  const [registrosZC, setRegistrosZC] = useState<any[]>([]);

  const [proyectoId, setProyectoId]     = useState('');
  const [torreId, setTorreId]           = useState('');
  const [deptoId, setDeptoId]           = useState('');
  const [zonaComunId, setZonaComunId]   = useState<string | null>(null);

  const [proyectoSel, setProyectoSel] = useState<any>(null);
  const [torreSel, setTorreSel]       = useState<any>(null);
  const [deptoSel, setDeptoSel]       = useState<any>(null);

  const [mostrarReporte, setMostrarReporte]     = useState(false);
  const [mostrarReporteZC, setMostrarReporteZC] = useState(false);

  const [loading, setLoading]         = useState(true);
  const [generando, setGenerando]     = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [aviso, setAviso]             = useState('');
  const [descargaOk, setDescargaOk]   = useState('');
  const [progreso, setProgreso]       = useState('');
  const [progresoNum, setProgresoNum] = useState(0);

  const esZC = deptoId === '__ZC__';

  // Constantes PDF
  const PIE_PAGINA_MM = 10; // mm reservados para el pie en cada página

  useEffect(() => { cargarProyectos(); }, []);

  useEffect(() => {
    if (proyectoId) {
      cargarTorres(proyectoId);
      setTorreId(''); setDeptoId(''); setZonaComunId(null);
      setAviso(''); setMostrarReporte(false); setMostrarReporteZC(false);
      setProyectoSel(proyectos.find(p => p.id === proyectoId));
    }
  }, [proyectoId]);

  useEffect(() => {
    if (torreId) {
      cargarDeptos(torreId);
      setDeptoId(''); setZonaComunId(null);
      setAviso(''); setMostrarReporte(false); setMostrarReporteZC(false);
      setTorreSel(torres.find(t => t.id === torreId));
    }
  }, [torreId]);

  useEffect(() => {
    if (!deptoId) return;
    setMostrarReporte(false); setMostrarReporteZC(false); setAviso('');
    if (deptoId === '__ZC__') {
      setDeptoSel(null);
      (async () => {
        const { data } = await supabase
          .from('zonas_comunes')
          .select('id')
          .eq('torre_id', torreId)
          .eq('tipo', 'general')
          .maybeSingle();
        setZonaComunId(data?.id ?? null);
        if (!data?.id) setAviso('No se encontró zona común para esta torre. Entrá a ZC desde el detalle del proyecto para crearla.');
      })();
    } else {
      setZonaComunId(null);
      setDeptoSel(deptos.find(d => d.id === deptoId));
    }
  }, [deptoId]);

  const cargarProyectos = async () => {
    setLoading(true);
    const proyCache = cache.getProyectos();
    if (proyCache.length > 0) setProyectos(proyCache);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: perfil }   = await supabase.from('usuarios').select('rol').eq('id', user!.id).single();
      let proy;
      if (perfil?.rol === 'administrador') {
        const { data } = await supabase.from('proyectos').select('*').order('nombre');
        proy = data;
      } else {
        const { data: asignados } = await supabase.from('usuario_proyectos').select('proyecto_id').eq('usuario_id', user!.id);
        const ids = asignados?.map(a => a.proyecto_id) ?? [];
        const { data } = await supabase.from('proyectos').select('*').in('id', ids).order('nombre');
        proy = data;
      }
      if (proy) { setProyectos(proy); cache.setProyectos(proy); }
    } catch {}
    setLoading(false);
  };

  const cargarTorres = async (pId: string) => {
    const cached = cache.getTorres(pId);
    if (cached.length > 0) setTorres(cached);
    try {
      const { data } = await supabase.from('torres').select('*').eq('proyecto_id', pId).order('nombre');
      if (data) { setTorres(data); cache.setTorres(pId, data); }
    } catch {}
  };

  const cargarDeptos = async (tId: string) => {
    const cached = cache.getDeptos(tId);
    if (cached.length > 0) setDeptos(cached);
    try {
      const { data } = await supabase.from('departamentos').select('*').eq('torre_id', tId).order('numero');
      if (data) { setDeptos(data); cache.setDeptos(tId, data); }
    } catch {}
  };

  const cargarRegistros = async () => {
    setGenerando(true);
    const { data } = await supabase
      .from('registros')
      .select('*, ambientes (nombre), partidas (nombre)')
      .eq('departamento_id', deptoId)
      .order('creado_en', { ascending: true });
    if (!data || data.length === 0) {
      setAviso('Este departamento no tiene registros de fallas.');
      setMostrarReporte(false);
    } else {
      setAviso('');
      setRegistros(data);
      registrosRefs.current = new Array(data.length).fill(null);
      setMostrarReporte(true);
    }
    setGenerando(false);
  };

  const cargarRegistrosZC = async () => {
    if (!zonaComunId) return;
    setGenerando(true);
    const { data, error } = await supabase
      .from('registros_zonas_comunes')
      .select(`
        id, observacion, causa, estado, creado_en, foto_url, piso,
        ambientes_zc (nombre),
        partidas (nombre)
      `)
      .eq('zona_comun_id', zonaComunId)
      .order('piso', { ascending: true })
      .order('creado_en', { ascending: true });
    if (error || !data || data.length === 0) {
      setAviso('Esta zona común no tiene observaciones registradas.');
      setMostrarReporteZC(false);
      setGenerando(false);
      return;
    }
    setAviso('');
    setRegistrosZC(data);
    zcRegistrosRefs.current = new Array(data.length).fill(null);
    setMostrarReporteZC(true);
    setGenerando(false);
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
    const esAndroid = (window as any).Capacitor?.isNativePlatform?.() ?? false;
    if (esAndroid) {
      const pdfBlob = pdf.output('blob'), arrayBuffer = await pdfBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i += 8192) binary += String.fromCharCode(...uint8Array.subarray(i, i + 8192));
      const base64 = btoa(binary);
      const result = await Filesystem.writeFile({ path: nombre, data: base64, directory: Directory.Cache });
      await Share.share({ title: nombre, url: result.uri, dialogTitle: 'Compartir o guardar PDF' });
      setDescargaOk('✅ PDF listo para compartir');
    } else {
      pdf.save(nombre);
      setDescargaOk('✅ PDF descargado correctamente');
    }
    setTimeout(() => setDescargaOk(''), 5000);
  };

  // Agrega pie de página en todas las páginas del PDF
  const agregarPiesDePagina = (pdf: jsPDF, margen: number) => {
    const pdfW  = pdf.internal.pageSize.getWidth();
    const pdfH  = pdf.internal.pageSize.getHeight();
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(
        'Reporte generado por App VAIN Proyectos.   <FMS>',
        pdfW / 2,
        pdfH - 5,
        { align: 'center' }
      );
      pdf.text(`Pág. ${p} / ${total}`, pdfW - margen, pdfH - 5, { align: 'right' });
    }
  };

  const generarPDF = async () => {
    if (!headerRef.current || !resumenRef.current) return;
    setDescargando(true); setProgreso('Preparando informe...'); setProgresoNum(0);
    try {
      const total = registrosRefs.current.filter(Boolean).length;
      const fotosComprimidas: Record<number, string> = {};
      let fotosConUrl = 0;
      for (let i = 0; i < registrosPlanos.length; i++) {
        const r = registrosPlanos[i];
        if (r.foto_url) {
          fotosConUrl++;
          setProgreso(`Comprimiendo foto ${fotosConUrl}/${registros.filter(x => x.foto_url).length}...`);
          setProgresoNum(Math.round((i / registrosPlanos.length) * 40));
          try { const b64 = await comprimirImagenUrl(r.foto_url); if (b64) fotosComprimidas[i] = b64; } catch {}
          await new Promise(r => setTimeout(r, 80));
        }
      }
      setProgreso('Generando páginas del PDF...'); setProgresoNum(45);
      document.querySelectorAll('[data-foto-idx]').forEach(el => {
        const idx = parseInt((el as HTMLElement).dataset.fotoIdx ?? '-1');
        if (fotosComprimidas[idx]) (el as HTMLImageElement).src = fotosComprimidas[idx];
      });
      await new Promise(r => setTimeout(r, 100));

      const pdf      = new jsPDF('p', 'mm', 'a4');
      const pdfW     = pdf.internal.pageSize.getWidth();
      const pdfH     = pdf.internal.pageSize.getHeight();
      const margen   = 10;
      const anchoUtil = pdfW - margen * 2;
      let cursorY    = margen;

      // agregarCanvas respeta el área reservada para el pie
      const agregarCanvas = (canvas: HTMLCanvasElement, saltoSiNoCabe = true) => {
        const imgH = (canvas.height * anchoUtil) / canvas.width;
        if (saltoSiNoCabe && cursorY + imgH > pdfH - margen - PIE_PAGINA_MM) {
          pdf.addPage(); cursorY = margen;
        }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margen, cursorY, anchoUtil, imgH);
        cursorY += imgH + 4;
      };

      setProgreso('Capturando encabezado...'); setProgresoNum(50);
      agregarCanvas(await capturarElemento(headerRef.current), false);
      setProgreso('Capturando resumen...'); setProgresoNum(55);
      agregarCanvas(await capturarElemento(resumenRef.current));

      for (let i = 0; i < registrosRefs.current.length; i++) {
        const el = registrosRefs.current[i]; if (!el) continue;
        setProgreso(`Procesando registro ${i + 1} de ${total}...`);
        setProgresoNum(55 + Math.round((i / total) * 40));
        const canvas = await capturarElemento(el);
        const imgH   = (canvas.height * anchoUtil) / canvas.width;
        if (cursorY + imgH > pdfH - margen - PIE_PAGINA_MM) { pdf.addPage(); cursorY = margen; }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margen, cursorY, anchoUtil, imgH);
        cursorY += imgH + 3;
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 50));
      }

      agregarPiesDePagina(pdf, margen);

      setProgreso('Guardando archivo...'); setProgresoNum(97);
      const nombre = `Informe_${proyectoSel?.nombre}_Torre${torreSel?.nombre}_Depto${deptoSel?.numero}.pdf`.replace(/\s+/g, '_');
      await guardarPDF(pdf, nombre);
      setProgresoNum(100); setProgreso('');
    } catch (e: any) { setAviso('Error al generar PDF: ' + e.message); setProgreso(''); }
    setDescargando(false); setProgresoNum(0);
  };

  const generarPDFZC = async () => {
    if (!zcHeaderRef.current || !zcResumenRef.current) return;
    setDescargando(true); setProgreso('Preparando informe ZC...'); setProgresoNum(0);
    try {
      const total = zcRegistrosRefs.current.filter(Boolean).length;
      const fotosComprimidas: Record<number, string> = {};
      let fotosConUrl = 0;
      for (let i = 0; i < registrosZC.length; i++) {
        const r = registrosZC[i];
        if (r.foto_url) {
          fotosConUrl++;
          setProgreso(`Comprimiendo foto ${fotosConUrl}/${registrosZC.filter((x: any) => x.foto_url).length}...`);
          setProgresoNum(Math.round((i / registrosZC.length) * 40));
          try { const b64 = await comprimirImagenUrl(r.foto_url); if (b64) fotosComprimidas[i] = b64; } catch {}
          await new Promise(r => setTimeout(r, 80));
        }
      }
      setProgreso('Generando páginas del PDF...'); setProgresoNum(45);
      document.querySelectorAll('[data-zc-foto-idx]').forEach(el => {
        const idx = parseInt((el as HTMLElement).dataset.zcFotoIdx ?? '-1');
        if (fotosComprimidas[idx]) (el as HTMLImageElement).src = fotosComprimidas[idx];
      });
      await new Promise(r => setTimeout(r, 100));

      const pdf      = new jsPDF('p', 'mm', 'a4');
      const pdfW     = pdf.internal.pageSize.getWidth();
      const pdfH     = pdf.internal.pageSize.getHeight();
      const margen   = 10;
      const anchoUtil = pdfW - margen * 2;
      let cursorY    = margen;

      // agregarCanvas respeta el área reservada para el pie
      const agregarCanvas = (canvas: HTMLCanvasElement, saltoSiNoCabe = true) => {
        const imgH = (canvas.height * anchoUtil) / canvas.width;
        if (saltoSiNoCabe && cursorY + imgH > pdfH - margen - PIE_PAGINA_MM) {
          pdf.addPage(); cursorY = margen;
        }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margen, cursorY, anchoUtil, imgH);
        cursorY += imgH + 4;
      };

      setProgreso('Capturando encabezado...'); setProgresoNum(50);
      agregarCanvas(await capturarElemento(zcHeaderRef.current), false);
      setProgreso('Capturando resumen...'); setProgresoNum(55);
      agregarCanvas(await capturarElemento(zcResumenRef.current));

      for (let i = 0; i < zcRegistrosRefs.current.length; i++) {
        const el = zcRegistrosRefs.current[i]; if (!el) continue;
        setProgreso(`Procesando registro ${i + 1} de ${total}...`);
        setProgresoNum(55 + Math.round((i / total) * 40));
        const canvas = await capturarElemento(el);
        const imgH   = (canvas.height * anchoUtil) / canvas.width;
        if (cursorY + imgH > pdfH - margen - PIE_PAGINA_MM) { pdf.addPage(); cursorY = margen; }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', margen, cursorY, anchoUtil, imgH);
        cursorY += imgH + 3;
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 50));
      }

      agregarPiesDePagina(pdf, margen);

      setProgreso('Guardando archivo...'); setProgresoNum(97);
      const nombre = `Informe_ZC_${proyectoSel?.nombre}_Torre${torreSel?.nombre}.pdf`.replace(/\s+/g, '_');
      await guardarPDF(pdf, nombre);
      setProgresoNum(100); setProgreso('');
    } catch (e: any) { setAviso('Error al generar PDF ZC: ' + e.message); setProgreso(''); }
    setDescargando(false); setProgresoNum(0);
  };

  const obtenerRegistros = async (filtro: any) => {
    const { data } = await supabase
      .from('registros')
      .select(`*, proyectos (nombre), torres (nombre, frente), departamentos (numero, id_obra), ambientes (nombre), partidas (nombre), usuarios!registros_creado_por_fkey (nombre)`)
      .match(filtro)
      .order('creado_en', { ascending: true });
    return data ?? [];
  };

  const exportarExcel = async (nombre: string, wbOverride?: XLSX.WorkBook, filas?: any[]) => {
    let wb: XLSX.WorkBook;
    if (wbOverride) {
      wb = wbOverride;
    } else {
      if (!filas) return;
      const filasFormateadas = filas.map((r: any) => {
        const causaTexto = r.causa ?? '', esTercero = causaTexto.includes(' — ');
        return {
          'Proyecto':              r.proyectos?.nombre ?? '',
          'Torre':                 r.torres?.nombre ?? '',
          'Frente':                r.torres?.frente ?? '',
          'Depto N°':              r.departamentos?.numero ?? '',
          'Depto ID Obra':         r.departamentos?.id_obra ?? '',
          'Ambiente':              r.ambientes?.nombre ?? '',
          'Partida':               r.partidas?.nombre ?? '',
          'Observación':           r.observacion ?? '',
          'Causa':                 esTercero ? causaTexto.split(' — ')[0] : causaTexto,
          'Cuadrilla Responsable': esTercero ? causaTexto.split(' — ')[1] : '',
          'Estado':                r.estado ?? '',
          'Fecha':                 r.creado_en ? new Date(r.creado_en).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '',
          'Registrado por':        r.usuarios?.nombre ?? '',
        };
      });
      const ws = XLSX.utils.json_to_sheet(filasFormateadas);
      ws['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 40 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
      wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Registros');
    }
    const nombreLimpio = nombre.replace(/\s+/g, '_').replace(/[/\\?%*:|"<>]/g, '-');
    const esAndroid = (window as any).Capacitor?.isNativePlatform?.() ?? false;
    if (esAndroid) {
      try {
        const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const result = await Filesystem.writeFile({ path: nombreLimpio, data: base64, directory: Directory.Cache });
        await Share.share({ title: nombreLimpio, url: result.uri, dialogTitle: 'Compartir o guardar Excel' });
        setDescargaOk('✅ Excel listo para compartir');
        setTimeout(() => setDescargaOk(''), 5000);
      } catch (e: any) { setAviso('Error al compartir Excel: ' + e.message); }
    } else {
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob  = new Blob([wbout], { type: 'application/octet-stream' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a'); a.href = url; a.download = nombreLimpio; a.click();
      URL.revokeObjectURL(url);
      setDescargaOk('✅ Excel descargado correctamente');
      setTimeout(() => setDescargaOk(''), 5000);
    }
  };

  const generarExcelDepto = async () => {
    setGenerando(true);
    const data = await obtenerRegistros({ departamento_id: deptoId });
    if (!data?.length) { setAviso('Este departamento no tiene registros.'); }
    else { setAviso(''); await exportarExcel(`Registros_${proyectoSel?.nombre}_Torre${torreSel?.nombre}_Depto${deptoSel?.numero}.xlsx`, undefined, data); }
    setGenerando(false);
  };

  const generarExcelTorre = async () => {
    if (!torreId) return;
    setGenerando(true);
    const data = await obtenerRegistros({ torre_id: torreId });
    if (!data?.length) { setAviso('Esta torre no tiene registros.'); }
    else { setAviso(''); await exportarExcel(`Registros_${proyectoSel?.nombre}_Torre${torreSel?.nombre}.xlsx`, undefined, data); }
    setGenerando(false);
  };

  const generarExcelProyecto = async () => {
    if (!proyectoId) return;
    setGenerando(true);
    const data = await obtenerRegistros({ proyecto_id: proyectoId });
    if (!data?.length) { setAviso('Este proyecto no tiene registros.'); }
    else { setAviso(''); await exportarExcel(`Registros_${proyectoSel?.nombre}.xlsx`, undefined, data); }
    setGenerando(false);
  };

  const generarExcelZC_Observaciones = async () => {
    if (!zonaComunId) { setAviso('No se encontró zona común para esta torre.'); return; }
    setGenerando(true);
    const { data, error } = await supabase
      .from('registros_zonas_comunes')
      .select(`
        id, observacion, causa, estado, creado_en, foto_url, piso,
        ambientes_zc (nombre),
        partidas (nombre),
        usuarios!registros_zonas_comunes_creado_por_fkey (nombre)
      `)
      .eq('zona_comun_id', zonaComunId)
      .order('piso', { ascending: true })
      .order('creado_en', { ascending: true });
    if (error || !data?.length) {
      setAviso('Esta zona común no tiene observaciones registradas.');
      setGenerando(false);
      return;
    }
    const filas = data.map((r: any) => {
      const causaTexto = r.causa ?? '', esTercero = causaTexto.includes(' — ');
      return {
        'Proyecto':              proyectoSel?.nombre ?? '',
        'Torre':                 `Torre ${torreSel?.nombre}${torreSel?.frente ? ` (${torreSel.frente})` : ''}`,
        'Piso':                  r.piso ?? '',
        'Ambiente ZC':           r.ambientes_zc?.nombre ?? '',
        'Partida':               r.partidas?.nombre ?? '',
        'Observación':           r.observacion ?? '',
        'Causa':                 esTercero ? causaTexto.split(' — ')[0] : causaTexto,
        'Cuadrilla Responsable': esTercero ? causaTexto.split(' — ')[1] : '',
        'Estado':                r.estado ?? '',
        'Registrado por':        r.usuarios?.nombre ?? '',
        'Fecha':                 r.creado_en ? new Date(r.creado_en).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '',
        'Foto URL':              r.foto_url ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 6 }, { wch: 16 }, { wch: 20 }, { wch: 40 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Observaciones ZC');
    await exportarExcel(`Obs_ZC_Torre${torreSel?.nombre}_${proyectoSel?.nombre}.xlsx`, wb);
    setGenerando(false);
  };

  const generarExcelZC_ProyectoCompleto = async () => {
    if (!proyectoId) return;
    setGenerando(true);
    const { data, error } = await supabase
      .from('registros_zonas_comunes')
      .select(`
        id, observacion, causa, estado, creado_en, foto_url, piso, torre_id, creado_por,
        ambientes_zc (nombre),
        partidas (nombre)
      `)
      .eq('proyecto_id', proyectoId)
      .order('torre_id', { ascending: true })
      .order('piso', { ascending: true })
      .order('creado_en', { ascending: true });
    if (error) { setAviso('Error al consultar: ' + error.message); setGenerando(false); return; }
    if (!data?.length) { setAviso('Este proyecto no tiene observaciones de zonas comunes registradas.'); setGenerando(false); return; }

    const { data: torresData } = await supabase.from('torres').select('id, nombre, frente').eq('proyecto_id', proyectoId);
    const torreNombre: Record<string, string> = {};
    torresData?.forEach(t => { torreNombre[t.id] = `Torre ${t.nombre}${t.frente ? ` (${t.frente})` : ''}`; });

    const creadoPorIds = [...new Set(data.map((r: any) => r.creado_por).filter(Boolean))];
    const usuarioNombre: Record<string, string> = {};
    if (creadoPorIds.length > 0) {
      const { data: usuariosData } = await supabase.from('usuarios').select('id, nombre').in('id', creadoPorIds);
      usuariosData?.forEach(u => { usuarioNombre[u.id] = u.nombre; });
    }

    const filas = data.map((r: any) => {
      const causaTexto = r.causa ?? '', esTercero = causaTexto.includes(' — ');
      return {
        'Proyecto':              proyectoSel?.nombre ?? '',
        'Torre':                 torreNombre[r.torre_id] ?? r.torre_id,
        'Piso':                  r.piso ?? '',
        'Ambiente ZC':           r.ambientes_zc?.nombre ?? '',
        'Partida':               r.partidas?.nombre ?? '',
        'Observación':           r.observacion ?? '',
        'Causa':                 esTercero ? causaTexto.split(' — ')[0] : causaTexto,
        'Cuadrilla Responsable': esTercero ? causaTexto.split(' — ')[1] : '',
        'Estado':                r.estado ?? '',
        'Registrado por':        usuarioNombre[r.creado_por] ?? '',
        'Fecha':                 r.creado_en ? new Date(r.creado_en).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '',
        'Foto URL':              r.foto_url ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 6 }, { wch: 16 }, { wch: 20 }, { wch: 40 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Obs ZC Proyecto');
    await exportarExcel(`Obs_ZC_Proyecto_${proyectoSel?.nombre}.xlsx`, wb);
    setGenerando(false);
  };

  const generarExcelZC_Checklist = async () => {
    if (!zonaComunId) { setAviso('No se encontró zona común para esta torre.'); return; }
    setGenerando(true);
    const { data, error } = await supabase
      .from('checklist_sala_basura')
      .select('item_numero, item_descripcion, ok, observacion, actualizado_en')
      .eq('zona_comun_id', zonaComunId)
      .order('item_numero', { ascending: true });
    if (error || !data?.length) {
      setAviso('El checklist de esta zona común no tiene datos guardados aún.');
      setGenerando(false);
      return;
    }
    const nombreTorre = `Torre ${torreSel?.nombre}${torreSel?.frente ? ` (${torreSel.frente})` : ''}`;
    const filas = data.map((i: any) => ({
      'Proyecto':    proyectoSel?.nombre ?? '',
      'Torre':       nombreTorre,
      'N°':          i.item_numero,
      'Descripción': i.item_descripcion,
      'OK':          i.ok ? 'Sí' : 'No',
      'Observación': i.observacion ?? '',
      'Actualizado': i.actualizado_en ? new Date(i.actualizado_en).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 5 }, { wch: 55 }, { wch: 5 }, { wch: 30 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Checklist Sala Basura');
    await exportarExcel(`Checklist_ZC_Torre${torreSel?.nombre}_${proyectoSel?.nombre}.xlsx`, wb);
    setGenerando(false);
  };

  // ── Helpers visuales ──────────────────────────────────────────────────────
  const porAmbiente = registros.reduce((acc: any, r: any) => {
    const key = r.ambientes?.nombre ?? 'Sin ambiente';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});
  const registrosPlanos: any[] = [];
  Object.entries(porAmbiente).forEach(([_, fallas]: any) => fallas.forEach((r: any) => registrosPlanos.push(r)));

  const porPisoZC = registrosZC.reduce((acc: any, r: any) => {
    const key = r.piso ?? 0;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {} as Record<number, any[]>);
  const pisosOrdenados   = Object.keys(porPisoZC).map(Number).sort((a, b) => a - b);
  const registrosZCPlanos: any[] = registrosZC;

  const selectStyle = {
    width: '100%', height: 44, borderRadius: 10, padding: '0 12px',
    background: inputBg, border: `0.5px solid ${inputBorder}`,
    color: textPrimary, fontSize: 14, boxSizing: 'border-box' as any, marginBottom: 12,
  };
  const labelStyle = {
    fontSize: 9, color: textMuted, display: 'block', marginBottom: 6,
    textTransform: 'uppercase' as any, letterSpacing: '1.5px', fontWeight: 600,
  };
  const estiloReporte = { background: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#0B1220' };

  const btnExcel = (onClick: () => void, label: string, disabled: boolean) => (
    <button onClick={onClick} disabled={disabled || generando} style={{
      flex: 1, height: 40, borderRadius: 10,
      background: disabled ? (dark ? '#16233B' : '#f1f5f9') : (dark ? 'linear-gradient(135deg, rgba(34,197,94,0.12), #16233B)' : '#f0fdf4'),
      border: `0.5px solid ${disabled ? border : (dark ? 'rgba(74,222,128,0.2)' : '#bbf7d0')}`,
      color: disabled ? textMuted : (dark ? '#4ade80' : '#15803d'),
      fontSize: 11, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{label}</button>
  );

  const btnZC = (onClick: () => void, label: string, disabled: boolean) => (
    <button onClick={onClick} disabled={disabled || generando} style={{
      flex: 1, height: 40, borderRadius: 10,
      background: disabled ? (dark ? '#16233B' : '#f1f5f9') : (dark ? 'linear-gradient(135deg, #0a100e, #16233B)' : '#f0f9ff'),
      border: `0.5px solid ${disabled ? border : (dark ? 'rgba(96,165,250,0.2)' : '#bae6fd')}`,
      color: disabled ? textMuted : (dark ? '#60a5fa' : '#0369a1'),
      fontSize: 11, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{label}</button>
  );

  if (loading && proyectos.length === 0) return (
    <IonPage id="main-content">
      <IonContent style={{ '--background': bg }}>
        <div style={{ textAlign: 'center', marginTop: 100 }}><IonSpinner name="crescent" /></div>
      </IonContent>
    </IonPage>
  );

  return (
    <IonPage id="main-content">
      <IonHeader>
        <IonToolbar style={{ '--background': toolbar, '--color': '#f9fafb', '--border-color': 'transparent' }}>
          <IonMenuButton slot="start" style={{ '--color': dark ? '#6E86A6' : 'rgba(255,255,255,0.7)' }} />
          <IonTitle style={{ fontSize: 16, fontWeight: 600 }}>Reportes</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': bg }}>
        <div style={{ padding: 16 }}>

          {/* ── Seleccionar ─────────────────────────────────────────────── */}
          <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Seleccionar</div>
          <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
          <div style={{ background: dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#fff', borderRadius: 16, padding: 16, marginBottom: 16, border: `0.5px solid ${border}` }}>
            <label style={labelStyle}>proyecto</label>
            <select value={proyectoId} onChange={e => setProyectoId(e.target.value)} style={selectStyle}>
              <option value="">Seleccionar proyecto...</option>
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <label style={labelStyle}>torre</label>
            <select value={torreId} onChange={e => setTorreId(e.target.value)} style={{ ...selectStyle, opacity: !proyectoId ? 0.3 : 1 }} disabled={!proyectoId}>
              <option value="">Seleccionar torre...</option>
              {torres.map(t => <option key={t.id} value={t.id}>Torre {t.nombre}{t.frente ? ` (${t.frente})` : ''}</option>)}
            </select>
            <label style={labelStyle}>departamento</label>
            <select value={deptoId} onChange={e => setDeptoId(e.target.value)} style={{ ...selectStyle, opacity: !torreId ? 0.3 : 1, marginBottom: 0 }} disabled={!torreId}>
              <option value="">Seleccionar departamento...</option>
              {torreId && <option value="__ZC__">🏢 Zona Común</option>}
              {deptos.map(d => <option key={d.id} value={d.id}>{d.numero}{d.id_obra ? ` · ${d.id_obra}` : ''}</option>)}
            </select>
          </div>

          {/* ── Aviso ───────────────────────────────────────────────────── */}
          {aviso && (
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#fbbf24' }}>{aviso}</span>
            </div>
          )}

          {/* ── Descarga OK ─────────────────────────────────────────────── */}
          {descargaOk && (
            <div style={{ background: dark ? 'rgba(74,222,128,0.06)' : '#f0fdf4', border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0', borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: dark ? '#4ade80' : '#22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: dark ? '#4ade80' : '#15803d' }}>{descargaOk}</span>
            </div>
          )}

          {/* ── Excel estándar ──────────────────────────────────────────── */}
          {proyectoId && (
            <>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Descargar Excel</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
              <div style={{ background: dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#fff', borderRadius: 16, padding: 14, marginBottom: 16, border: `0.5px solid ${border}` }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {btnExcel(generarExcelProyecto, '🏗️ Proyecto', !proyectoId)}
                  {btnExcel(generarExcelTorre,    '🏢 Torre',    !torreId)}
                  {btnExcel(generarExcelDepto,    '🚪 Depto',    !deptoId || esZC)}
                </div>
              </div>
            </>
          )}

          {/* ── Excel Zona Común ────────────────────────────────────────── */}
          {esZC && (
            <>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Zona Común · Torre {torreSel?.nombre}</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
              <div style={{ background: dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#fff', borderRadius: 16, padding: 14, marginBottom: 8, border: `0.5px solid ${border}` }}>
                <div style={{ fontSize: 10, color: textMuted, marginBottom: 8, fontWeight: 600 }}>📋 Observaciones</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {btnZC(generarExcelZC_Observaciones,    `Torre ${torreSel?.nombre}`,  !zonaComunId)}
                  {btnZC(generarExcelZC_ProyectoCompleto, '🏗️ Proyecto completo',       !proyectoId)}
                </div>
                {!zonaComunId && !aviso && (
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 10, textAlign: 'center' }}>Cargando zona común...</div>
                )}
              </div>
              <div style={{ background: dark ? 'linear-gradient(135deg, #16233B 0%, #1B2C48 100%)' : '#fff', borderRadius: 16, padding: 14, marginBottom: 16, border: `0.5px solid ${border}` }}>
                <div style={{ fontSize: 10, color: textMuted, marginBottom: 8, fontWeight: 600 }}>☑️ Checklist</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {btnZC(generarExcelZC_Checklist, `Sala Basura Torre ${torreSel?.nombre}`, !zonaComunId)}
                </div>
              </div>
            </>
          )}

          {/* ── PDF Departamento ────────────────────────────────────────── */}
          {deptoId && !esZC && (
            <>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Informe PDF</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
              <button onClick={cargarRegistros} disabled={generando || descargando} style={{
                width: '100%', height: 46, borderRadius: 12,
                background: dark ? 'linear-gradient(135deg, #16233B, #1E2E4A)' : '#fff',
                border: `0.5px solid ${border}`, color: textPrimary,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
              }}>
                {generando ? 'Cargando...' : `📄 PDF Torre ${torreSel?.nombre} · Depto ${deptoSel?.numero} · ${deptoSel?.id_obra}`}
              </button>
            </>
          )}

          {/* ── PDF Zona Común ──────────────────────────────────────────── */}
          {esZC && zonaComunId && (
            <>
              <div style={{ fontSize: 9, color: textMuted, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600, marginBottom: 12 }}>Informe PDF Zona Común</div>
              <div style={{ height: '0.5px', background: sepLine, marginBottom: 16 }} />
              <button onClick={cargarRegistrosZC} disabled={generando || descargando} style={{
                width: '100%', height: 46, borderRadius: 12,
                background: dark ? 'linear-gradient(135deg, #16233B, #1E2E4A)' : '#fff',
                border: `0.5px solid ${border}`, color: textPrimary,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
              }}>
                {generando ? 'Cargando...' : `📄 PDF Zona Común · Torre ${torreSel?.nombre}`}
              </button>
            </>
          )}

          {/* ── Botón descargar PDF depto ───────────────────────────────── */}
          {mostrarReporte && !esZC && (
            <>
              <button onClick={generarPDF} disabled={descargando || generando} style={{
                width: '100%', height: 48, borderRadius: 12,
                background: dark ? 'linear-gradient(135deg, rgba(34,197,94,0.12), #0d1f10)' : '#f0fdf4',
                border: dark ? '0.5px solid rgba(74,222,128,0.2)' : '0.5px solid #bbf7d0',
                color: dark ? '#4ade80' : '#15803d',
                fontSize: 13, fontWeight: 700, cursor: descargando ? 'not-allowed' : 'pointer', marginBottom: 8,
              }}>
                {descargando ? '⏳ Generando PDF...' : '⬇️ Descargar PDF'}
              </button>
              {descargando && <BarraProgreso progreso={progreso} progresoNum={progresoNum} dark={dark} textMuted={textMuted} />}
            </>
          )}

          {/* ── Botón descargar PDF ZC ──────────────────────────────────── */}
          {mostrarReporteZC && esZC && (
            <>
              <button onClick={generarPDFZC} disabled={descargando || generando} style={{
                width: '100%', height: 48, borderRadius: 12,
                background: dark ? 'linear-gradient(135deg, #0a100e, #16233B)' : '#f0f9ff',
                border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bae6fd',
                color: dark ? '#60a5fa' : '#0369a1',
                fontSize: 13, fontWeight: 700, cursor: descargando ? 'not-allowed' : 'pointer', marginBottom: 8,
              }}>
                {descargando ? '⏳ Generando PDF...' : '⬇️ Descargar PDF ZC'}
              </button>
              {descargando && <BarraProgreso progreso={progreso} progresoNum={progresoNum} dark={dark} textMuted={textMuted} />}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              ELEMENTOS OCULTOS PARA CAPTURA PDF — DEPTO
          ════════════════════════════════════════════════════════════════ */}
          <div style={{ position: 'absolute', left: -9999, top: 0, width: 750 }}>
            <div ref={headerRef} style={{ ...estiloReporte, padding: '20px 24px 16px', borderBottom: '2px solid #1e3a5f', width: 750 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>INFORME DE DETALLES</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>{proyectoSel?.nombre}</div>
                  <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#374151' }}>
                    <span>Torre {torreSel?.nombre}{torreSel?.frente ? ` · ${torreSel.frente}` : ''}</span>
                    <span>Depto {deptoSel?.numero} · {deptoSel?.id_obra}</span>
                    <span>Fecha: {new Date().toLocaleDateString('es-CL')}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <img src="/logo-vain-azul.png" style={{ height: 100, objectFit: 'contain', display: 'block' }} alt="VAIN" />
                  <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4, letterSpacing: '1px' }}>&lt;FMS&gt;</div>
                </div>
              </div>
            </div>

            <div ref={resumenRef} style={{ ...estiloReporte, padding: '16px 24px', width: 750 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 10 }}>RESUMEN POR AMBIENTE</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Ambiente</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Total</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Pendientes</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Solucionadas</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Aprobadas</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(porAmbiente).map(([amb, fallas]: any, i) => (
                    <tr key={amb} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '7px 12px', borderBottom: '1px solid #e5e7eb' }}>{amb}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>{fallas.length}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', color: '#ef4444' }}>{fallas.filter((f: any) => f.estado === 'pendiente').length}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', color: '#3b82f6' }}>{fallas.filter((f: any) => f.estado === 'solucionado').length}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', color: '#22c55e' }}>{fallas.filter((f: any) => f.estado === 'aprobado').length}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700 }}>
                    <td style={{ padding: '8px 12px' }}>TOTAL</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{registros.length}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{registros.filter(r => r.estado === 'pendiente').length}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{registros.filter(r => r.estado === 'solucionado').length}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{registros.filter(r => r.estado === 'aprobado').length}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginTop: 20, marginBottom: 8 }}>LISTA DE DETALLES</div>
            </div>

            <div style={{ ...estiloReporte, padding: '0 24px', width: 750 }}>
              {Object.entries(porAmbiente).map(([amb, fallas]: any) => (
                <div key={amb}>
                  {(fallas as any[]).map((r: any, idx: number) => {
                    const idxGlobal = registrosPlanos.indexOf(r);
                    return (
                      <div key={r.id} ref={el => { registrosRefs.current[idxGlobal] = el; }} style={{ ...estiloReporte, width: 750 }}>
                        {idx === 0 && (
                          <div style={{ background: '#1e3a5f', color: '#fff', padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>{amb}</div>
                        )}
                        <div style={{ border: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#f8fafc' : '#ffffff', padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f' }}>#{idxGlobal + 1} — {r.partidas?.nombre}</span>
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `${estadoColor[r.estado]}20`, color: estadoColor[r.estado], fontWeight: 600 }}>{estadoLabel[r.estado]}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}><strong>Observación:</strong> {r.observacion}</div>
                            {r.causa && <div style={{ fontSize: 12, color: '#374151' }}><strong>Causa:</strong> {r.causa}</div>}
                          </div>
                          {r.foto_url && <img data-foto-idx={idxGlobal} src={r.foto_url} crossOrigin="anonymous" style={{ width: 200, height: 150, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              ELEMENTOS OCULTOS PARA CAPTURA PDF — ZONA COMÚN
          ════════════════════════════════════════════════════════════════ */}
          <div style={{ position: 'absolute', left: -9999, top: 0, width: 750 }}>
            <div ref={zcHeaderRef} style={{ ...estiloReporte, padding: '20px 24px 16px', borderBottom: '2px solid #1e3a5f', width: 750 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>INFORME ZONA COMÚN</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a5f', marginBottom: 8 }}>{proyectoSel?.nombre}</div>
                  <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#374151' }}>
                    <span>Torre {torreSel?.nombre}{torreSel?.frente ? ` (${torreSel.frente})` : ''}</span>
                    <span>Fecha: {new Date().toLocaleDateString('es-CL')}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <img src="/logo-vain-azul.png" style={{ height: 100, objectFit: 'contain', display: 'block' }} alt="VAIN" />
                  <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4, letterSpacing: '1px' }}>&lt;FMS&gt;</div>
                </div>
              </div>
            </div>

            <div ref={zcResumenRef} style={{ ...estiloReporte, padding: '16px 24px', width: 750 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 10 }}>RESUMEN POR PISO</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Piso</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Total</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Pendientes</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Solucionadas</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Aprobadas</th>
                  </tr>
                </thead>
                <tbody>
                  {pisosOrdenados.map((piso, i) => {
                    const fallas = porPisoZC[piso];
                    return (
                      <tr key={piso} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid #e5e7eb' }}>Piso {piso}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>{fallas.length}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', color: '#ef4444' }}>{fallas.filter((f: any) => f.estado === 'pendiente').length}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', color: '#3b82f6' }}>{fallas.filter((f: any) => f.estado === 'solucionado').length}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', color: '#22c55e' }}>{fallas.filter((f: any) => f.estado === 'aprobado').length}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700 }}>
                    <td style={{ padding: '8px 12px' }}>TOTAL</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{registrosZC.length}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{registrosZC.filter(r => r.estado === 'pendiente').length}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{registrosZC.filter(r => r.estado === 'solucionado').length}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{registrosZC.filter(r => r.estado === 'aprobado').length}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginTop: 20, marginBottom: 8 }}>LISTA DE OBSERVACIONES</div>
            </div>

            <div style={{ ...estiloReporte, padding: '0 24px', width: 750 }}>
              {pisosOrdenados.map(piso => (
                <div key={piso}>
                  {(porPisoZC[piso] as any[]).map((r: any, idx: number) => {
                    const idxGlobal = registrosZCPlanos.indexOf(r);
                    return (
                      <div key={r.id} ref={el => { zcRegistrosRefs.current[idxGlobal] = el; }} style={{ ...estiloReporte, width: 750 }}>
                        {idx === 0 && (
                          <div style={{ background: '#1e3a5f', color: '#fff', padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>
                            Piso {piso}
                          </div>
                        )}
                        <div style={{ border: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#f8fafc' : '#ffffff', padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#1e3a5f' }}>
                                #{idxGlobal + 1} — {r.ambientes_zc?.nombre} · {r.partidas?.nombre}
                              </span>
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `${estadoColor[r.estado]}20`, color: estadoColor[r.estado], fontWeight: 600 }}>
                                {estadoLabel[r.estado]}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}><strong>Observación:</strong> {r.observacion}</div>
                            {r.causa && <div style={{ fontSize: 12, color: '#374151' }}><strong>Causa:</strong> {r.causa}</div>}
                          </div>
                          {r.foto_url && (
                            <img data-zc-foto-idx={idxGlobal} src={r.foto_url} crossOrigin="anonymous" style={{ width: 200, height: 150, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 40 }} />
        </div>
      </IonContent>
    </IonPage>
  );
};

const BarraProgreso: React.FC<{ progreso: string; progresoNum: number; dark: boolean; textMuted: string }> = ({ progreso, progresoNum, dark, textMuted }) => (
  <div style={{ background: dark ? 'linear-gradient(135deg, #16233B, #1B2C48)' : '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 12, border: dark ? '0.5px solid rgba(96,165,250,0.2)' : '0.5px solid #bfdbfe' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: dark ? '#60a5fa' : '#2563eb' }}>{progreso}</span>
      <span style={{ fontSize: 12, color: dark ? '#60a5fa' : '#2563eb', fontWeight: 700 }}>{progresoNum}%</span>
    </div>
    <div style={{ height: 3, background: dark ? '#16233B' : '#f1f5f9', borderRadius: 2 }}>
      <div style={{ height: 3, borderRadius: 2, background: dark ? 'linear-gradient(90deg, #333, #6E86A6)' : 'linear-gradient(90deg, #bfdbfe, #2563eb)', width: `${progresoNum}%`, transition: 'width 0.3s ease' }} />
    </div>
    <div style={{ fontSize: 11, color: textMuted, marginTop: 8 }}>Mantén la app abierta mientras se genera el PDF</div>
  </div>
);

export default Reportes;

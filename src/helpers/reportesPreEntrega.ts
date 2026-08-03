import * as XLSX from 'xlsx';
import { supabase } from '../supabase';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

interface FiltrosReporte {
  proyectoId: string;
  torreId?: string;
  deptoId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

interface ObservacionPE {
  id: string;
  proyecto_codigo: string;
  torre_codigo: string;
  depto_numero: number;
  fecha_creacion: string;
  semana_creacion: string;
  ambiente: string;
  partida_afectada: string;
  causa: string;
  observacion: string;
  estado: string;
  usuario_nombre: string;
  usuario_email: string;
  fecha_resolucion: string | null;
  propietario_nombre: string | null;
}

/**
 * Genera reporte COMPLETO de observaciones Pre Entrega
 * Incluye: TODAS las columnas de la tabla observacionesinformepv
 */
export const generarReporteCompleto = async (filtros: FiltrosReporte): Promise<void> => {
  try {
    // 1. Si se seleccionó torre, obtener su código
    let torreCodigo = null;
    if (filtros.torreId) {
      const { data: torreData } = await supabase
        .from('torres')
        .select('nombre')
        .eq('id', filtros.torreId)
        .single();
      if (torreData) {
        torreCodigo = torreData.nombre;
      }
    }

    // 2. Construir query con filtros
    let query = supabase
      .from('observacionesinformepv')
      .select('*')  // TODAS las columnas
      .eq('proyecto_id', filtros.proyectoId)
      .eq('tipo', 'PRE-E')
      .order('fecha_creacion', { ascending: false });

    if (torreCodigo) {
      query = query.eq('torre_codigo', torreCodigo);
    }

    if (filtros.deptoId) {
      query = query.eq('departamento_id', filtros.deptoId);
    }

    if (filtros.fechaDesde) {
      const fechaDesdeISO = `${filtros.fechaDesde}T00:00:00`;
      query = query.gte('fecha_creacion', fechaDesdeISO);
    }

    if (filtros.fechaHasta) {
      const fechaHastaISO = `${filtros.fechaHasta}T23:59:59`;
      query = query.lte('fecha_creacion', fechaHastaISO);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error consultando observaciones:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      alert('No hay observaciones para los filtros seleccionados');
      return;
    }

    // 2. Preparar datos para Excel - TODAS las columnas de la tabla
    const datosExcel = data.map((obs: any) => {
      // Formatear fechas automáticamente
      const formatted: any = {};
      Object.keys(obs).forEach(key => {
        if (key.includes('fecha') || key.includes('creacion') || key.includes('resolucion')) {
          // Formatear fechas
          formatted[key] = obs[key] ? formatearFecha(obs[key]) : '';
        } else {
          formatted[key] = obs[key] || '';
        }
      });
      return formatted;
    });

    // 3. Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosExcel);  // Sin header específico - XLSX usa todas las keys

    // Estilos: auto-ancho para todas las columnas
    if (datosExcel.length > 0) {
      const columnWidths = Object.keys(datosExcel[0]).map(() => ({ wch: 20 }));
      ws['!cols'] = columnWidths;
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Pre Entrega');

    // 4. Generar archivo
    const fechaHoy = new Date().toISOString().split('T')[0];
    const nombreArchivo = `PreEntrega_Completo_${fechaHoy}.xlsx`;

    await descargarExcel(wb, nombreArchivo);
  } catch (error) {
    console.error('Error generando reporte completo:', error);
    throw error;
  }
};

/**
 * Genera reporte ITLS: formato específico para plataforma ITLS
 * Columnas: Proyecto, Fecha, Torre, Depto, N° Obs, Observación, Ambiente
 */
export const generarReporteITLS = async (filtros: FiltrosReporte): Promise<void> => {
  try {
    // 1. Si se seleccionó torre, obtener su código
    let torreCodigo = null;
    if (filtros.torreId) {
      const { data: torreData } = await supabase
        .from('torres')
        .select('nombre')
        .eq('id', filtros.torreId)
        .single();
      if (torreData) {
        torreCodigo = torreData.nombre;
      }
    }

    // 2. Consultar observaciones
    let query = supabase
      .from('observacionesinformepv')
      .select(
        `id, proyecto_codigo, torre_codigo, depto_numero, 
         fecha_creacion, observacion, ambiente`
      )
      .eq('proyecto_id', filtros.proyectoId)
      .eq('tipo', 'PRE-E')
      .order('fecha_creacion', { ascending: false });

    if (torreCodigo) {
      query = query.eq('torre_codigo', torreCodigo);
    }

    if (filtros.deptoId) {
      query = query.eq('departamento_id', filtros.deptoId);
    }

    if (filtros.fechaDesde) {
      const fechaDesdeISO = `${filtros.fechaDesde}T00:00:00`;
      query = query.gte('fecha_creacion', fechaDesdeISO);
    }

    if (filtros.fechaHasta) {
      const fechaHastaISO = `${filtros.fechaHasta}T23:59:59`;
      query = query.lte('fecha_creacion', fechaHastaISO);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error consultando observaciones:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      alert('No hay observaciones para los filtros seleccionados');
      return;
    }

    // 2. Calcular N° de observación por depto
    const obsConNumero = calcularNumeroObservacion(data);

    // 3. Preparar datos para Excel (formato ITLS)
    const datosExcel = obsConNumero.map((obs) => ({
      'Proyecto': obs.proyecto_codigo || '',
      'Fecha': formatearFecha(obs.fecha_creacion),
      'Torre': obs.torre_codigo || '',
      'Depto': obs.depto_numero || '',
      'N° Obs': obs.numeroObs || '',
      'Observación': obs.observacion || '',
      'Ambiente': obs.ambiente || '',
    }));

    // 4. Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datosExcel, {
      header: ['Proyecto', 'Fecha', 'Torre', 'Depto', 'N° Obs', 'Observación', 'Ambiente'],
    });

    // Estilos: ancho de columnas
    ws['!cols'] = [
      { wch: 14 }, // Proyecto
      { wch: 12 }, // Fecha
      { wch: 8 },  // Torre
      { wch: 8 },  // Depto
      { wch: 8 },  // N° Obs
      { wch: 40 }, // Observación
      { wch: 18 }, // Ambiente
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'ITLS');

    // 5. Generar archivo
    const fechaHoy = new Date().toISOString().split('T')[0];
    const nombreArchivo = `PreEntrega_ITLS_${fechaHoy}.xlsx`;

    await descargarExcel(wb, nombreArchivo);
  } catch (error) {
    console.error('Error generando reporte ITLS:', error);
    throw error;
  }
};

/**
 * Calcula el N° de observación por departamento (row_number OVER PARTITION BY depto)
 */
function calcularNumeroObservacion(
  observaciones: any[]
): (typeof observaciones[0] & { numeroObs: number })[] {
  // Agrupar por depto
  const porDepto: { [key: string]: typeof observaciones } = {};

  observaciones.forEach((obs) => {
    const key = `${obs.torre_codigo}${obs.depto_numero}`;
    if (!porDepto[key]) {
      porDepto[key] = [];
    }
    porDepto[key].push(obs);
  });

  // Numerar dentro de cada grupo
  const resultado: (typeof observaciones[0] & { numeroObs: number })[] = [];

  Object.keys(porDepto).forEach((key) => {
    const obsDepto = porDepto[key];
    obsDepto.forEach((obs, idx) => {
      resultado.push({
        ...obs,
        numeroObs: idx + 1,
      });
    });
  });

  return resultado;
}

/**
 * Descarga el archivo Excel (nativo en Android, descarga en web)
 */
async function descargarExcel(workbook: XLSX.WorkBook, nombreArchivo: string): Promise<void> {
  // Generar buffer
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    // Android/iOS: usar Filesystem + Share
    const base64 = await blobToBase64(blob);
    const path = `${Directory.Documents}/${nombreArchivo}`;

    await Filesystem.writeFile({
      path: nombreArchivo,
      data: base64,
      directory: Directory.Documents,
    });

    const uri = await Filesystem.getUri({
      path: nombreArchivo,
      directory: Directory.Documents,
    });

    await Share.share({
      title: nombreArchivo,
      text: `Reporte: ${nombreArchivo}`,
      url: uri.uri,
      dialogTitle: `Descargar ${nombreArchivo}`,
    });
  } else {
    // Web: descarga directa
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Convierte Blob a Base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Formatea fecha a formato legible (ej: 2026-07-24 → 24/07/2026)
 */
function formatearFecha(fechaISO: string): string {
  if (!fechaISO) return '';
  try {
    const fecha = new Date(fechaISO);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    return `${dia}/${mes}/${año}`;
  } catch {
    return fechaISO;
  }
}
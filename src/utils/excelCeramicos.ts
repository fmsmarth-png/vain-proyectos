// src/utils/excelCeramicos.ts
// Exporta el levantamiento de cerámicos de un proyecto a un .xlsx.
// Formato largo: una fila por cada combinación Depto + Ambiente + Elemento, con columnas
// separadas (Ambiente, Elemento, Marcado) en vez de una columna por cada combinación.
// Esto permite filtrar/agrupar por Ambiente directamente en Excel (tabla dinámica, filtros, etc).
//
// Web: descarga normal del navegador (XLSX.writeFile).
// Android/iOS (Capacitor): se genera el archivo en base64, se escribe con
// @capacitor/filesystem y se abre el diálogo de compartir/guardar con @capacitor/share.

import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../supabase';
import { AMBIENTES_CERAMICOS, ChecklistCeramicos } from './ceramicosConfig';

interface FilaExport {
  Torre: string;
  Depto: string;
  Ambiente: string;
  Elemento: string;
  Marcado: string;
  Comentario: string;
  Actualizado: string;
}

async function construirLibro(proyectoId: string) {
  const { data, error } = await supabase
    .from('ceramicos_levantamiento')
    .select(`
      checklist,
      comentario,
      actualizado_en,
      departamentos ( numero, torre_id ),
      torres ( nombre )
    `)
    .eq('proyecto_id', proyectoId);

  if (error || !data) {
    throw new Error(error?.message ?? 'No se pudo obtener el levantamiento');
  }

  const filas: FilaExport[] = [];

  for (const registro of data as any[]) {
    const checklist: ChecklistCeramicos = registro.checklist ?? {};
    const torreNombre = registro.torres?.nombre ?? '';
    const deptoNumero = registro.departamentos?.numero ?? '';
    const comentario = registro.comentario ?? '';
    const actualizado = registro.actualizado_en
      ? new Date(registro.actualizado_en).toLocaleString('es-CL')
      : '';

    for (const ambiente of AMBIENTES_CERAMICOS) {
      for (const item of ambiente.items) {
        const marcado = (checklist[ambiente.nombre] ?? []).includes(item);
        filas.push({
          Torre: torreNombre,
          Depto: String(deptoNumero),
          Ambiente: ambiente.nombre,
          Elemento: item,
          Marcado: marcado ? 'Si' : 'No',
          Comentario: comentario,
          Actualizado: actualizado,
        });
      }
    }
  }

  const encabezados = ['Torre', 'Depto', 'Ambiente', 'Elemento', 'Marcado', 'Comentario', 'Actualizado'];
  const hoja = XLSX.utils.json_to_sheet(filas, { header: encabezados });
  hoja['!cols'] = [
    { wch: 10 },  // Torre
    { wch: 10 },  // Depto
    { wch: 20 },  // Ambiente
    { wch: 22 },  // Elemento
    { wch: 10 },  // Marcado
    { wch: 40 },  // Comentario
    { wch: 20 },  // Actualizado
  ];

  // Activar autofiltro en la fila de encabezados, así queda listo para filtrar por Ambiente
  const rango = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: filas.length, c: encabezados.length - 1 },
  });
  hoja['!autofilter'] = { ref: rango };

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Levantamiento');
  return libro;
}

export async function exportarExcelCeramicos(proyectoId: string, proyectoNombre: string) {
  const libro = await construirLibro(proyectoId);
  const nombreArchivo = `Levantamiento_Ceramicos_${proyectoNombre.replace(/\s+/g, '_')}.xlsx`;

  if (!Capacitor.isNativePlatform()) {
    XLSX.writeFile(libro, nombreArchivo);
    return;
  }

  const base64 = XLSX.write(libro, { bookType: 'xlsx', type: 'base64' });

  const resultado = await Filesystem.writeFile({
    path: nombreArchivo,
    data: base64,
    directory: Directory.Cache,
  });

  await Share.share({
    title: nombreArchivo,
    url: resultado.uri,
    dialogTitle: 'Guardar o compartir Excel',
  });
}
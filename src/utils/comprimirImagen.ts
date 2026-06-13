/**
 * Comprime una imagen (File o Blob) antes de subirla a Supabase Storage.
 * Reduce dimensiones máximas y aplica compresión JPEG.
 *
 * @param file       Archivo de imagen original
 * @param maxWidth   Ancho máximo en píxeles (default: 1280)
 * @param maxHeight  Alto máximo en píxeles (default: 1280)
 * @param quality    Calidad JPEG 0–1 (default: 0.75)
 * @returns          Blob comprimido listo para subir
 */
export async function comprimirImagen(
  file: File | Blob,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.75
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No se pudo obtener contexto 2D'));

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Error al comprimir imagen'));
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error al cargar imagen para comprimir'));
    };

    img.src = url;
  });
}
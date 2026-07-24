// Ubicación: src/helpers/imageHelpers.ts
// Propósito: Utilidades para procesamiento de imágenes

/**
 * Crear ImageBitmap desde base64
 */
export const createImageBitmap = async (
  base64: string
): Promise<ImageBitmap | null> => {
  try {
    const response = await fetch(base64);
    const blob = await response.blob();
    return await (self as any).createImageBitmap(blob);
  } catch (err) {
    console.error('Error creando ImageBitmap:', err);
    return null;
  }
};

/**
 * Comprimir imagen base64 (para reducir tamaño en BD)
 */
export const compressBase64Image = (
  base64: string,
  quality: number = 0.7
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(base64);
      }
    };
    img.src = base64;
  });
};

/**
 * Validar que una imagen sea JPG/PNG válida
 */
export const isValidImageBase64 = (base64: string): boolean => {
  if (!base64 || typeof base64 !== 'string') return false;
  return base64.startsWith('data:image/');
};

/**
 * Obtener dimensiones de imagen desde base64
 */
export const getImageDimensions = (base64: string): Promise<{
  width: number;
  height: number;
}> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      reject(new Error('Imagen inválida'));
    };
    img.src = base64;
  });
};

/**
 * Crop imagen a dimensiones específicas
 */
export const cropImage = (
  base64: string,
  x: number,
  y: number,
  width: number,
  height: number
): string => {
  const canvas = document.createElement('canvas');
  const img = new Image();

  return new Promise<string>((resolve) => {
    img.onload = () => {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg'));
      } else {
        resolve(base64);
      }
    };
    img.src = base64;
  }) as any;
};

/**
 * Rotar imagen (útil para fotos de cámara)
 */
export const rotateImage = (base64: string, degrees: number): string => {
  const canvas = document.createElement('canvas');
  const img = new Image();

  return new Promise<string>((resolve) => {
    img.onload = () => {
      const rad = (degrees * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const x1 = 0;
      const y1 = 0;
      const x2 = img.width;
      const y2 = 0;
      const x3 = img.width;
      const y3 = img.height;
      const x4 = 0;
      const y4 = img.height;

      const xs = [
        Math.abs(x1 * cos + y1 * sin),
        Math.abs(x2 * cos + y2 * sin),
        Math.abs(x3 * cos + y3 * sin),
        Math.abs(x4 * cos + y4 * sin),
      ];

      const ys = [
        Math.abs(x1 * sin + y1 * cos),
        Math.abs(x2 * sin + y2 * cos),
        Math.abs(x3 * sin + y3 * cos),
        Math.abs(x4 * sin + y4 * cos),
      ];

      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      canvas.width = maxX;
      canvas.height = maxY;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(maxX / 2, maxY / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg'));
      } else {
        resolve(base64);
      }
    };
    img.src = base64;
  }) as any;
};

/**
 * Convertir Blob a base64
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Convertir base64 a Blob
 */
export const base64ToBlob = (base64: string, mimeType: string = 'image/jpeg'): Blob => {
  const bstr = atob(base64.split(',')[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return new Blob([u8arr], { type: mimeType });
};

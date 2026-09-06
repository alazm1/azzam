import type { Raster } from '../engine/types';

const MAX_SIDE = 2400;

/**
 * Decodes a photo/screenshot into an RGBA raster. Honours EXIF orientation
 * (phone photos) and downsizes very large images to keep analysis fast.
 * The image never leaves the device.
 */
export async function fileToRaster(file: Blob): Promise<Raster> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await loadViaImageElement(file);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap) bitmap.close();
  const data = ctx.getImageData(0, 0, width, height).data;
  return { width, height, data };
}

function loadViaImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذر فتح الصورة'));
    };
    img.src = url;
  });
}

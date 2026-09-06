import type { GrayImage } from '../types';
import { grayToRaster } from '../image/raster';

/** Encodes a gray image as a PNG Blob using an (Offscreen)Canvas. */
export async function encodeGrayToBlob(img: GrayImage): Promise<Blob> {
  const raster = grayToRaster(img);
  const imageData = new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  }
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')!.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

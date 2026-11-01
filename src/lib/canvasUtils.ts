/**
 * Thin DOM/canvas wrappers around the pure logic in `imageProcessing.ts`.
 * These touch `document` / `Image` / canvas, so they are exercised manually
 * in the browser rather than in unit tests.
 */

import type { Bounds } from './imageProcessing';

import { makeBackgroundTransparent } from './imageProcessing';

/** Load a File/Blob/URL into a decoded HTMLImageElement. */
export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (typeof src === 'string') {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = src;
      return;
    }
    const url = URL.createObjectURL(src);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

/**
 * Target dimensions that fit within both an edge cap and a pixel budget,
 * preserving aspect ratio and never upscaling. Pure — unit-tested in Node.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
  maxPixels?: number,
): { width: number; height: number } {
  let scale = Math.min(1, maxEdge / Math.max(width, height));
  if (maxPixels) {
    const pixels = width * scale * (height * scale);
    if (pixels > maxPixels) scale *= Math.sqrt(maxPixels / pixels);
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decode a file to an ImageBitmap, downscaled to fit the edge + pixel caps.
 * Keeping a (capped) ImageBitmap instead of a full-size 2D canvas keeps the
 * retained working set small and GPU-backed, so weak devices stay responsive.
 *
 * Note: the first decode is still at the file's native resolution; true
 * decompression-bomb protection would need header-level dimension checks, which
 * are out of scope here. The caps bound everything we *retain* and process.
 */
export async function decodeSource(
  file: Blob,
  maxEdge: number,
  maxPixels?: number,
): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file);
  const target = fitWithin(bitmap.width, bitmap.height, maxEdge, maxPixels);
  if (target.width === bitmap.width && target.height === bitmap.height) {
    return bitmap;
  }
  try {
    const resized = await createImageBitmap(bitmap, {
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality: 'high',
    });
    bitmap.close();
    return resized;
  } catch {
    // Older engines without createImageBitmap resize options: resize via canvas.
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    bitmap.close();
    const resized = await createImageBitmap(canvas);
    canvas.width = canvas.height = 0;
    return resized;
  }
}

/** Draw a bitmap onto a new canvas, downscaling so the longest edge <= maxEdge. */
export function bitmapToCanvas(
  bitmap: ImageBitmap,
  maxEdge: number,
): HTMLCanvasElement {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/** Draw an image onto a canvas, downscaling so the longest edge <= maxEdge. */
export function imageToCanvas(
  img: HTMLImageElement,
  maxEdge = 1500,
): HTMLCanvasElement {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * Downscale a canvas so its longest edge <= maxEdge (never upscales).
 * Returns the same canvas untouched when already within bounds, otherwise a
 * new canvas (caller frees the old one if it was a throwaway).
 */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  maxEdge: number,
): HTMLCanvasElement {
  const { width, height } = canvas;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale >= 1) return canvas;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(width * scale));
  out.height = Math.max(1, Math.round(height * scale));
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      type,
      quality,
    );
  });
}

export function cropCanvas(
  canvas: HTMLCanvasElement,
  box: Bounds,
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = box.width;
  out.height = box.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(
    canvas,
    box.left,
    box.top,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height,
  );
  return out;
}

export interface ExportOptions {
  /** Region to keep (image pixels). Omit to export the whole canvas. */
  cropBox?: Bounds;
  /** Turn the sampled background transparent. */
  transparent?: boolean;
  /** Max per-channel colour distance from background still treated as background. */
  tolerance?: number;
  type?: string;
}

/**
 * Full export pipeline: crop -> optional transparency -> Blob.
 * Accepts an already-cropped canvas too (pass no cropBox).
 */
export async function exportImage(
  canvas: HTMLCanvasElement,
  opts: ExportOptions = {},
): Promise<Blob> {
  const target = opts.cropBox ? cropCanvas(canvas, opts.cropBox) : canvas;
  if (opts.transparent) {
    const ctx = target.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    const data = ctx.getImageData(0, 0, target.width, target.height);
    makeBackgroundTransparent(data, { tolerance: opts.tolerance });
    ctx.putImageData(data, 0, 0);
  }
  return canvasToBlob(target, opts.type ?? 'image/png');
}

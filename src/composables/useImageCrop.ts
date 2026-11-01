import type { MaybeRefOrGetter } from 'vue';

import type { BackgroundModel, Bounds } from '../lib/imageProcessing';
import type { QualityConfig } from '../presets';

import { computed, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue';

import {
  bitmapToCanvas,
  canvasToBlob,
  decodeSource,
} from '../lib/canvasUtils';
import {
  detectContentBounds,
  makeBackgroundTransparent,
  sampleBackground,
} from '../lib/imageProcessing';

/**
 * On-screen cropping and per-pixel analysis run on a downscaled copy (cheap,
 * constant cost). This is the display cap, independent of the export policy.
 */
const DISPLAY_MAX_EDGE = 1500;

/** Image processing and state, independent of the cropper and UI libraries. */
export function useImageCrop(config: MaybeRefOrGetter<QualityConfig>) {
  const cfg = () => toValue(config);

  // The untouched (downscaled) image shown when transparency is off.
  const plainSrc = ref('');
  // The keyed-out preview. Built lazily on the first toggle-on, then cached.
  const transparentSrc = ref('');
  const detected = shallowRef<Bounds | null>(null);
  const bgModel = shallowRef<BackgroundModel | null>(null);
  const transparent = ref(cfg().defaultTransparent);
  // True while the keyed preview is being generated (for a spinner).
  const preparingPreview = ref(false);
  const resultUrl = ref('');
  // The export source: a capped, GPU-backed ImageBitmap (not a big 2D canvas),
  // so the retained working set stays small on weak devices.
  const sourceBitmap = shallowRef<ImageBitmap | null>(null);
  // The display copy, kept alive so the keyed preview can be built on demand.
  const displayCanvas = shallowRef<HTMLCanvasElement | null>(null);
  // Map from display/analysis pixel space -> source pixel space.
  let scaleX = 1;
  let scaleY = 1;
  const hasImage = computed(() => sourceBitmap.value !== null);
  // What the cropper shows: keyed preview when on (and ready), else the plain image.
  const displaySrc = computed(() =>
    transparent.value && transparentSrc.value
      ? transparentSrc.value
      : plainSrc.value,
  );
  let revision = 0;

  function keyOutBackground(
    canvas: HTMLCanvasElement,
    background = bgModel.value,
  ) {
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    makeBackgroundTransparent(data, {
      background: background ?? undefined,
      tolerance: cfg().tolerance,
    });
    ctx.putImageData(data, 0, 0);
  }

  /**
   * Build and cache the keyed-out preview. Lazy: only runs when transparency is
   * on and the preview is not cached yet, so a module that never turns it on
   * pays nothing. Keyout runs on the display copy (<=1500px), not the full-res
   * source, so it stays cheap even on weak machines.
   */
  async function ensureKeyedPreview() {
    if (!transparent.value || transparentSrc.value) return;
    const display = displayCanvas.value;
    if (!display) return;
    const currentRevision = revision;
    preparingPreview.value = true;
    try {
      const keyed = document.createElement('canvas');
      keyed.width = display.width;
      keyed.height = display.height;
      keyed.getContext('2d')!.drawImage(display, 0, 0);
      let blob: Blob;
      try {
        keyOutBackground(keyed, bgModel.value);
        blob = await canvasToBlob(keyed, 'image/png');
      } finally {
        keyed.width = keyed.height = 0;
      }
      const url = URL.createObjectURL(blob);
      if (currentRevision !== revision) {
        URL.revokeObjectURL(url);
        return;
      }
      transparentSrc.value = url;
    } finally {
      if (currentRevision === revision) preparingPreview.value = false;
    }
  }

  // Turning transparency on builds the preview on demand; cached afterwards.
  watch(transparent, () => {
    void ensureKeyedPreview();
  });

  async function prepareImage(file: File): Promise<Bounds | null> {
    const currentRevision = ++revision;
    // Decode straight to a capped bitmap (edge + megapixel budget), so a huge
    // upload never becomes a giant retained canvas.
    const bitmap = await decodeSource(file, cfg().sourceMaxEdge, cfg().sourceMaxPixels);
    if (currentRevision !== revision) {
      bitmap.close();
      throw new Error('Image preparation cancelled');
    }
    // A small copy for display + analysis (cheap, constant cost).
    const display = bitmapToCanvas(bitmap, DISPLAY_MAX_EDGE);
    const dctx = display.getContext('2d')!;
    const data = dctx.getImageData(0, 0, display.width, display.height);
    // Sample once from the display image; reuse for detect + transparency.
    const bg = sampleBackground(data);
    const bounds = detectContentBounds(data, {
      background: bg,
      tolerance: cfg().tolerance,
      padding: 6,
    });

    // Plain (un-keyed) preview — this is the true image, shown when the toggle
    // is off. The keyed version is built lazily later, only if needed.
    let plainBlob: Blob;
    try {
      plainBlob = await canvasToBlob(display, 'image/png');
    } catch (error) {
      bitmap.close();
      display.width = display.height = 0;
      throw error;
    }
    if (currentRevision !== revision) {
      bitmap.close();
      display.width = display.height = 0;
      throw new Error('Image preparation cancelled');
    }
    const plainUrl = URL.createObjectURL(plainBlob);
    if (plainSrc.value) URL.revokeObjectURL(plainSrc.value);
    if (transparentSrc.value) URL.revokeObjectURL(transparentSrc.value);
    sourceBitmap.value?.close();
    if (displayCanvas.value) {
      displayCanvas.value.width = displayCanvas.value.height = 0;
    }
    scaleX = bitmap.width / display.width;
    scaleY = bitmap.height / display.height;
    bgModel.value = bg;
    detected.value = bounds;
    sourceBitmap.value = bitmap;
    displayCanvas.value = display;
    plainSrc.value = plainUrl;
    transparentSrc.value = ''; // invalidate the previous keyed cache
    // A fresh image starts at the policy's transparency default.
    transparent.value = cfg().defaultTransparent;
    // Pre-build the keyed preview only when the default is on (e.g. signature).
    void ensureKeyedPreview();
    return bounds;
  }

  function renderOutput(coords?: Bounds) {
    // Crop the full-res source bitmap (not the display copy) so output keeps
    // quality. Crop + output-downscale fold into a single drawImage (one
    // resample), and only the output-sized canvas is ever allocated.
    const bmp = sourceBitmap.value;
    if (!bmp || !coords) return null;
    const cropStarted = performance.now();
    // Display-space coordinates -> source-space pixels.
    const left = Math.max(0, Math.min(Math.round(coords.left * scaleX), bmp.width - 1));
    const top = Math.max(0, Math.min(Math.round(coords.top * scaleY), bmp.height - 1));
    const cropW = Math.max(1, Math.min(Math.round(coords.width * scaleX), bmp.width - left));
    const cropH = Math.max(1, Math.min(Math.round(coords.height * scaleY), bmp.height - top));
    // Output size = crop size, capped by the policy's outputMaxEdge.
    const outputMaxEdge = cfg().outputMaxEdge;
    const outScale = outputMaxEdge
      ? Math.min(1, outputMaxEdge / Math.max(cropW, cropH))
      : 1;
    const outW = Math.max(1, Math.round(cropW * outScale));
    const outH = Math.max(1, Math.round(cropH * outScale));
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, left, top, cropW, cropH, 0, 0, outW, outH);
    const cropMs = performance.now() - cropStarted;
    let backgroundMs: number | null = null;
    if (transparent.value) {
      const backgroundStarted = performance.now();
      // Includes pixel readback, classification and writing pixels to the canvas.
      keyOutBackground(out);
      backgroundMs = performance.now() - backgroundStarted;
    }
    return { canvas: out, cropMs, backgroundMs };
  }

  async function exportImage(coords?: Bounds) {
    const exportStarted = performance.now();
    const currentRevision = revision;
    const rendered = renderOutput(coords);
    if (!rendered) return null;
    const { canvas: out, cropMs, backgroundMs } = rendered;
    const outputWidth = out.width;
    const outputHeight = out.height;
    const pngStarted = performance.now();
    let blob: Blob;
    let encodeMs: number;
    try {
      // Wall-clock duration through toBlob's callback, including scheduling time.
      blob = await canvasToBlob(out, cfg().type, cfg().quality);
      encodeMs = performance.now() - pngStarted;
    } finally {
      out.width = out.height = 0;
    }
    if (currentRevision !== revision) throw new Error('Image export cancelled');
    if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
    const url = URL.createObjectURL(blob);
    resultUrl.value = url;
    const totalMs = performance.now() - exportStarted;
    if (import.meta.env.DEV) {
      console.info('[Image export timing]', {
        cropMs: Number(cropMs.toFixed(2)),
        backgroundMs: backgroundMs === null ? 'skipped' : Number(backgroundMs.toFixed(2)),
        encodeMs: Number(encodeMs.toFixed(2)),
        totalMs: Number(totalMs.toFixed(2)),
        outputPixels: `${outputWidth} x ${outputHeight}`,
        outputType: cfg().type,
        outputKB: Number((blob.size / 1024).toFixed(2)),
      });
    }
    return { blob, url };
  }

  function resetImage() {
    revision++;
    if (plainSrc.value) URL.revokeObjectURL(plainSrc.value);
    plainSrc.value = '';
    if (transparentSrc.value) URL.revokeObjectURL(transparentSrc.value);
    transparentSrc.value = '';
    preparingPreview.value = false;
    sourceBitmap.value?.close();
    sourceBitmap.value = null;
    if (displayCanvas.value) {
      displayCanvas.value.width = displayCanvas.value.height = 0;
    }
    displayCanvas.value = null;
    scaleX = scaleY = 1;
    detected.value = null;
    bgModel.value = null;
    if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
    resultUrl.value = '';
  }

  onScopeDispose(resetImage);

  return {
    hasImage,
    displaySrc,
    detected,
    bgModel,
    transparent,
    preparingPreview,
    resultUrl,
    prepareImage,
    exportImage,
    resetImage,
  };
}

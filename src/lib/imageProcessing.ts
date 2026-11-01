/**
 * Pure image-processing logic for the image crop feature.
 *
 * No DOM / canvas dependency on purpose: everything operates on an
 * `ImageData`-like object so it runs (and is unit-tested) in plain Node.
 *
 * Background is NOT assumed to be pure white. We sample the actual
 * background colour from the image border, then classify a pixel as
 * "content" (ink) when it is opaque enough AND differs from that
 * background by more than `tolerance`. This handles off-white scans,
 * light-grey UI backgrounds, coloured paper, and transparent PNGs.
 */

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Subset of the browser `ImageData` shape we actually use. */
export interface SimpleImageData {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

/** Representative background, derived from the image border. */
export interface BackgroundModel {
  transparent: boolean;
  r: number;
  g: number;
  b: number;
}

export interface ClassifyOptions {
  /** Alpha (0-255) below which a pixel is treated as background. */
  alphaFloor?: number;
  /** Max per-channel colour distance from the background still counted as background. */
  tolerance?: number;
  /** Pre-sampled background (e.g. from the full image) to reuse on a crop. */
  background?: BackgroundModel;
}

export interface DetectOptions extends ClassifyOptions {
  /** Extra pixels kept around the detected content, clamped to image edges. */
  padding?: number;
}

export type TransparentOptions = ClassifyOptions;

const DEFAULT_ALPHA_FLOOR = 16;
const DEFAULT_TOLERANCE = 32;

/** Perceived brightness of an RGB pixel (ITU-R BT.601). */
export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Estimate the background by taking the per-channel median of border pixels.
 * The median resists content that happens to touch an edge/corner.
 */
export function sampleBackground(
  img: SimpleImageData,
  alphaFloor = DEFAULT_ALPHA_FLOOR,
): BackgroundModel {
  const { data, width, height } = img;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const as: number[] = [];
  const step = Math.max(1, Math.floor(Math.max(width, height) / 100));
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
    as.push(data[i + 3]);
  };
  for (let x = 0; x < width; x += step) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    push(0, y);
    push(width - 1, y);
  }
  if (median(as) < alphaFloor) {
    return { transparent: true, r: 0, g: 0, b: 0 };
  }
  return { transparent: false, r: median(rs), g: median(gs), b: median(bs) };
}

function isContent(
  r: number,
  g: number,
  b: number,
  a: number,
  bg: BackgroundModel,
  alphaFloor: number,
  tolerance: number,
): boolean {
  if (a < alphaFloor) return false; // transparent-ish -> background
  if (bg.transparent) return true; // opaque over transparent bg -> content
  const dist = Math.max(
    Math.abs(r - bg.r),
    Math.abs(g - bg.g),
    Math.abs(b - bg.b),
  );
  return dist > tolerance;
}

/**
 * Find the bounding box of the "ink" (non-background) pixels.
 * Returns `null` when the image is entirely background / transparent.
 */
export function detectContentBounds(
  img: SimpleImageData,
  opts: DetectOptions = {},
): Bounds | null {
  const alphaFloor = opts.alphaFloor ?? DEFAULT_ALPHA_FLOOR;
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const padding = opts.padding ?? 0;
  const bg = opts.background ?? sampleBackground(img, alphaFloor);
  const { data, width, height } = img;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        isContent(data[i], data[i + 1], data[i + 2], data[i + 3], bg, alphaFloor, tolerance)
      ) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null; // no ink found

  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(height - 1, maxY + padding);

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Turn background pixels fully transparent (in place). Ink is kept opaque.
 * A no-op when the background is already transparent.
 */
export function makeBackgroundTransparent(
  img: SimpleImageData,
  opts: TransparentOptions = {},
): void {
  const alphaFloor = opts.alphaFloor ?? DEFAULT_ALPHA_FLOOR;
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const bg = opts.background ?? sampleBackground(img, alphaFloor);
  if (bg.transparent) return; // nothing to clear
  const { data, width, height } = img;
  const len = width * height * 4;
  for (let i = 0; i < len; i += 4) {
    if (!isContent(data[i], data[i + 1], data[i + 2], data[i + 3], bg, alphaFloor, tolerance)) {
      data[i + 3] = 0;
    }
  }
}

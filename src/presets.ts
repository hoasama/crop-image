/**
 * Quality policy for the reusable image-crop component.
 *
 * The component is *mechanism* (crop + background removal + export); "how sharp
 * / what format / how heavy" is *policy* that only the consuming module knows.
 * A module expresses intent via `purpose` (a named preset); it may override
 * individual knobs or pass a full custom `config`. Everything is finally
 * clamped to safe limits so a module can never crash a weak device.
 *
 * Precedence (later wins): DEFAULTS < preset(purpose) < config{} < explicit props
 * — then clampConfig().
 */

export interface QualityConfig {
  /** Ceiling for the kept original (export source). Caps output resolution. */
  sourceMaxEdge: number;
  /**
   * Megapixel budget for the kept source, independent of the edge cap. Bounds
   * decoded RAM / per-pixel work so a huge (e.g. square) image can't jank or
   * OOM a weak device even when each edge is under `sourceMaxEdge`.
   */
  sourceMaxPixels?: number;
  /** Cap for the final exported image after cropping. Omit = follow source. */
  outputMaxEdge?: number;
  /** Output MIME type, e.g. 'image/png' | 'image/jpeg' | 'image/webp'. */
  type: string;
  /** 0–1, only used by lossy types (jpeg/webp). */
  quality?: number;
  /** Whether the transparency toggle starts on. */
  defaultTransparent: boolean;
  /** Max per-channel colour distance from background still treated as background. */
  tolerance: number;
}

/** Safe fallback so a module that passes nothing still works. */
export const DEFAULTS: QualityConfig = {
  sourceMaxEdge: 2000,
  sourceMaxPixels: 40_000_000, // ~40 MP working budget — safe for weak devices
  type: 'image/png',
  defaultTransparent: false,
  tolerance: 32,
};

/** Named intents. Tune each purpose's quality policy here, in one place. */
export const PRESETS = {
  // Profile picture: small square-ish photo, light JPEG, crisp enough for a face.
  avatar: {
    sourceMaxEdge: 1500,
    outputMaxEdge: 512,
    type: 'image/jpeg',
    quality: 0.9,
    defaultTransparent: false,
    tolerance: 32,
  },
  // List/grid preview: smallest file wins.
  thumbnail: {
    sourceMaxEdge: 1500,
    outputMaxEdge: 256,
    type: 'image/jpeg',
    quality: 0.8,
    defaultTransparent: false,
    tolerance: 32,
  },
  // In-article / content image: good web size, balanced quality.
  content: {
    sourceMaxEdge: 2500,
    outputMaxEdge: 1600,
    type: 'image/jpeg',
    quality: 0.85,
    defaultTransparent: false,
    tolerance: 32,
  },
  // Scanned document kept for the record: maximum sharpness, no keying.
  document: {
    sourceMaxEdge: 4000,
    type: 'image/png',
    defaultTransparent: false,
    tolerance: 32,
  },
  // Stamp into a PDF: transparent PNG, modest size, light file.
  signature: {
    sourceMaxEdge: 2000,
    outputMaxEdge: 1000,
    type: 'image/png',
    defaultTransparent: true,
    tolerance: 32,
  },
  // Wide hero/banner: high resolution, JPEG to keep the file reasonable.
  banner: {
    sourceMaxEdge: 4000,
    outputMaxEdge: 2560,
    type: 'image/jpeg',
    quality: 0.88,
    defaultTransparent: false,
    tolerance: 32,
  },
  // Keep as close to the upload as possible: lossless PNG, no output downscale.
  // Wider pixel budget than the default, still bounded for safety.
  original: {
    sourceMaxEdge: 8192,
    sourceMaxPixels: 67_000_000,
    type: 'image/png',
    defaultTransparent: false,
    tolerance: 32,
  },
} satisfies Record<string, QualityConfig>;

export type Purpose = keyof typeof PRESETS;

/** Browser canvas guard-rails (Safari caps ~16 MP; keep a conservative edge). */
const SOURCE_MIN_EDGE = 256;
const SOURCE_MAX_EDGE = 8192;
const OUTPUT_MIN_EDGE = 16;
const SOURCE_MIN_PIXELS = 1_000_000; // 1 MP floor
const SOURCE_MAX_PIXELS = 67_000_000; // ~8192^2 ceiling

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Drop keys whose value is `undefined` so absent props don't erase presets. */
function pickDefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

export function clampConfig(cfg: QualityConfig): QualityConfig {
  const sourceMaxEdge = Math.round(
    clamp(cfg.sourceMaxEdge, SOURCE_MIN_EDGE, SOURCE_MAX_EDGE),
  );
  const outputMaxEdge =
    cfg.outputMaxEdge === undefined
      ? undefined
      : Math.round(clamp(cfg.outputMaxEdge, OUTPUT_MIN_EDGE, sourceMaxEdge));
  const sourceMaxPixels =
    cfg.sourceMaxPixels === undefined
      ? undefined
      : Math.round(clamp(cfg.sourceMaxPixels, SOURCE_MIN_PIXELS, SOURCE_MAX_PIXELS));
  const quality =
    cfg.quality === undefined ? undefined : clamp(cfg.quality, 0, 1);
  const tolerance = Math.round(clamp(cfg.tolerance, 0, 255));
  return { ...cfg, sourceMaxEdge, sourceMaxPixels, outputMaxEdge, quality, tolerance };
}

export interface ResolveInput {
  /** Named intent. Omit to rely on DEFAULTS + config/overrides. */
  purpose?: Purpose;
  /** Full custom config object (sits above the preset). */
  config?: Partial<QualityConfig>;
  /** Individual knob overrides, usually from component props (highest). */
  overrides?: Partial<QualityConfig>;
}

export function resolveConfig(input: ResolveInput): QualityConfig {
  const merged: QualityConfig = {
    ...DEFAULTS,
    ...(input.purpose ? PRESETS[input.purpose] : {}),
    ...pickDefined(input.config ?? {}),
    ...pickDefined(input.overrides ?? {}),
  };
  return clampConfig(merged);
}

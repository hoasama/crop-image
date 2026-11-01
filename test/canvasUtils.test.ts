import { describe, expect, it } from 'vitest';

import { fitWithin } from '../src/lib/canvasUtils';

describe('fitWithin', () => {
  it('never upscales an image already within both caps', () => {
    expect(fitWithin(1000, 800, 4000, 40_000_000)).toEqual({ width: 1000, height: 800 });
  });

  it('downscales to the edge cap, preserving aspect ratio', () => {
    expect(fitWithin(8000, 4000, 4000)).toEqual({ width: 4000, height: 2000 });
  });

  it('applies the pixel budget even when each edge is under the edge cap', () => {
    // 8000x8000 = 64 MP, edge under 8192 -> only the pixel budget bites.
    const { width, height } = fitWithin(8000, 8000, 8192, 40_000_000);
    expect(width).toBe(height); // square preserved
    expect(width * height).toBeLessThanOrEqual(40_050_000); // ~40 MP (rounding)
    expect(width).toBeGreaterThan(6300);
    expect(width).toBeLessThan(6340);
  });

  it('takes whichever cap is stricter', () => {
    // Edge cap (2000) is stricter than the generous pixel budget here.
    expect(fitWithin(6000, 3000, 2000, 40_000_000)).toEqual({ width: 2000, height: 1000 });
  });
});

import { describe, expect, it } from 'vitest';

import type { SimpleImageData } from '../src/lib/imageProcessing';

import {
  detectContentBounds,
  luminance,
  makeBackgroundTransparent,
} from '../src/lib/imageProcessing';

function makeImage(
  width: number,
  height: number,
  fill: [number, number, number, number] = [255, 255, 255, 255],
): SimpleImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { data, width, height };
}

function setPixel(
  img: SimpleImageData,
  x: number,
  y: number,
  rgba: [number, number, number, number?],
) {
  const i = (y * img.width + x) * 4;
  img.data[i] = rgba[0];
  img.data[i + 1] = rgba[1];
  img.data[i + 2] = rgba[2];
  img.data[i + 3] = rgba[3] ?? 255;
}

describe('luminance', () => {
  it('white is bright, black is dark', () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(255);
    expect(luminance(0, 0, 0)).toBe(0);
  });
});

describe('detectContentBounds', () => {
  it('returns null for an all-white image', () => {
    expect(detectContentBounds(makeImage(10, 10))).toBeNull();
  });

  it('finds the bounding box of dark pixels', () => {
    const img = makeImage(10, 10);
    setPixel(img, 3, 4, [0, 0, 0]);
    setPixel(img, 6, 7, [0, 0, 0]);
    expect(detectContentBounds(img)).toEqual({
      left: 3,
      top: 4,
      width: 4,
      height: 4,
    });
  });

  it('applies padding clamped to the edges', () => {
    const img = makeImage(10, 10);
    setPixel(img, 0, 0, [0, 0, 0]);
    expect(detectContentBounds(img, { padding: 3 })).toEqual({
      left: 0,
      top: 0,
      width: 4,
      height: 4,
    });
  });

  it('ignores fully transparent pixels', () => {
    const img = makeImage(10, 10, [0, 0, 0, 0]);
    expect(detectContentBounds(img)).toBeNull();
  });

  it('trims an off-white (non-pure-white) opaque background', () => {
    // #ebebeb paper, luminance 235 — the real-world scan case.
    const img = makeImage(10, 10, [235, 235, 235, 255]);
    setPixel(img, 4, 5, [16, 16, 16]);
    setPixel(img, 6, 7, [16, 16, 16]);
    expect(detectContentBounds(img)).toEqual({
      left: 4,
      top: 5,
      width: 3,
      height: 3,
    });
  });

  it('ignores near-invisible stray pixels over a transparent background', () => {
    const img = makeImage(10, 10, [0, 0, 0, 0]);
    setPixel(img, 4, 4, [16, 16, 16, 255]); // real ink
    setPixel(img, 0, 0, [0, 0, 0, 4]); // stray near-invisible corner
    setPixel(img, 9, 9, [0, 0, 0, 3]);
    expect(detectContentBounds(img)).toEqual({
      left: 4,
      top: 4,
      width: 1,
      height: 1,
    });
  });
});

describe('makeBackgroundTransparent', () => {
  it('clears near-white pixels and keeps dark ink opaque', () => {
    const img = makeImage(2, 1);
    setPixel(img, 0, 0, [255, 255, 255, 255]);
    setPixel(img, 1, 0, [10, 10, 10, 255]);
    makeBackgroundTransparent(img);
    expect(img.data[3]).toBe(0); // white -> transparent
    expect(img.data[7]).toBe(255); // ink -> opaque
  });

  it('clears an off-white background and keeps ink', () => {
    // 3x1: two #ebebeb paper pixels + one ink pixel.
    const img = makeImage(3, 1, [235, 235, 235, 255]);
    setPixel(img, 1, 0, [16, 16, 16, 255]);
    makeBackgroundTransparent(img);
    expect(img.data[3]).toBe(0); // paper -> transparent
    expect(img.data[7]).toBe(255); // ink -> opaque
    expect(img.data[11]).toBe(0); // paper -> transparent
  });
});

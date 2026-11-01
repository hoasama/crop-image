import { effectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useImageCrop } from '../src/composables/useImageCrop';
import { imageToCanvas } from '../src/lib/canvasUtils';
import { resolveConfig } from '../src/presets';

function stubCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: vi.fn(),
      getImageData: () => ({
        width: canvas.width,
        height: canvas.height,
        data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255),
      }),
      putImageData: vi.fn(),
    }),
    // No toDataURL: preparing an image must work without encoding data URLs.
    toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })),
  };
  return canvas;
}

function setup() {
  vi.stubGlobal('document', { createElement: () => stubCanvas() });
  // Decode stub: a File yields a 20x10 bitmap; a resize call honours its size.
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (src: { width?: number; height?: number }, opts?: { resizeWidth?: number; resizeHeight?: number }) => ({
      width: opts?.resizeWidth ?? src.width ?? 20,
      height: opts?.resizeHeight ?? src.height ?? 10,
      close: vi.fn(),
    })),
  );
  let id = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${++id}`);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const scope = effectScope();
  // Keep transparency off so prepareImage builds only the plain preview; the
  // keyed preview is lazy and covered by the e2e flow.
  const config = resolveConfig({ overrides: { defaultTransparent: false, tolerance: 32 } });
  const image = scope.run(() => useImageCrop(config))!;
  return { image, scope, revoke };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('image crop resources', () => {
  it('uses a Blob preview and releases the previous preview when replacing an image', async () => {
    const { image, scope, revoke } = setup();
    await image.prepareImage(new File(['first'], 'first.png'));
    const previous = image.displaySrc.value;
    expect(image.hasImage.value).toBe(true);
    expect(previous).toMatch(/^blob:/);
    image.transparent.value = false;
    expect(image.displaySrc.value).toBe(previous);
    await image.prepareImage(new File(['second'], 'second.png'));
    expect(revoke).toHaveBeenCalledWith(previous);
    expect(image.displaySrc.value).not.toBe(previous);
    scope.stop();
  });

  it('releases preview and output URLs when the owning scope is disposed', async () => {
    const { image, scope, revoke } = setup();
    await image.prepareImage(new File(['image'], 'image.png'));
    const preview = image.displaySrc.value;
    const result = await image.exportImage({ left: 0, top: 0, width: 10, height: 5 });
    scope.stop();
    expect(revoke).toHaveBeenCalledWith(preview);
    expect(revoke).toHaveBeenCalledWith(result!.url);
    expect(image.hasImage.value).toBe(false);
    expect(image.displaySrc.value).toBe('');
  });

  it('releases resources when selecting another image and allows reuse', async () => {
    const { image, scope, revoke } = setup();
    await image.prepareImage(new File(['image'], 'image.png'));
    const preview = image.displaySrc.value;
    image.resetImage();
    expect(revoke).toHaveBeenCalledWith(preview);
    expect(image.hasImage.value).toBe(false);
    expect(await image.exportImage({ left: 0, top: 0, width: 1, height: 1 })).toBeNull();
    await image.prepareImage(new File(['new'], 'new.png'));
    expect(image.hasImage.value).toBe(true);
    scope.stop();
  });

  it('does not restore image state after a reset during preparation', async () => {
    const { image, scope } = setup();
    const pending = image.prepareImage(new File(['image'], 'image.png'));
    image.resetImage();
    await expect(pending).rejects.toThrow('cancelled');
    expect(image.hasImage.value).toBe(false);
    expect(image.displaySrc.value).toBe('');
    scope.stop();
  });

  it('does not create an output URL after disposal during export', async () => {
    const { image, scope } = setup();
    await image.prepareImage(new File(['image'], 'image.png'));
    const pending = image.exportImage({ left: 0, top: 0, width: 10, height: 5 });
    scope.stop();
    await expect(pending).rejects.toThrow('cancelled');
    expect(image.resultUrl.value).toBe('');
  });
});

describe('processing resolution', () => {
  it('limits large images to 1500 pixels per edge while preserving aspect ratio', () => {
    vi.stubGlobal('document', { createElement: () => stubCanvas() });
    const canvas = imageToCanvas({ naturalWidth: 6000, naturalHeight: 4000 } as HTMLImageElement);
    expect([canvas.width, canvas.height]).toEqual([1500, 1000]);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(2_250_000);
  });

  it('does not upscale small images', () => {
    vi.stubGlobal('document', { createElement: () => stubCanvas() });
    const canvas = imageToCanvas({ naturalWidth: 600, naturalHeight: 200 } as HTMLImageElement);
    expect([canvas.width, canvas.height]).toEqual([600, 200]);
  });
});

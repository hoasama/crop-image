import { describe, expect, it } from 'vitest';

import { DEFAULTS, PRESETS, resolveConfig } from '../src/presets';

describe('resolveConfig precedence', () => {
  it('falls back to DEFAULTS when nothing is passed', () => {
    expect(resolveConfig({})).toEqual(DEFAULTS);
  });

  it('applies a named preset', () => {
    expect(resolveConfig({ purpose: 'thumbnail' })).toMatchObject({
      type: 'image/jpeg',
      outputMaxEdge: 256,
      quality: 0.8,
    });
  });

  it('config{} overrides the preset', () => {
    const cfg = resolveConfig({
      purpose: 'signature',
      config: { type: 'image/webp' },
    });
    expect(cfg.type).toBe('image/webp');
    // untouched preset fields survive
    expect(cfg.defaultTransparent).toBe(true);
  });

  it('explicit overrides win over both preset and config', () => {
    const cfg = resolveConfig({
      purpose: 'signature',
      config: { outputMaxEdge: 800 },
      overrides: { outputMaxEdge: 1600 },
    });
    expect(cfg.outputMaxEdge).toBe(1600);
  });

  it('ignores undefined overrides so absent props do not erase the preset', () => {
    const cfg = resolveConfig({
      purpose: 'thumbnail',
      overrides: { type: undefined, quality: undefined },
    });
    expect(cfg.type).toBe('image/jpeg');
    expect(cfg.quality).toBe(0.8);
  });
});

describe('clampConfig guard-rails', () => {
  it('clamps an absurd sourceMaxEdge down to the canvas limit', () => {
    expect(resolveConfig({ overrides: { sourceMaxEdge: 50000 } }).sourceMaxEdge).toBe(8192);
  });

  it('clamps a tiny sourceMaxEdge up to the floor', () => {
    expect(resolveConfig({ overrides: { sourceMaxEdge: 10 } }).sourceMaxEdge).toBe(256);
  });

  it('caps outputMaxEdge at the resolved sourceMaxEdge', () => {
    const cfg = resolveConfig({
      overrides: { sourceMaxEdge: 1000, outputMaxEdge: 4000 },
    });
    expect(cfg.outputMaxEdge).toBe(1000);
  });

  it('clamps quality into 0..1', () => {
    expect(resolveConfig({ overrides: { quality: 5 } }).quality).toBe(1);
    expect(resolveConfig({ overrides: { quality: -1 } }).quality).toBe(0);
  });

  it('every preset is already within the guard-rails', () => {
    for (const name of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      const cfg = resolveConfig({ purpose: name });
      expect(cfg.sourceMaxEdge).toBeLessThanOrEqual(8192);
      expect(cfg.sourceMaxEdge).toBeGreaterThanOrEqual(256);
      if (cfg.outputMaxEdge !== undefined) {
        expect(cfg.outputMaxEdge).toBeLessThanOrEqual(cfg.sourceMaxEdge);
      }
    }
  });
});

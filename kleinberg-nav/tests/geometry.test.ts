import { describe, expect, it } from 'vitest';
import {
  axisDelta,
  coordsOf,
  maxDistance,
  nodeId,
  torusDistance,
} from '../src/core/distance.ts';
import { deriveSeed, hash32, mulberry32, randomInt } from '../src/core/rng.ts';

describe('torus geometry', () => {
  it('computes known distances on n=8', () => {
    expect(torusDistance(0, 0, 8)).toBe(0);
    expect(torusDistance(0, 1, 8)).toBe(1);
    expect(torusDistance(0, 7, 8)).toBe(1);
    expect(torusDistance(0, 8, 8)).toBe(1);
    expect(torusDistance(0, 63, 8)).toBe(2);
    expect(torusDistance(0, 27, 8)).toBe(6);
  });

  it('is symmetric and bounded by maxDistance', () => {
    const n = 16;
    for (let i = 0; i < 2000; i++) {
      const a = (i * 977) % 256;
      const b = (i * 3571 + 13) % 256;
      const d = torusDistance(a, b, n);
      expect(d).toBe(torusDistance(b, a, n));
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(maxDistance(n));
    }
  });

  it('satisfies the triangle inequality', () => {
    const n = 32;
    for (let i = 0; i < 2000; i++) {
      const a = (i * 37) % 1024;
      const b = (i * 1013 + 7) % 1024;
      const c = (i * 2029 + 31) % 1024;
      expect(torusDistance(a, c, n)).toBeLessThanOrEqual(
        torusDistance(a, b, n) + torusDistance(b, c, n),
      );
    }
  });

  it('maps coordinates with positive modulo', () => {
    expect(nodeId(-1, -1, 8)).toBe(63);
    expect(nodeId(8, 8, 8)).toBe(0);
    expect(coordsOf(27, 8)).toEqual({ x: 3, y: 3 });
    expect(axisDelta(0, 7, 8)).toBe(1);
  });

  it('reports maxDistance as twice the half side', () => {
    expect(maxDistance(8)).toBe(8);
    expect(maxDistance(16)).toBe(16);
    expect(maxDistance(128)).toBe(128);
  });
});

describe('seeded randomness', () => {
  it('replays the same stream for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(43);
    let same = 0;
    for (let i = 0; i < 100; i++) if (a() === b()) same++;
    expect(same).toBe(0);
  });

  it('derives independent seeds per purpose', () => {
    expect(deriveSeed(42, 'graph', 1)).not.toBe(deriveSeed(42, 'pair', 1));
    expect(deriveSeed(42, 'graph', 1)).not.toBe(deriveSeed(42, 'graph', 2));
    expect(hash32(1, 2)).not.toBe(hash32(2, 1));
  });

  it('keeps randomInt unbiased and in range', () => {
    const rng = mulberry32(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) {
      const v = randomInt(rng, 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      buckets[v]++;
    }
    for (const count of buckets) {
      expect(Math.abs(count - 10000)).toBeLessThan(500);
    }
  });
});

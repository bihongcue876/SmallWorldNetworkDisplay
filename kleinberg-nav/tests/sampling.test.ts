import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/core/graph.ts';
import {
  buildDistanceLayers,
  getLayers,
  sampleLongTarget,
  samplePair,
} from '../src/core/sample.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { torusDistance } from '../src/core/distance.ts';

describe('distance layers', () => {
  it('counts every node except the origin', () => {
    const n = 32;
    const layers = buildDistanceLayers(n, 2);
    let total = 0;
    for (let d = 1; d <= layers.maxD; d++) total += layers.counts[d];
    expect(total).toBe(n * n - 1);
    expect(layers.counts[1]).toBe(4);
    expect(layers.maxD).toBe(32);
  });

  it('matches the analytic weights within sampling error', () => {
    const n = 32;
    const alpha = 2;
    const layers = buildDistanceLayers(n, alpha);
    const rng = mulberry32(99);
    const samples = 40000;
    const seen = new Int32Array(layers.maxD + 1);

    const origin = 7 * n + 5;
    for (let i = 0; i < samples; i++) {
      const id = sampleLongTarget(layers, 5, 7, rng);
      const d = torusDistance(id, origin, n);
      expect(d).toBeGreaterThan(0);
      seen[d]++;
    }

    for (let d = 1; d <= 8; d++) {
      const expected = (layers.counts[d] * Math.pow(d, -alpha) * samples) / layers.total;
      expect(Math.abs(seen[d] - expected) / expected).toBeLessThan(0.2);
    }
  });

  it('caches layer tables by size and exponent', () => {
    const a = getLayers(16, 2);
    const b = getLayers(16, 2);
    const c = getLayers(16, 1);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('source-target pairs', () => {
  it('never draws the same node twice', () => {
    for (let i = 0; i < 500; i++) {
      const pair = samplePair(16, 42, i);
      expect(pair.source).not.toBe(pair.target);
      expect(pair.source).toBeGreaterThanOrEqual(0);
      expect(pair.source).toBeLessThan(256);
    }
  });

  it('is deterministic for the same index', () => {
    expect(samplePair(32, 42, 3)).toEqual(samplePair(32, 42, 3));
    expect(samplePair(32, 42, 3)).not.toEqual(samplePair(32, 42, 4));
  });
});

describe('graph construction', () => {
  it('keeps local edges symmetric and long edges off-node', () => {
    const graph = buildGraph({ n: 8, alpha: 2, k: 1, seed: 42 });
    for (let id = 0; id < graph.N; id++) {
      for (let i = 0; i < 4; i++) {
        const v = graph.local[id * 4 + i];
        let back = false;
        for (let j = 0; j < 4; j++) if (graph.local[v * 4 + j] === id) back = true;
        expect(back).toBe(true);
      }
      expect(graph.long[id]).not.toBe(id);
    }
  });

  it('reproduces the same graph for the same seed', () => {
    const a = buildGraph({ n: 16, alpha: 2, k: 1, seed: 7 });
    const b = buildGraph({ n: 16, alpha: 2, k: 1, seed: 7 });
    const c = buildGraph({ n: 16, alpha: 2, k: 1, seed: 8 });
    expect(Array.from(a.long)).toEqual(Array.from(b.long));
    expect(Array.from(a.long)).not.toEqual(Array.from(c.long));
  });

  it('places the four local neighbours in fixed order', () => {
    const graph = buildGraph({ n: 8, alpha: 2, k: 1, seed: 42 });
    expect(Array.from(graph.local.slice(0, 4))).toEqual([1, 8, 7, 56]);
  });
});

import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/core/graph.ts';
import { greedyRoute, shortestPathLength, stepLimitFor } from '../src/core/route.ts';
import {
  addTrial,
  configHash,
  emptyTally,
  finalizeTally,
  wilsonInterval,
} from '../src/core/metrics.ts';
import { defaultConfig, runBatch, runSingle } from '../src/core/experiment.ts';
import { maxDistance, torusDistance } from '../src/core/distance.ts';
import type { Graph } from '../src/core/types.ts';

describe('greedy routing', () => {
  it('walks the grid when only local edges exist', () => {
    const graph = buildGraph({ n: 8, alpha: 2, k: 0, seed: 1 });
    const result = greedyRoute(graph, 0, 27, { collectPath: true });
    expect(result.success).toBe(true);
    expect(result.steps).toBe(6);
    expect(Array.from(result.path)).toEqual([0, 1, 2, 3, 11, 19, 27]);
  });

  it('stops at a dead end when no neighbour is closer', () => {
    const n = 4;
    const local = new Int32Array(16 * 4).fill(15);
    const graph: Graph = {
      n,
      N: 16,
      alpha: 2,
      k: 0,
      seed: 0,
      local,
      long: new Int32Array(0),
    };
    const result = greedyRoute(graph, 0, 5, { collectPath: true });
    expect(result.success).toBe(false);
    expect(result.failure).toBe('dead-end');
    expect(result.steps).toBe(0);
  });

  it('reports the step limit when the budget is exhausted', () => {
    const graph = buildGraph({ n: 8, alpha: 2, k: 0, seed: 1 });
    const result = greedyRoute(graph, 0, 27, { stepLimit: 0 });
    expect(result.failure).toBe('limit');
  });

  it('keeps distance strictly decreasing along the path', () => {
    const graph = buildGraph({ n: 32, alpha: 2, k: 1, seed: 3 });
    for (let i = 0; i < 100; i++) {
      const source = (i * 977) % graph.N;
      const target = (source + 1 + ((i * 3571) % (graph.N - 1))) % graph.N;
      const result = greedyRoute(graph, source, target, { collectPath: true });
      expect(result.success).toBe(true);
      expect(result.path[0]).toBe(source);
      expect(result.path[result.path.length - 1]).toBe(target);
      expect(result.path.length).toBe(result.steps + 1);
      expect(result.steps).toBeLessThanOrEqual(maxDistance(graph.n));
      let previous = torusDistance(result.path[0], target, graph.n);
      for (let k = 1; k < result.path.length; k++) {
        const current = torusDistance(result.path[k], target, graph.n);
        expect(current).toBeLessThan(previous);
        previous = current;
      }
    }
  });

  it('never exceeds the shortest path length', () => {
    const graph = buildGraph({ n: 32, alpha: 2, k: 1, seed: 3 });
    for (let i = 0; i < 100; i++) {
      const source = (i * 131) % graph.N;
      const target = (source + 1 + ((i * 739) % (graph.N - 1))) % graph.N;
      const result = greedyRoute(graph, source, target, { collectPath: false });
      const shortest = shortestPathLength(graph, source, target);
      expect(shortest).toBeGreaterThanOrEqual(0);
      expect(result.steps).toBeGreaterThanOrEqual(shortest);
    }
  });

  it('defines the step limit as ten times the side', () => {
    expect(stepLimitFor(16, 10)).toBe(160);
  });
});

describe('statistics', () => {
  it('computes the Wilson interval for 10 of 20', () => {
    const ci = wilsonInterval(10, 20);
    expect(ci.lower).toBeCloseTo(0.2993, 3);
    expect(ci.upper).toBeCloseTo(0.7007, 3);
  });

  it('handles the empty sample', () => {
    expect(wilsonInterval(0, 0)).toEqual({ lower: 0, upper: 1 });
    const stats = finalizeTally(emptyTally(), defaultConfig());
    expect(stats.trials).toBe(0);
    expect(stats.meanSteps).toBeNull();
    expect(stats.meanStretch).toBeNull();
  });

  it('hashes the configuration deterministically', () => {
    const config = defaultConfig({ n: 64, alpha: 1.75 });
    expect(configHash(config)).toBe(configHash({ ...config }));
    expect(configHash(config)).not.toBe(configHash({ ...config, alpha: 2 }));
    expect(configHash(config)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('separates failed trials from successful ones', () => {
    const tally = emptyTally();
    addTrial(
      tally,
      { success: true, failure: 'none', steps: 4, longHops: 1, path: new Int32Array(0) },
      2,
    );
    addTrial(
      tally,
      { success: false, failure: 'dead-end', steps: 2, longHops: 0, path: new Int32Array(0) },
      3,
    );
    const stats = finalizeTally(tally, defaultConfig());
    expect(stats.trials).toBe(2);
    expect(stats.successes).toBe(1);
    expect(stats.successRate).toBe(0.5);
    expect(stats.meanSteps).toBe(4);
    expect(stats.meanShortest).toBe(2.5);
    expect(stats.meanStretch).toBe(2);
    expect(stats.deadEndRate).toBe(0.5);
  });
});

describe('experiment orchestration', () => {
  it('runs a single demo with a path', () => {
    const run = runSingle({ n: 16, alpha: 2, k: 1, seed: 42 }, 0);
    expect(run.result.path.length).toBe(run.result.steps + 1);
    expect(run.shortest).toBeGreaterThanOrEqual(0);
    expect(run.pair.source).not.toBe(run.pair.target);
  });

  it('reproduces the same batch twice', () => {
    const config = defaultConfig({ n: 16, graphs: 4, pairsPerGraph: 10 });
    const a = runBatch(config).stats;
    const b = runBatch(config).stats;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.trials).toBe(40);
    expect(a.successes).toBe(40);
    expect(a.deadEndRate).toBe(0);
    expect(a.limitRate).toBe(0);
    expect(a.meanSteps).not.toBeNull();
    expect(a.meanShortest).not.toBeNull();
  });

  it('honours cancellation between pairs', () => {
    const config = defaultConfig({ n: 16, graphs: 2, pairsPerGraph: 5 });
    let checks = 0;
    const result = runBatch(config, {
      shouldCancel: () => {
        checks++;
        return checks > 3;
      },
    });
    expect(result.cancelled).toBe(true);
    expect(result.stats.trials).toBe(4);
    expect(result.stats.trials).toBeLessThan(10);
  });

  it('reports progress for long batches', () => {
    const config = defaultConfig({ n: 16, graphs: 2, pairsPerGraph: 150 });
    const seen: number[] = [];
    runBatch(config, { onProgress: (done) => seen.push(done) });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(300);
  });
});

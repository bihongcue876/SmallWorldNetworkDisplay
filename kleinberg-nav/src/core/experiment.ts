import { buildGraph } from './graph.ts';
import { addTrial, emptyTally, finalizeTally } from './metrics.ts';
import { deriveSeed } from './rng.ts';
import { greedyRoute, shortestPathLength } from './route.ts';
import { samplePair } from './sample.ts';
import type {
  BatchResult,
  ExperimentConfig,
  Graph,
  GraphConfig,
  PairSpec,
  RouteResult,
} from './types.ts';

export const DEFAULT_STEP_LIMIT_FACTOR = 10;

export interface SingleRun {
  graph: Graph;
  pair: PairSpec;
  result: RouteResult;
  shortest: number;
}

export interface RunOptions {
  /** 每 200 次路由回调一次，避免 Worker 消息过密。 */
  onProgress?: (done: number, total: number) => void;
  /** 在每个源目标对结束时检查，返回 true 则提前结束。 */
  shouldCancel?: () => boolean;
  /** 是否计算 BFS 最短路，默认 true。 */
  includeShortestPath?: boolean;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** 前端默认参数：n=32、alpha=2、5 张图 × 20 对。 */
export function defaultConfig(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    n: 32,
    alpha: 2,
    k: 1,
    seed: 42,
    graphs: 5,
    pairsPerGraph: 20,
    stepLimitFactor: DEFAULT_STEP_LIMIT_FACTOR,
    ...overrides,
  };
}

/** 单次演示：建一张图、取一对源目标、跑一次带路径的路由。 */
export function runSingle(config: GraphConfig, pairIndex = 0): SingleRun {
  const graph = buildGraph(config);
  const pair = samplePair(config.n, config.seed, pairIndex);
  const result = greedyRoute(graph, pair.source, pair.target, { collectPath: true });
  const shortest = shortestPathLength(graph, pair.source, pair.target);
  return { graph, pair, result, shortest };
}

/**
 * 批量实验：外层按图号建图，内层按对号取源目标。
 * 源目标只依赖 pairIndex，不同图复用同一组配对，构成配对设计。
 */
export function runBatch(config: ExperimentConfig, options: RunOptions = {}): BatchResult {
  const started = now();
  const tally = emptyTally();
  const includeShortest = options.includeShortestPath !== false;
  const stepLimit = (config.stepLimitFactor ?? DEFAULT_STEP_LIMIT_FACTOR) * config.n;
  const total = config.graphs * config.pairsPerGraph;

  let done = 0;

  for (let g = 0; g < config.graphs; g++) {
    const graph = buildGraph({
      n: config.n,
      alpha: config.alpha,
      k: config.k,
      seed: deriveSeed(config.seed, 'graph', g),
    });

    for (let p = 0; p < config.pairsPerGraph; p++) {
      const pair = samplePair(config.n, config.seed, p);
      const result = greedyRoute(graph, pair.source, pair.target, {
        collectPath: false,
        stepLimit,
      });

      const shortest = includeShortest
        ? shortestPathLength(graph, pair.source, pair.target)
        : 0;
      addTrial(tally, result, shortest);
      done++;

      if (options.onProgress !== undefined && done % 200 === 0) {
        options.onProgress(done, total);
      }

      if (options.shouldCancel?.() === true) {
        options.onProgress?.(done, total);
        return {
          stats: finalizeTally(tally, config),
          cancelled: true,
          elapsedMs: now() - started,
        };
      }
    }
  }

  options.onProgress?.(total, total);
  return {
    stats: finalizeTally(tally, config),
    cancelled: false,
    elapsedMs: now() - started,
  };
}

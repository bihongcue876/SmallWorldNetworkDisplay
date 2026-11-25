import { nodeId } from './distance.ts';
import { deriveSeed, mulberry32 } from './rng.ts';
import { getLayers, sampleLongTarget } from './sample.ts';
import type { Graph, GraphConfig } from './types.ts';

/**
 * 建一张 G_alpha：先填本地边，再给每个节点抽 k 条有向长程边。
 * 每个节点使用独立派生流，与循环顺序、并行化无关。
 */
export function buildGraph(config: GraphConfig): Graph {
  const { n, alpha, k, seed } = config;
  const N = n * n;

  const local = new Int32Array(N * 4);
  for (let id = 0; id < N; id++) {
    const x = id % n;
    const y = (id / n) | 0;
    const base = id * 4;
    local[base] = nodeId(x + 1, y, n);
    local[base + 1] = nodeId(x, y + 1, n);
    local[base + 2] = nodeId(x - 1, y, n);
    local[base + 3] = nodeId(x, y - 1, n);
  }

  const layers = getLayers(n, alpha);
  const long = new Int32Array(N * k);
  for (let id = 0; id < N; id++) {
    const rng = mulberry32(deriveSeed(seed, 'long', id));
    const x = id % n;
    const y = (id / n) | 0;
    const base = id * k;
    for (let j = 0; j < k; j++) {
      long[base + j] = sampleLongTarget(layers, x, y, rng);
    }
  }

  return { n, N, alpha, k, seed, local, long };
}

/** 图缓存键，前端按此缓存整张图。 */
export function graphKey(config: GraphConfig): string {
  return `${config.n}|${config.alpha}|${config.k}|${config.seed}`;
}

import { nodeId, torusDistance } from './distance.ts';
import { deriveSeed, mulberry32, randomInt, type Rng } from './rng.ts';
import type { PairSpec } from './types.ts';

/**
 * 以原点为参考的距离分层表。环面平移不变，任意节点的距离分布相同，
 * 因此所有节点共用一张表，采样时只需平移。
 */
export interface DistanceLayers {
  n: number;
  alpha: number;
  maxD: number;
  /** counts[d] = 距离恰为 d 的节点数，d 从 1 开始，d=0 已被排除。 */
  counts: Int32Array;
  /** 长度 maxD+2，counts 的前缀和，starts[d] 是第 d 层的起始下标。 */
  starts: Int32Array;
  /** 长度 N-1，按距离分组存放相对原点的节点。 */
  nodes: Int32Array;
  /** 长度 maxD+1，cum[0]=0，cum[d] 为权重前缀和。 */
  cum: Float64Array;
  total: number;
}

const LAYER_CACHE_LIMIT = 8;
const layerCache = new Map<string, DistanceLayers>();

/**
 * 建表四步：统计层大小、前缀和、填充分层、累加按距离加权的概率。
 * 权重为 counts[d] * d^(-alpha)，排除 d=0 即禁止长程边指向自身。
 */
export function buildDistanceLayers(n: number, alpha: number): DistanceLayers {
  const N = n * n;
  const maxD = 2 * (n >> 1);
  const counts = new Int32Array(maxD + 1);
  const nodes = new Int32Array(N - 1);

  for (let v = 1; v < N; v++) counts[torusDistance(0, v, n)]++;

  const starts = new Int32Array(maxD + 2);
  for (let d = 1; d <= maxD; d++) starts[d + 1] = starts[d] + counts[d];

  const cursor = starts.slice();
  for (let v = 1; v < N; v++) {
    const d = torusDistance(0, v, n);
    nodes[cursor[d]++] = v;
  }

  const cum = new Float64Array(maxD + 1);
  for (let d = 1; d <= maxD; d++) {
    cum[d] = cum[d - 1] + counts[d] * Math.pow(d, -alpha);
  }

  return { n, alpha, maxD, counts, starts, nodes, cum, total: cum[maxD] };
}

/** 按距离分层抽一条长程边的目标，返回绝对节点编号。 */
export function sampleLongTarget(
  layers: DistanceLayers,
  x: number,
  y: number,
  rng: Rng,
): number {
  const n = layers.n;
  const r = rng() * layers.total;

  // 找第一个 cum[d] > r 的 d，即权重区间所在的层。
  let lo = 1;
  let hi = layers.maxD;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (layers.cum[mid] > r) hi = mid;
    else lo = mid + 1;
  }

  const d = lo;
  const idx = layers.starts[d] + randomInt(rng, layers.counts[d]);
  const ref = layers.nodes[idx];
  return nodeId(x + (ref % n), y + ((ref / n) | 0), n);
}

/** 带 LRU 的层表缓存，键为 n 与 alpha。 */
export function getLayers(n: number, alpha: number): DistanceLayers {
  const key = `${n}|${alpha}`;
  const hit = layerCache.get(key);
  if (hit !== undefined) {
    layerCache.delete(key);
    layerCache.set(key, hit);
    return hit;
  }
  const built = buildDistanceLayers(n, alpha);
  layerCache.set(key, built);
  while (layerCache.size > LAYER_CACHE_LIMIT) {
    const oldest = layerCache.keys().next().value;
    if (oldest === undefined) break;
    layerCache.delete(oldest);
  }
  return built;
}

/**
 * 抽一对源目标，保证 s != t 且在节点上均匀。
 * 只用 pairIndex，不掺图序号，因此不同图复用同一组配对。
 * 用"偏移一次抽取"代替"抽到相同再重抽"，抽取次数固定。
 */
export function samplePair(n: number, seed: number, index: number): PairSpec {
  const N = n * n;
  const rng = mulberry32(deriveSeed(seed, 'pair', index));
  const source = randomInt(rng, N);
  const target = (source + 1 + randomInt(rng, N - 1)) % N;
  return { source, target };
}

import { maxDistance, torusDistance } from './distance.ts';
import type { Graph, NodeId, RouteOptions, RouteResult } from './types.ts';

const EMPTY_PATH = new Int32Array(0);

/** 路径缓冲区，跨调用复用；路径长度不可能超过 maxDistance(n)+1。 */
let pathScratch = new Int32Array(0);

/** BFS 缓冲区，按节点数惰性扩容。 */
let distScratch = new Int32Array(0);
let queueScratch = new Int32Array(0);

export function stepLimitFor(n: number, factor: number): number {
  return factor * n;
}

function finishPath(buf: Int32Array | null, len: number): Int32Array {
  return buf === null ? EMPTY_PATH : buf.slice(0, len);
}

/**
 * 严格贪心路由：每步在本地邻居与长程边中选到目标距离最小的节点，
 * 只在严格更近时移动。距离单调递减，不会成环。
 * 死胡同只在理论上存在；limit 仅在使用人为小步数上限时出现。
 */
export function greedyRoute(
  graph: Graph,
  source: NodeId,
  target: NodeId,
  options: RouteOptions = {},
): RouteResult {
  const n = graph.n;
  const limit = options.stepLimit ?? stepLimitFor(n, 10);
  const collect = options.collectPath ?? true;

  let buf: Int32Array | null = null;
  if (collect) {
    const need = maxDistance(n) + 2;
    if (pathScratch.length < need) pathScratch = new Int32Array(need);
    buf = pathScratch;
  }

  let u = source;
  let steps = 0;
  let longHops = 0;
  let len = 0;
  if (buf !== null) buf[len++] = u;

  while (u !== target && steps < limit) {
    const du = torusDistance(u, target, n);
    let best = -1;
    let bestD = du;
    let bestIsLong = false;

    const lbase = u * 4;
    for (let i = 0; i < 4; i++) {
      const v = graph.local[lbase + i];
      const dv = torusDistance(v, target, n);
      if (dv < bestD) {
        best = v;
        bestD = dv;
        bestIsLong = false;
      }
    }

    const gbase = u * graph.k;
    for (let j = 0; j < graph.k; j++) {
      const v = graph.long[gbase + j];
      const dv = torusDistance(v, target, n);
      if (dv < bestD) {
        best = v;
        bestD = dv;
        bestIsLong = true;
      }
    }

    if (best < 0) {
      return { success: false, failure: 'dead-end', steps, longHops, path: finishPath(buf, len) };
    }

    u = best;
    steps++;
    if (bestIsLong) longHops++;
    if (buf !== null) buf[len++] = u;
  }

  if (u === target) {
    return { success: true, failure: 'none', steps, longHops, path: finishPath(buf, len) };
  }
  return { success: false, failure: 'limit', steps, longHops, path: finishPath(buf, len) };
}

/**
 * 有向图上的 BFS 最短跳数。本地边双向、长程边只沿出边扩展，
 * 与贪心路由使用的可达性一致。返回 -1 只在实现出错时出现。
 */
export function shortestPathLength(graph: Graph, source: NodeId, target: NodeId): number {
  if (source === target) return 0;

  const N = graph.N;
  if (distScratch.length < N) {
    distScratch = new Int32Array(N);
    queueScratch = new Int32Array(N);
  }

  const dist = distScratch;
  const queue = queueScratch;
  dist.fill(-1, 0, N);

  let head = 0;
  let tail = 0;
  queue[tail++] = source;
  dist[source] = 0;

  while (head < tail) {
    const u = queue[head++];
    const next = dist[u] + 1;

    const lbase = u * 4;
    for (let i = 0; i < 4; i++) {
      const v = graph.local[lbase + i];
      if (dist[v] < 0) {
        if (v === target) return next;
        dist[v] = next;
        queue[tail++] = v;
      }
    }

    const gbase = u * graph.k;
    for (let j = 0; j < graph.k; j++) {
      const v = graph.long[gbase + j];
      if (dist[v] < 0) {
        if (v === target) return next;
        dist[v] = next;
        queue[tail++] = v;
      }
    }
  }

  return -1;
}

import { axisDelta, maxDistance, torusDistance } from './distance.ts';
import { buildGraph } from './graph.ts';
import { deriveSeed } from './rng.ts';
import { getLayers, samplePair } from './sample.ts';

/**
 * q=2 最优性的机制层测量。
 *
 * 核心量：P(d)，当前距离为 d 时，一步之内跳进目标半径 d/2 球内的概率。
 * Kleinberg 引理给出 P(d) ∝ d^(2-alpha)/Z(alpha)，alpha=2 时与 d 无关。
 * 这里既做实测（从路由轨迹里数），也做精确理论值（枚举球内点，无自由参数）。
 */

export interface MechanismConfig {
  n: number;
  alpha: number;
  k: number;
  seed: number;
  graphs: number;
  pairsPerGraph: number;
}

/** 单步统计：按当前距离分桶。 */
export interface BucketStat {
  exp: number;
  lo: number;
  hi: number;
  states: number;
  hits: number;
  rate: number;
  meanD: number;
  theory: number;
  /** 轴向源点的理论值，用于说明环面离散几何的各向异性。 */
  theoryAxis: number;
  /** 本桶内平均每步的距离缩减，用作效率诊断。 */
  meanDrop: number;
}

/** 阶段统计：按「距离减半」里程碑切分，起始距离分桶。 */
export interface StageStat {
  exp: number;
  lo: number;
  hi: number;
  count: number;
  meanStart: number;
  meanSteps: number;
  /** 理论阶段步数：(1-(1-P)^m)/P，P 取理论值，m 取 floor(d/2)。 */
  predicted: number;
  /** 阶段内长程边造成的减半占比。 */
  longShare: number;
}

export interface MechanismResult {
  config: MechanismConfig;
  buckets: BucketStat[];
  stages: StageStat[];
  routes: number;
  stepsSum: number;
  meanSteps: number;
  longHalves: number;
  localHalves: number;
  predicted: number;
  /** 按源点方位分组的减半率：0=轴向，1=对角，2=其他。 */
  azRate: number[];
  /** 按方位分组的样本数。 */
  azStates: number[];
  /** 用期望减距离模型预测的平均步数。 */
  predictedDrop: number;
}

/** floor(log2(d))，d 必须为正。 */
export function bucketOf(d: number): number {
  return 31 - Math.clz32(d);
}

/** 源点相对目标的方位类别：0=轴向，1=对角，2=其他。 */
function azimuthClass(u: number, t: number, n: number): number {
  const half = n >> 1;
  let dx = (u % n) - (t % n);
  if (dx > half) dx -= n;
  if (dx < -half) dx += n;
  let dy = ((u / n) | 0) - ((t / n) | 0);
  if (dy > half) dy -= n;
  if (dy < -half) dy += n;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  if (ax === 0 || ay === 0) return 0;
  if (ax === ay) return 1;
  return 2;
}

/** 球内点去重用的标记数组，配合自增版本号避免每次清零。 */
let marks = new Int32Array(0);
let stamp = 0;

/** s^(-alpha) 查表，避免在内层循环里反复调 Math.pow。 */
const invPowCache = new Map<string, Float64Array>();

function invPowTable(n: number, alpha: number): Float64Array {
  const key = `${n}|${alpha}`;
  const hit = invPowCache.get(key);
  if (hit !== undefined) return hit;
  const len = 2 * n + 1;
  const table = new Float64Array(len);
  for (let s = 1; s < len; s++) table[s] = Math.pow(s, -alpha);
  invPowCache.set(key, table);
  return table;
}

/** 层平均概率的缓存，键为 n|alpha|d。 */
const layerRateCache = new Map<string, number>();

/** 层平均期望减距离的缓存。 */
const dropCache = new Map<string, number>();

/**
 * 层平均期望距离缩减 E[Δd | d]。
 *
 * 对 k=1，一步之后新距离取 min(d-1, 长程边落点到目标的距离)，
 * 于是 E[Δd] = 1 + Σ_{v: dist(v,t) < d-1} w(v)·(d-1-dist(v,t)) / Z，
 * 其中 w(v) = dist(u,v)^(-alpha)。这是精确等式，不是近似。
 * 同样对整条距离层取平均，避免轴向/对角带来的五成差异。
 */
export function theoreticalDrop(n: number, alpha: number, d: number): number {
  if (d <= 2) return 1;

  const half = n >> 1;
  if (d > half) return Number.NaN;

  const key = `${n}|${alpha}|${d}`;
  const cached = dropCache.get(key);
  if (cached !== undefined) return cached;

  const layers = getLayers(n, alpha);
  const total = layers.total;
  if (!(total > 0)) return 1;

  const inv = invPowTable(n, alpha);
  const R = d - 1;
  const M = 96;
  let sum = 0;
  let count = 0;

  for (let k = 0; k < M; k++) {
    const dx = Math.round(-d + (2 * d * k) / (M - 1));
    const rest = d - (dx < 0 ? -dx : dx);
    const signs = rest === 0 ? [1] : [-1, 1];
    for (const sgn of signs) {
      const dy = rest * sgn;
      let acc = 0;
      for (let vx = -R; vx <= R; vx++) {
        const ay = R - (vx < 0 ? -vx : vx);
        for (let vy = -ay; vy <= ay; vy++) {
          const dv = (vx < 0 ? -vx : vx) + (vy < 0 ? -vy : vy);
          const gain = R - dv;
          if (gain <= 0) continue;
          const du = axisDelta(dx, vx, n) + axisDelta(dy, vy, n);
          if (du <= 0) continue;
          acc += inv[du] * gain;
        }
      }
      sum += 1 + acc / total;
      count += 1;
    }
  }

  const value = count > 0 ? sum / count : 1;
  dropCache.set(key, value);
  return value;
}

/** 用期望减距离沿距离轴递推，预测从 d0 走到目标的总步数。 */
export function predictStepsByDrop(n: number, alpha: number, d0: number): number {
  const half = n >> 1;
  const start = Math.min(d0, half);
  if (start <= 1) return 1;

  let d = start;
  let steps = 0;
  while (d > 1 && steps < 100000) {
    // 取最近的 2 的幂作为尺度代表，避免每步都做一次 O(d^2) 的枚举。
    const level = Math.max(2, Math.round(Math.pow(2, Math.round(Math.log2(d)))));
    const drop = theoreticalDrop(n, alpha, level);
    const step = Number.isFinite(drop) && drop > 1 ? drop : 1;
    d -= step;
    steps += 1;
  }
  return steps + 1;
}

/**
 * 层平均理论概率：对距离恰为 d 的所有源点求平均。
 *
 * 环面的曼哈顿球不是各向同性的：源点在菱形边界的轴向处 P 最小，
 * 在 45 度对角处 P 最大，两者可差五成。路由实际到达的源点散布在整条
 * 边界上，所以对照值应取层平均，而不是单独取轴向。
 * 只对 48 个等距边界点采样（覆盖整条边界），再用球内精确求和。
 */
export function theoreticalRateLayer(n: number, alpha: number, d: number): number {
  if (d <= 1) return 1;

  const key = `${n}|${alpha}|${d}`;
  const cached = layerRateCache.get(key);
  if (cached !== undefined) return cached;

  const layers = getLayers(n, alpha);
  const total = layers.total;
  if (!(total > 0)) return 0;

  const inv = invPowTable(n, alpha);
  const r = d >> 1;
  const M = 240;
  let sum = 0;
  let count = 0;

  for (let k = 0; k < M; k++) {
    const dx = Math.round(-d + (2 * d * k) / (M - 1));
    const rest = d - (dx < 0 ? -dx : dx);
    const signs = rest === 0 ? [1] : [-1, 1];
    for (const sgn of signs) {
      const dy = rest * sgn;
      let acc = 0;
      for (let vx = -r; vx <= r; vx++) {
        const ay = r - (vx < 0 ? -vx : vx);
        for (let vy = -ay; vy <= ay; vy++) {
          const du = axisDelta(dx, vx, n) + axisDelta(dy, vy, n);
          if (du > 0) acc += inv[du];
        }
      }
      sum += acc / total;
      count += 1;
    }
  }

  const value = count > 0 ? sum / count : 0;
  layerRateCache.set(key, value);
  return value;
}

/**
 * 精确理论概率：从距离 d 处出发，单条长程边落进目标 d/2 球的概率。
 *
 * 固定源点 u=(0,0)、目标 t 在曼哈顿距离 d 处，枚举球内所有 v，
 * 累加 d(u,v)^(-alpha)，除以全图权重和。分母只与 n、alpha 有关，
 * 分子只与 d 有关，全程不含可调参数。
 */
export function theoreticalRate(n: number, alpha: number, d: number): number {
  if (d <= 1) return 1;

  const layers = getLayers(n, alpha);
  const total = layers.total;
  if (!(total > 0)) return 0;

  const N = n * n;
  if (marks.length < N) {
    marks = new Int32Array(N);
    stamp = 0;
  }
  stamp += 1;
  const now = stamp;

  const half = n >> 1;
  let tx: number;
  let ty: number;
  if (d <= half) {
    tx = d;
    ty = 0;
  } else {
    tx = half;
    ty = d - half;
  }

  const r = d >> 1;
  let num = 0;
  for (let dx = -r; dx <= r; dx++) {
    const ay = r - (dx < 0 ? -dx : dx);
    for (let dy = -ay; dy <= ay; dy++) {
      const vx = (((tx + dx) % n) + n) % n;
      const vy = (((ty + dy) % n) + n) % n;
      const v = vy * n + vx;
      if (marks[v] === now) continue;
      marks[v] = now;
      if (v === 0) continue;
      const du = torusDistance(0, v, n);
      num += Math.pow(du, -alpha);
    }
  }

  return num / total;
}

/**
 * 一个阶段（把距离从 d 压到 d/2）的期望步数。
 * 每步以概率 P 成功，失败则局部边把距离减 1；阶段最迟在走满 d/2 步时结束。
 */
export function predictedStageSteps(p: number, d: number): number {
  if (d <= 1) return 1;
  if (!(p > 0)) return d / 2;
  const m = Math.max(1, d >> 1);
  const q = Math.pow(1 - p, m);
  return (1 - q) / p;
}

/** 用理论 P(d) 沿阶段递推，预测从 d0 走到目标的总步数。 */
export function predictSteps(n: number, alpha: number, d0: number): number {
  let total = 1;
  let d = d0;
  while (d > 1) {
    const p = theoreticalRateLayer(n, alpha, d);
    total += predictedStageSteps(p, d);
    d = (d + 1) >> 1;
  }
  return total;
}

/**
 * 跑批量并聚合机制层数据。路由逻辑与 greedyRoute 完全一致，
 * 只是额外记录每步距离、走的是不是长程边、以及长程边是否落进 d/2 球。
 */
export function runMechanism(config: MechanismConfig): MechanismResult {
  const { n, alpha, k, seed, graphs, pairsPerGraph } = config;
  const maxD = maxDistance(n);
  const nb = bucketOf(maxD) + 1;

  const states = new Int32Array(nb);
  const hits = new Int32Array(nb);
  const dSum = new Float64Array(nb);
  const dropSum = new Float64Array(nb);
  const stages = new Int32Array(nb);
  const stageStartSum = new Float64Array(nb);
  const stageStepsSum = new Float64Array(nb);
  const stageLong = new Int32Array(nb);
  const startBuckets = new Int32Array(nb);
  const azStates = new Int32Array(3);
  const azHits = new Int32Array(3);

  const limit = 10 * n;
  let routes = 0;
  let stepsSum = 0;
  let longHalves = 0;
  let localHalves = 0;

  for (let g = 0; g < graphs; g++) {
    const graph = buildGraph({ n, alpha, k, seed: deriveSeed(seed, 'graph', g) });

    for (let p = 0; p < pairsPerGraph; p++) {
      const { source, target } = samplePair(n, seed, p);

      let u = source;
      let walked = 0;
      let stageStart = torusDistance(source, target, n);
      let stageWalked = 0;
      let stageLongHops = 0;

      while (u !== target && walked < limit) {
        const d = torusDistance(u, target, n);
        if (d === 0) break;

        const b = bucketOf(d);
        states[b] += 1;
        dSum[b] += d;

        let hit = false;
        const gbase = u * k;
        for (let j = 0; j < k; j++) {
          const v = graph.long[gbase + j];
          if (2 * torusDistance(v, target, n) <= d) {
            hit = true;
            break;
          }
        }
        if (hit) hits[b] += 1;

        const cls = azimuthClass(u, target, n);
        azStates[cls] += 1;
        if (hit) azHits[cls] += 1;

        let best = -1;
        let bestD = d;
        let bestLong = false;

        const lbase = u * 4;
        for (let i = 0; i < 4; i++) {
          const v = graph.local[lbase + i];
          const dv = torusDistance(v, target, n);
          if (dv < bestD) {
            best = v;
            bestD = dv;
            bestLong = false;
          }
        }
        for (let j = 0; j < k; j++) {
          const v = graph.long[gbase + j];
          const dv = torusDistance(v, target, n);
          if (dv < bestD) {
            best = v;
            bestD = dv;
            bestLong = true;
          }
        }

        if (best < 0) break;

        dropSum[b] += d - bestD;
        walked += 1;
        stageWalked += 1;
        if (bestLong) stageLongHops += 1;

        if (2 * bestD <= d) {
          if (bestLong) longHalves += 1;
          else localHalves += 1;
        }

        // 距离减半即阶段结束，按阶段起始距离归档。
        if (2 * bestD <= stageStart) {
          const sb = bucketOf(stageStart);
          stages[sb] += 1;
          stageStartSum[sb] += stageStart;
          stageStepsSum[sb] += stageWalked;
          stageLong[sb] += stageLongHops;
          stageStart = bestD;
          stageWalked = 0;
          stageLongHops = 0;
        }

        u = best;
      }

      if (u !== target) continue;

      if (stageStart > 0) {
        const sb = bucketOf(stageStart);
        stages[sb] += 1;
        stageStartSum[sb] += stageStart;
        stageStepsSum[sb] += stageWalked;
        stageLong[sb] += stageLongHops;
      }

      routes += 1;
      stepsSum += walked;
      const dStart = torusDistance(source, target, n);
      startBuckets[bucketOf(dStart)] += 1;
    }
  }

  const bucketStats: BucketStat[] = [];
  for (let e = 0; e < nb; e++) {
    if (states[e] === 0) continue;
    const meanD = dSum[e] / states[e];
    bucketStats.push({
      exp: e,
      lo: 1 << e,
      hi: Math.min((1 << (e + 1)) - 1, maxD),
      states: states[e],
      hits: hits[e],
      rate: hits[e] / states[e],
      meanD,
      theory: theoreticalRateLayer(n, alpha, Math.round(meanD)),
      theoryAxis: theoreticalRate(n, alpha, Math.round(meanD)),
      meanDrop: dropSum[e] / states[e],
    });
  }

  const stageStats: StageStat[] = [];
  for (let e = 0; e < nb; e++) {
    if (stages[e] === 0) continue;
    const meanStart = stageStartSum[e] / stages[e];
    const theory = theoreticalRateLayer(n, alpha, Math.round(meanStart));
    stageStats.push({
      exp: e,
      lo: 1 << e,
      hi: Math.min((1 << (e + 1)) - 1, maxD),
      count: stages[e],
      meanStart,
      meanSteps: stageStepsSum[e] / stages[e],
      predicted: predictedStageSteps(theory, Math.round(meanStart)),
      longShare: stages[e] > 0 ? stageLong[e] / stages[e] : Number.NaN,
    });
  }

  // 总步数预测：对每条路由的全部阶段求和，再按路由数平均。
  let predictedSum = 0;
  for (let e = 0; e < nb; e++) {
    if (stages[e] === 0) continue;
    const dStart = Math.round(stageStartSum[e] / stages[e]);
    predictedSum +=
      predictedStageSteps(theoreticalRateLayer(n, alpha, dStart), dStart) * stages[e];
  }

  let predictedDropSum = 0;
  for (let e = 0; e < nb; e++) {
    if (startBuckets[e] === 0) continue;
    const dStart = Math.round((1 << e) * 1.5 - 0.5);
    predictedDropSum += predictStepsByDrop(n, alpha, dStart) * startBuckets[e];
  }

  return {
    config,
    buckets: bucketStats,
    stages: stageStats,
    routes,
    stepsSum,
    meanSteps: routes > 0 ? stepsSum / routes : Number.NaN,
    longHalves,
    localHalves,
    predicted: routes > 0 ? predictedSum / routes : Number.NaN,
    azRate: [0, 1, 2].map((i) => (azStates[i] > 0 ? azHits[i] / azStates[i] : Number.NaN)),
    azStates: Array.from(azStates),
    predictedDrop: routes > 0 ? predictedDropSum / routes : Number.NaN,
  };
}

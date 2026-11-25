/** 节点编号：id = y * n + x，取值范围 [0, n*n)。 */
export type NodeId = number;

/** 路由终点状态。'none' 表示成功到达目标。 */
export type FailureKind = 'none' | 'dead-end' | 'limit';

export interface GraphConfig {
  /** 网格边长，节点总数 N = n*n。 */
  n: number;
  /** 长程边距离分布的指数。 */
  alpha: number;
  /** 每个节点的长程边数量，首版为 1。 */
  k: number;
  /** 建图种子，非负整数。 */
  seed: number;
}

export interface Graph {
  readonly n: number;
  readonly N: number;
  readonly alpha: number;
  readonly k: number;
  readonly seed: number;
  /** 长度 N*4，顺序为右、下、左、上。本地边双向。 */
  readonly local: Int32Array;
  /** 长度 N*k，每个节点的有向长程边目标。 */
  readonly long: Int32Array;
}

export interface RouteOptions {
  /** 步数上限，默认 10n。 */
  stepLimit?: number;
  /** 是否记录路径，默认 true；批量实验传 false 以免分配。 */
  collectPath?: boolean;
}

export interface RouteResult {
  success: boolean;
  failure: FailureKind;
  steps: number;
  longHops: number;
  /** collectPath 为 false 时长度为 0。 */
  path: Int32Array;
}

export interface PairSpec {
  source: NodeId;
  target: NodeId;
}

export interface ExperimentConfig extends GraphConfig {
  graphs: number;
  pairsPerGraph: number;
  stepLimitFactor: number;
}

export interface Ci {
  lower: number;
  upper: number;
}

/** 批量实验的累加器，字段均为原始和，避免逐次求均值。 */
export interface Tally {
  trials: number;
  successes: number;
  deadEnds: number;
  limits: number;
  stepsSum: number;
  stepsSqSum: number;
  longHopsSum: number;
  stretchSum: number;
  stretchCount: number;
  shortestSum: number;
  shortestCount: number;
}

export interface BatchStats {
  config: ExperimentConfig;
  configHash: string;
  trials: number;
  successes: number;
  successRate: number;
  successCi: Ci;
  deadEndRate: number;
  limitRate: number;
  /** 成功样本的平均跳数，无成功样本时为 null。 */
  meanSteps: number | null;
  /** 平均跳数的标准误，成功样本少于 2 时为 null。 */
  stepsSe: number | null;
  /** 同一批源目标对的最短跳数均值，由 BFS 求得。 */
  meanShortest: number | null;
  /** 成功样本的效率比 steps / 最短跳数 的均值。 */
  meanStretch: number | null;
  /** 成功样本的长程边使用率。 */
  longEdgeUsage: number | null;
}

export interface BatchResult {
  stats: BatchStats;
  cancelled: boolean;
  elapsedMs: number;
}

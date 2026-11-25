# Core 设计

`src/core` 是唯一的算法实现，浏览器、Worker、Node 脚本都调用它，前端不再重写任何距离、采样或路由逻辑。本文档给出文件划分、类型、函数签名与关键实现点；口径以 [Theory.md](Theory.md) 为准。

## 1. 边界

- 纯 TypeScript，无 DOM、无 Node API、无第三方依赖，可在浏览器与 Node 中直接运行。
- 所有随机性来自显式种子，同一配置必须给出逐位相同的结果。
- 不做 I/O、不做格式化、不做进度条 UI；进度与取消以回调形式暴露。
- 批量路径下不分配对象：40 万次路由要复用缓冲区。

## 2. 文件与依赖

| 文件 | 职责 | 依赖 | 预算 |
|---|---|---|---|
| `types.ts` | 全部公共类型 | 无 | 90 行 |
| `rng.ts` | mulberry32、种子派生、无偏整数 | 无 | 60 行 |
| `distance.ts` | 环面坐标、距离、方向常量 | 无 | 50 行 |
| `sample.ts` | 距离层表、长程边采样、源目标抽样 | `distance` `rng` | 120 行 |
| `graph.ts` | 建图与层表缓存 | `types` `distance` `sample` `rng` | 80 行 |
| `route.ts` | 严格贪心、BFS 最短路 | `types` `distance` | 140 行 |
| `metrics.ts` | Wilson 区间、聚合、配置哈希 | `types` | 130 行 |
| `experiment.ts` | 单次与批量编排 | `graph` `route` `metrics` `sample` `rng` | 120 行 |
| `index.ts` | 公共导出 | 以上 | 10 行 |

```
distance ─┬─→ sample ─→ graph ─┐
rng ──────┘                    ├─→ experiment ─→ index
distance ─────→ route ─────────┤
types ─────────→ metrics ──────┘
```

`route.ts` 不依赖 `graph.ts`，只依赖 `Graph` 类型，避免循环引用。

## 3. types.ts

```ts
export type NodeId = number;

export type FailureKind = 'none' | 'dead-end' | 'limit';

export interface GraphConfig {
  n: number;
  alpha: number;
  k: number;
  seed: number;
}

export interface Graph {
  readonly n: number;
  readonly N: number;
  readonly alpha: number;
  readonly k: number;
  readonly seed: number;
  readonly local: Int32Array; // 长度 N*4，顺序为右、下、左、上
  readonly long: Int32Array;  // 长度 N*k
}

export interface RouteOptions {
  stepLimit?: number;
  collectPath?: boolean;
}

export interface RouteResult {
  success: boolean;
  failure: FailureKind;
  steps: number;
  longHops: number;
  path: Int32Array; // collectPath 为 false 时长度为 0
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
  meanSteps: number | null;
  stepsSe: number | null;
  meanShortest: number | null;
  meanStretch: number | null;
  longEdgeUsage: number | null;
}

export interface BatchResult {
  stats: BatchStats;
  cancelled: boolean;
  elapsedMs: number;
}
```

`BatchStats` 与 `Tally` 都是纯数据，可被 `structuredClone` 传给 Worker，不含 `Graph`。

## 4. rng.ts

```ts
export type Rng = () => number;
export type Purpose = 'graph' | 'pair' | 'long' | 'tie';

export function mulberry32(seed: number): Rng;
export function hash32(...parts: number[]): number;
export function deriveSeed(base: number, purpose: Purpose, ...index: number[]): number;
export function randomInt(rng: Rng, maxExclusive: number): number;
```

- `mulberry32` 为标准实现，取 `>>> 0` 归一化，返回 `[0, 1)`。
- `hash32` 采用 FNV-1a，逐参数按小端拆成 4 字节再混合，保证 `hash32(1, 2)` 与 `hash32(2, 1)` 不同。这是“不依赖拼接字符串”的关键，避免 `"12" + "3"` 与 `"1" + "23"` 相撞。
- `deriveSeed` 的 `purpose` 映射到固定常量：`graph=1`、`pair=2`、`long=3`、`tie=4`，再与 `index` 一起进 `hash32`。
- `randomInt` 用拒绝采样消除取模偏差：先算 `limit = floor(2^32 / max) * max`，抽到小于 `limit` 的值再取模；`max <= 1` 直接返回 0。

禁止 `Math.random()`、禁止用 `seed + index` 这类线性组合派生种子。

## 5. distance.ts

```ts
export const DIRS: ReadonlyArray<readonly [number, number]>; // [1,0] [0,1] [-1,0] [0,-1]

export function axisDelta(a: number, b: number, n: number): number;
export function torusDistance(a: number, b: number, n: number): number;
export function maxDistance(n: number): number;
export function nodeId(x: number, y: number, n: number): number;
export function coordsOf(id: number, n: number): { x: number; y: number };
```

```ts
export function axisDelta(a: number, b: number, n: number): number {
  const d = a > b ? a - b : b - a;
  return d <= n >> 1 ? d : n - d;
}

export function torusDistance(a: number, b: number, n: number): number {
  return axisDelta(a % n, b % n, n) + axisDelta((a / n) | 0, (b / n) | 0, n);
}
```

- `maxDistance(n) = 2 * (n >> 1)`，n 为偶数时等于 `n`。
- `nodeId` 对坐标取正模：`((v % n) + n) % n`，因为建图时要传 `x-1` 这样的负值。
- `DIRS` 的顺序即路由检查顺序，改动会改变平局结果，属于模型口径，不允许随手调整。

## 6. sample.ts

```ts
export interface DistanceLayers {
  n: number;
  alpha: number;
  maxD: number;
  counts: Int32Array;  // 索引 1..maxD
  starts: Int32Array;  // 长度 maxD+2，counts 的前缀和
  nodes: Int32Array;   // 长度 N-1，按距离分组存放相对原点的节点
  cum: Float64Array;   // 长度 maxD+1，cum[0]=0，权重前缀和
  total: number;
}

export function buildDistanceLayers(n: number, alpha: number): DistanceLayers;
export function sampleLongTarget(layers: DistanceLayers, x: number, y: number, rng: Rng): NodeId;
export function samplePair(n: number, seed: number, index: number): PairSpec;
export function getLayers(n: number, alpha: number): DistanceLayers;
export function clearLayerCache(): void;
```

建表四步，对应 Theory 4.3：

1. 遍历 `v = 1 … N-1`，`d = torusDistance(0, v, n)`，累加 `counts[d]`。跳过 0 即排除自环。
2. 求前缀和得到 `starts`，再把每个 `v` 放到 `nodes[starts[d] + 游标]`。
3. 权重 `w[d] = counts[d] * Math.pow(d, -alpha)`，`d` 从 1 开始，累加成 `cum`。
4. `total = cum[maxD]`。

采样两个随机数：

```ts
const r = rng() * layers.total;
let lo = 1, hi = layers.maxD;
while (lo < hi) {
  const mid = (lo + hi) >> 1;
  if (layers.cum[mid] > r) hi = mid; else lo = mid + 1;
}
const d = lo;
const idx = layers.starts[d] + randomInt(rng, layers.counts[d]);
const ref = layers.nodes[idx];
return nodeId(x + (ref % layers.n), y + ((ref / layers.n) | 0), layers.n);
```

- 二分找的是“第一个 `cum[d] > r` 的 `d`”，与 Theory 4.3 的区间定义一致。
- 层内取点用 `randomInt` 而不是 `Math.floor(rng() * count)`，避免 `count` 不整除 2³² 时的偏差。
- `α = 0` 时 `Math.pow(d, 0) = 1`，权重退化为 `counts[d]`，即均匀抽取，不需要单独分支；这也正是 Watts–Strogatz 参数点。
- 层表只依赖 `(n, α)`，用 `Map<string, DistanceLayers>` 缓存，键为 `` `${n}|${alpha}` ``，超过 8 项按插入顺序淘汰最旧的。

`samplePair` 保证 `s ≠ t` 且两者在 `V` 上均匀：

```ts
const N = n * n;
const rng = mulberry32(deriveSeed(seed, 'pair', index));
const source = randomInt(rng, N);
const target = (source + 1 + randomInt(rng, N - 1)) % N;
```

用“偏移一次抽取”代替“抽到相同再重抽”，抽取次数固定，避免流位置随结果变化；分布与 Theory 7 的“重抽直到不同”等价。索引只用 `pairIndex`，不掺图序号，因此不同图复用同一组 `(s,t)`，构成配对设计。

## 7. graph.ts

```ts
export function buildGraph(config: GraphConfig): Graph;
export function graphKey(config: GraphConfig): string; // `${n}|${alpha}|${k}|${seed}`
```

建图顺序固定：先填 `local`（按 `id` 递增，四个方向按 `DIRS` 顺序取模），再按 `id` 递增给每个节点抽 `k` 条长程边。

```ts
const long = new Int32Array(N * k);
for (let id = 0; id < N; id++) {
  const rng = mulberry32(deriveSeed(seed, 'long', id));
  const x = id % n, y = (id / n) | 0;
  for (let j = 0; j < k; j++) long[id * k + j] = sampleLongTarget(layers, x, y, rng);
}
```

- 每个节点一条独立派生流，节点之间互不影响；将来并行建图或跳过部分节点，结果不变。
- 长程边允许指向本地邻居，允许互指，但不指向自身（`d ≥ 1`）。
- 不变量（测试中检查）：`local[id*4+i]` 的 `local` 反向包含 `id`；`long[id*k+j] !== id`。

## 8. route.ts

```ts
export function stepLimitFor(n: number, factor: number): number;
export function greedyRoute(
  graph: Graph,
  source: NodeId,
  target: NodeId,
  options?: RouteOptions,
): RouteResult;
export function shortestPathLength(graph: Graph, source: NodeId, target: NodeId): number;
```

### 8.1 贪心主循环

下面是主循环骨架，省略结果构造、路径缓冲与返回值细节。

```ts
while (u !== target) {
  if (steps >= limit) return fail('limit');
  const du = torusDistance(u, target, n);
  let best = -1, bestD = du, bestIsLong = false;
  for (let i = 0; i < 4; i++) {
    const v = graph.local[u * 4 + i];
    const dv = torusDistance(v, target, n);
    if (dv < bestD) { best = v; bestD = dv; bestIsLong = false; }
  }
  for (let j = 0; j < graph.k; j++) {
    const v = graph.long[u * graph.k + j];
    const dv = torusDistance(v, target, n);
    if (dv < bestD) { best = v; bestD = dv; bestIsLong = true; }
  }
  if (best < 0) return fail('dead-end');
  u = best; steps++;
  if (bestIsLong) longHops++;
  if (buf) buf[len++] = u;
}
```

- 比较严格小于，本地邻居先于长程边，本地按 `DIRS` 顺序。三者共同决定结果，改动即改变模型。
- 起点等于终点时直接返回 `success`、`steps = 0`。
- `collectPath` 为 false 时不写缓冲区，`path` 返回共享的空数组，批量路径零分配。
- `stepLimitFor(n, 10) = 10 * n`；实际不会触发，保留作断言，见 Theory 5.3。

不变量：距离每步至少减 1，且上界为 `maxDistance(n)`，所以 `steps ≤ maxDistance(n)` 且路径无重复节点。批量实验若出现 `limit` 或 `steps > maxDistance(n)`，直接抛错而不是继续统计。

### 8.2 BFS

```ts
const dist = getDistBuffer(N); // Int32Array，整块 fill(-1)
dist.fill(-1);
queue[0] = source; dist[source] = 0;
let head = 0, tail = 1;
while (head < tail) {
  const u = queue[head++];
  if (u === target) return dist[u];
  // 本地边：双向；长程边：只走 u 的出边
}
return -1;
```

- 图是有向的（本地边双向、长程边单向），BFS 按出边扩展，与路由使用的可达性一致。
- `-1` 只在实现出错时出现，本地边保证全图连通；批量中遇到则抛错。
- 缓冲区按 `N` 惰性扩容，跨调用复用。

## 9. metrics.ts

```ts
export function emptyTally(): Tally;
export function addTrial(tally: Tally, result: RouteResult, shortest: number): void;
export function wilsonInterval(successes: number, trials: number, z?: number): Ci;
export function configHash(config: ExperimentConfig): string;
export function finalizeTally(tally: Tally, config: ExperimentConfig): BatchStats;
```

`addTrial` 只在 `success` 时累加 `stepsSum`、`stepsSqSum`、`longHopsSum`；`stretch` 额外要求 `shortest > 0`；`shortestSum` 对每一对都累加，不论成败。

`finalizeTally` 的公式：

| 字段 | 公式 |
|---|---|
| `successRate` | `successes / trials` |
| `deadEndRate` | `deadEnds / trials` |
| `limitRate` | `limits / trials` |
| `meanSteps` | `stepsSum / successes`，0 成功时为 `null` |
| `stepsSe` | `sqrt((stepsSqSum − stepsSum²/successes) / (successes − 1) / successes)`，成功数小于 2 时为 `null` |
| `longEdgeUsage` | `longHopsSum / stepsSum`，无成功时为 `null` |
| `meanStretch` | `stretchSum / stretchCount`，无样本时为 `null` |
| `meanShortest` | `shortestSum / shortestCount` |

Wilson 区间按标准式实现，`z = 1.959963984540054`，`trials = 0` 返回 `[0, 1]`：

```ts
const p = successes / trials;
const denom = 1 + z * z / trials;
const center = (p + z * z / (2 * trials)) / denom;
const half = (z / denom) * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials));
```

`configHash` 把 `n|alpha|k|graphs|pairsPerGraph|seed|stepLimitFactor` 拼成字符串，`alpha` 用 `toFixed(4)` 固定小数位，再取 FNV-1a 的 8 位小写十六进制。同一配置必须得到同一哈希，与调用顺序、语言环境无关。

## 10. experiment.ts

```ts
export const DEFAULT_STEP_LIMIT_FACTOR = 10;

export function defaultConfig(overrides?: Partial<ExperimentConfig>): ExperimentConfig;
export function runSingle(config: GraphConfig, pairIndex?: number): SingleRun;
export function runBatch(config: ExperimentConfig, options?: RunOptions): BatchResult;

export interface SingleRun {
  graph: Graph;
  pair: PairSpec;
  result: RouteResult;
  shortest: number;
}

export interface RunOptions {
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
  includeShortestPath?: boolean; // 默认 true
}
```

`defaultConfig` 返回 `n=32, alpha=2, k=1, seed=42, graphs=5, pairsPerGraph=20, stepLimitFactor=10`，与前端默认值一致。

`runBatch` 外层按 `graphIndex` 建图，内层按 `pairIndex` 取源目标：

```ts
for (let g = 0; g < config.graphs; g++) {
  const graph = buildGraph({ ...config, seed: deriveSeed(config.seed, 'graph', g) });
  for (let p = 0; p < config.pairsPerGraph; p++) {
    const { source, target } = samplePair(config.n, config.seed, p);
    const result = greedyRoute(graph, source, target, { collectPath: false });
    const shortest = includeShortest ? shortestPathLength(graph, source, target) : 0;
    addTrial(tally, result, shortest);
  }
}
```

- 每 200 次调用一次 `onProgress`，避免 Worker 消息过密。
- `shouldCancel` 在每个 pair 结束时检查，命中后返回 `cancelled: true` 与已完成部分的统计。
- 建图种子由 `deriveSeed(seed, 'graph', g)` 派生；同一 `seed`、不同 `α` 得到不同图，这是模型要求，不是缺陷。
- `runSingle` 用于前端演示：建一张图、取 `pairIndex` 对应的一对、跑一次带路径的路由，并给出 `ℓ`。

## 11. 性能与内存

`n = 128`、`N = 16384`、`graphs = 50`、`pairs = 100` 时：

| 环节 | 量级 | 预估 |
|---|---|---|
| 建一张图 | `16384 × k` 次采样，每次 2 个随机数 | 约 2 ms |
| 单次路由 | 平均 20–40 步，每步 5 次距离计算 | 约 3 μs |
| 单次 BFS | 约 `N + 4N + kN` 次邻接访问 | 约 0.2 ms |
| 一个配置 | 50 图 + 5000 对 | 1.5–2 s |
| 全网格 80 配置 | 4000 图 + 40 万次路由 + 40 万次 BFS | 2–3 min |

BFS 是主要开销。先看成功率时给 `includeShortestPath: false` 可以把单配置压到 0.3 s 以内；论文出图时再补效率比。

内存只与单张图相关：`local` 为 `4N` 个 `Int32`（n=128 时 256 KB），`long` 为 `kN`，BFS 缓冲 `2N`，层表 `N` 与 `maxD`。不保留多张图，除非前端缓存。

## 12. 测试计划

| 文件 | 用例 | 判定 |
|---|---|---|
| `distance.test.ts` | n=8 的已知距离；`d(a,b)=d(b,a)`；随机 10⁴ 组三角不等式 | 全部通过 |
| `rng.test.ts` | 同种子同序列；不同 `purpose` 不同序列；`randomInt` 落在 `[0, max)` 且频数偏差 < 1% | 全部通过 |
| `sample.test.ts` | n=32、α=2，抽 10⁵ 条长程边，各层频率与 `counts[d]·d⁻²` 的相对偏差 < 5%；α=0 时各层单点概率相等 | 通过 |
| `graph.test.ts` | `local` 双向；四邻居坐标正确；`long` 不含自身；同种子两次建图逐元素相同 | 通过 |
| `route.test.ts` | n=8 手工构造图上的路径与跳数；死胡同判定；`path[0]=s`；距离严格递减；`steps ≤ maxDistance` | 通过 |
| `metrics.test.ts` | Wilson：10/20 → `[0.2993, 0.7007]`；0/0 边界；`configHash` 对字段顺序不敏感、对数值敏感 | 通过 |
| `experiment.test.ts` | n=16，α=2 与 α=0 各 10 图 × 20 对，成功率差 > 0.5；两次调用结果完全一致 | 通过 |
| `consistency.test.ts` | 固定快照 n=32、α=2、seed=42、2 图 × 10 对 | 与快照逐字段相同 |

`experiment.test.ts` 的第一条同时是“实现正确”的最小证据：α=2 必须明显优于 α=0，否则先查距离、平局与采样，不要先怀疑理论。

## 13. 对外契约

Worker 消息体：

```ts
type WorkerRequest =
  | { kind: 'batch'; id: number; config: ExperimentConfig }
  | { kind: 'cancel'; id: number };

type WorkerResponse =
  | { kind: 'progress'; id: number; done: number; total: number }
  | { kind: 'done'; id: number; result: BatchResult }
  | { kind: 'error'; id: number; message: string };
```

CSV 列顺序固定，首列为 `configHash`：

```
configHash,n,alpha,k,seed,graphs,pairsPerGraph,trials,successRate,ciLower,ciUpper,
meanSteps,stepsSe,meanShortest,meanStretch,longEdgeUsage,deadEnds,limits
```

所有浮点按 `toFixed(6)` 输出，避免不同区域设置下的逗号小数点。

## 14. 不做

- 不做 `k > 1` 的界面，但 core 按 `k` 通用实现，脚本可直接跑稳健性配置。
- 不做随机平局；`tie` 流位保留，首版不消费。
- 不做 `n > 128` 的性能优化，也不做层次模型。
- 不在 core 里做格式化、排序或颜色映射，这些属于 `src/web` 与绘图脚本。

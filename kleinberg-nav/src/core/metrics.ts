import type { BatchStats, Ci, ExperimentConfig, RouteResult, Tally } from './types.ts';

const Z95 = 1.959963984540054;

export function emptyTally(): Tally {
  return {
    trials: 0,
    successes: 0,
    deadEnds: 0,
    limits: 0,
    stepsSum: 0,
    stepsSqSum: 0,
    longHopsSum: 0,
    stretchSum: 0,
    stretchCount: 0,
    shortestSum: 0,
    shortestCount: 0,
  };
}

/**
 * 累加一次路由结果。失败样本只进失败计数，不进跳数均值；
 * 最短路对每一对都累加，不论成败。
 */
export function addTrial(tally: Tally, result: RouteResult, shortest: number): void {
  tally.trials++;

  if (shortest > 0) {
    tally.shortestSum += shortest;
    tally.shortestCount++;
  }

  if (result.failure === 'dead-end') tally.deadEnds++;
  else if (result.failure === 'limit') tally.limits++;

  if (!result.success) return;

  tally.successes++;
  tally.stepsSum += result.steps;
  tally.stepsSqSum += result.steps * result.steps;
  tally.longHopsSum += result.longHops;

  if (shortest > 0) {
    tally.stretchSum += result.steps / shortest;
    tally.stretchCount++;
  }
}

/** Wilson 得分区间，默认 95%。 */
export function wilsonInterval(successes: number, trials: number, z: number = Z95): Ci {
  if (trials <= 0) return { lower: 0, upper: 1 };

  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denom;
  const half =
    (z / denom) * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));

  return {
    lower: Math.max(0, center - half),
    upper: Math.min(1, center + half),
  };
}

function fnv1aHex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 配置哈希，alpha 固定 4 位小数，避免浮点表示差异。 */
export function configHash(config: ExperimentConfig): string {
  const key = [
    config.n,
    config.alpha.toFixed(4),
    config.k,
    config.graphs,
    config.pairsPerGraph,
    config.seed,
    config.stepLimitFactor,
  ].join('|');
  return fnv1aHex(key);
}

export function finalizeTally(tally: Tally, config: ExperimentConfig): BatchStats {
  const { trials, successes } = tally;

  const meanSteps = successes > 0 ? tally.stepsSum / successes : null;

  let stepsSe: number | null = null;
  if (successes >= 2) {
    const variance =
      (tally.stepsSqSum - (tally.stepsSum * tally.stepsSum) / successes) / (successes - 1);
    stepsSe = Math.sqrt(Math.max(0, variance) / successes);
  }

  return {
    config,
    configHash: configHash(config),
    trials,
    successes,
    successRate: trials > 0 ? successes / trials : 0,
    successCi: wilsonInterval(successes, trials),
    deadEndRate: trials > 0 ? tally.deadEnds / trials : 0,
    limitRate: trials > 0 ? tally.limits / trials : 0,
    meanSteps,
    stepsSe,
    meanShortest: tally.shortestCount > 0 ? tally.shortestSum / tally.shortestCount : null,
    meanStretch: tally.stretchCount > 0 ? tally.stretchSum / tally.stretchCount : null,
    longEdgeUsage: tally.stepsSum > 0 ? tally.longHopsSum / tally.stepsSum : null,
  };
}

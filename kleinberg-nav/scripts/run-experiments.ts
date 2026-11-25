import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runBatch } from '../src/core/index.ts';
import type { ExperimentConfig } from '../src/core/index.ts';

function argList(flag: string, fallback: number[]): number[] {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1].split(',').map((s) => Number(s.trim()));
}

function argInt(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function argText(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

function cell(value: number | null): string {
  return value === null ? '' : value.toFixed(6);
}

const ns = argList('--n', [16, 32, 48, 64, 80, 96, 112, 128]);
const alphas = argList('--alpha', [0, 0.5, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 4]);
const graphs = argInt('--graphs', 50);
const pairs = argInt('--pairs', 100);
const k = argInt('--k', 1);
const seed = argInt('--seed', 42);
const includeShortest = !process.argv.includes('--no-shortest');
const outDir = argText('--out', 'results');

mkdirSync(outDir, { recursive: true });

const rows: string[] = [
  [
    'configHash',
    'n',
    'alpha',
    'k',
    'seed',
    'graphs',
    'pairsPerGraph',
    'trials',
    'successRate',
    'ciLower',
    'ciUpper',
    'meanSteps',
    'stepsSe',
    'meanShortest',
    'meanStretch',
    'longEdgeUsage',
    'deadEnds',
    'limits',
  ].join(','),
];

const started = Date.now();

for (const n of ns) {
  for (const alpha of alphas) {
    const config: ExperimentConfig = {
      n,
      alpha,
      k,
      seed,
      graphs,
      pairsPerGraph: pairs,
      stepLimitFactor: 10,
    };

    const t0 = Date.now();
    const { stats } = runBatch(config, { includeShortestPath: includeShortest });
    const elapsed = Date.now() - t0;

    writeFileSync(join(outDir, `${stats.configHash}.json`), JSON.stringify(stats, null, 2) + '\n');

    rows.push(
      [
        stats.configHash,
        n,
        alpha,
        k,
        seed,
        graphs,
        pairs,
        stats.trials,
        stats.successRate.toFixed(6),
        stats.successCi.lower.toFixed(6),
        stats.successCi.upper.toFixed(6),
        cell(stats.meanSteps),
        cell(stats.stepsSe),
        cell(stats.meanShortest),
        cell(stats.meanStretch),
        cell(stats.longEdgeUsage),
        Math.round(stats.deadEndRate * stats.trials),
        Math.round(stats.limitRate * stats.trials),
      ].join(','),
    );

    console.log(
      `n=${String(n).padStart(3)} alpha=${alpha.toFixed(2)}  ` +
        `success=${(stats.successRate * 100).toFixed(1)}%  ` +
        `steps=${cell(stats.meanSteps)}  shortest=${cell(stats.meanShortest)}  ` +
        `stretch=${cell(stats.meanStretch)}  ${elapsed}ms`,
    );
  }
}

writeFileSync(join(outDir, 'summary.csv'), rows.join('\n') + '\n');
console.log(
  `wrote ${rows.length - 1} configurations to ${outDir}/summary.csv in ` +
    `${((Date.now() - started) / 1000).toFixed(1)}s`,
);

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runMechanism } from '../src/core/mechanism.ts';
import type { MechanismConfig } from '../src/core/mechanism.ts';

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

function num(value: number, digits = 6): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '';
}

const ns = argList('--n', [64, 128, 256, 512, 1024]);
const alphas = argList('--alpha', [1, 1.5, 2, 2.5, 3]);
const graphs = argInt('--graphs', 5);
const pairs = argInt('--pairs', 200);
const k = argInt('--k', 1);
const seed = argInt('--seed', 42);
const outDir = argText('--out', 'results/mechanism');

mkdirSync(outDir, { recursive: true });

const bucketRows: string[] = [
  [
    'n',
    'alpha',
    'exp',
    'lo',
    'hi',
    'meanD',
    'states',
    'hits',
    'rate',
    'theory',
    'theoryAxis',
    'meanDrop',
  ].join(','),
];

const stageRows: string[] = [
  [
    'n',
    'alpha',
    'exp',
    'lo',
    'hi',
    'count',
    'meanStart',
    'meanSteps',
    'predicted',
    'longShare',
  ].join(','),
];

const summaryRows: string[] = [
  [
    'n',
    'alpha',
    'routes',
    'meanSteps',
    'predicted',
    'ratio',
    'predictedDrop',
    'ratioDrop',
    'longShare',
    'rateAxis',
    'rateDiag',
    'rateOther',
  ].join(','),
];

const started = Date.now();

for (const n of ns) {
  for (const alpha of alphas) {
    const config: MechanismConfig = { n, alpha, k, seed, graphs, pairsPerGraph: pairs };
    const t0 = Date.now();
    const res = runMechanism(config);

    for (const b of res.buckets) {
      bucketRows.push(
        [
          n,
          alpha,
          b.exp,
          b.lo,
          b.hi,
          num(b.meanD, 2),
          b.states,
          b.hits,
          num(b.rate),
          num(b.theory),
          num(b.theoryAxis),
          num(b.meanDrop, 3),
        ].join(','),
      );
    }

    for (const s of res.stages) {
      stageRows.push(
        [
          n,
          alpha,
          s.exp,
          s.lo,
          s.hi,
          s.count,
          num(s.meanStart, 2),
          num(s.meanSteps, 3),
          num(s.predicted, 3),
          num(s.longShare, 3),
        ].join(','),
      );
    }

    const halves = res.longHalves + res.localHalves;
    summaryRows.push(
      [
        n,
        alpha,
        res.routes,
        num(res.meanSteps, 2),
        num(res.predicted, 2),
        num(res.meanSteps > 0 ? res.predicted / res.meanSteps : Number.NaN, 3),
        num(res.predictedDrop, 2),
        num(res.meanSteps > 0 ? res.predictedDrop / res.meanSteps : Number.NaN, 3),
        num(halves > 0 ? res.longHalves / halves : Number.NaN, 3),
        num(res.azRate[0]),
        num(res.azRate[1]),
        num(res.azRate[2]),
      ].join(','),
    );

    console.log(
      `n=${String(n).padStart(4)} alpha=${alpha.toFixed(2)}  ` +
        `routes=${res.routes}  steps=${num(res.meanSteps, 2)}  ` +
        `predHalf=${num(res.predicted, 2)}  predDrop=${num(res.predictedDrop, 2)}  ` +
        `az=${num(res.azRate[0], 4)}/${num(res.azRate[1], 4)}  ` +
        `${Date.now() - t0}ms`,
    );
  }
}

writeFileSync(join(outDir, 'buckets.csv'), bucketRows.join('\n') + '\n');
writeFileSync(join(outDir, 'stages.csv'), stageRows.join('\n') + '\n');
writeFileSync(join(outDir, 'summary.csv'), summaryRows.join('\n') + '\n');
console.log(
  `wrote ${bucketRows.length - 1} bucket rows, ${stageRows.length - 1} stage rows ` +
    `and ${summaryRows.length - 1} configs to ${outDir} in ` +
    `${((Date.now() - started) / 1000).toFixed(1)}s`,
);

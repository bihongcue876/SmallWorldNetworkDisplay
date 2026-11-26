import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { torusDistance } from '../src/core/distance.ts';
import { predictStepsByDrop } from '../src/core/mechanism.ts';
import { samplePair } from '../src/core/sample.ts';

const ns = [16, 32, 48, 64, 80, 96, 112, 128, 256, 512, 1024];
const qs = [0, 0.5, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 4];
const pairs = 400;
const outDir = 'results/qstar';

mkdirSync(outDir, { recursive: true });

const rows: string[] = ['n,q,predicted'];
const started = Date.now();

for (const n of ns) {
  const ds: number[] = [];
  for (let i = 0; i < pairs; i++) {
    const { source, target } = samplePair(n, 42, i);
    ds.push(torusDistance(source, target, n));
  }

  for (const q of qs) {
    let sum = 0;
    for (const d of ds) sum += predictStepsByDrop(n, q, d);
    const mean = sum / ds.length;
    rows.push(`${n},${q},${mean.toFixed(3)}`);
    process.stdout.write(`n=${String(n).padStart(4)} q=${q.toFixed(2)} pred=${mean.toFixed(1)}  `);
  }
  process.stdout.write('\n');
}

writeFileSync(join(outDir, 'predicted.csv'), rows.join('\n') + '\n');
console.log(`wrote predicted.csv in ${((Date.now() - started) / 1000).toFixed(1)}s`);

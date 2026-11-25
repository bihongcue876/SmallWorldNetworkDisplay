import './style.css';
import { ABOUT_HTML } from './about.ts';
import {
  buildGraph,
  greedyRoute,
  samplePair,
  shortestPathLength,
} from '../core/index.ts';
import type { BatchStats, Graph, PairSpec, RouteResult } from '../core/types.ts';
import { drawScene, nodeAt } from './render.ts';

interface CasePreset {
  alpha: number;
  label: string;
}

const CASES: CasePreset[] = [
  { alpha: 0, label: 'α=0' },
  { alpha: 1, label: 'α=1' },
  { alpha: 2, label: 'α=2' },
  { alpha: 3, label: 'α=3' },
];

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const canvas = $<HTMLCanvasElement>('canvas');
const nSelect = $<HTMLSelectElement>('n-select');
const alphaRange = $<HTMLInputElement>('alpha-range');
const alphaValue = $<HTMLElement>('alpha-value');
const seedInput = $<HTMLInputElement>('seed-input');
const seedRandomBtn = $<HTMLButtonElement>('seed-random');
const speedRange = $<HTMLInputElement>('speed-range');
const speedValue = $<HTMLElement>('speed-value');
const statusEl = $<HTMLElement>('status');
const playBtn = $<HTMLButtonElement>('play');
const stepBtn = $<HTMLButtonElement>('step');
const resetBtn = $<HTMLButtonElement>('reset');
const screenshotBtn = $<HTMLButtonElement>('screenshot');
const rebuildBtn = $<HTMLButtonElement>('rebuild');
const presets = $<HTMLElement>('presets');
const demoNote = $<HTMLElement>('demo-note');

const mSteps = $<HTMLElement>('m-steps');
const mShortest = $<HTMLElement>('m-shortest');
const mStretch = $<HTMLElement>('m-stretch');
const mLong = $<HTMLElement>('m-long');
const mFailure = $<HTMLElement>('m-failure');

const tabDemo = $<HTMLButtonElement>('tab-demo');
const tabBatch = $<HTMLButtonElement>('tab-batch');
const batchPanel = $<HTMLElement>('batch-panel');
const graphsInput = $<HTMLInputElement>('graphs-input');
const pairsInput = $<HTMLInputElement>('pairs-input');
const runBatchBtn = $<HTMLButtonElement>('run-batch');
const cancelBatchBtn = $<HTMLButtonElement>('cancel-batch');
const exportBtn = $<HTMLButtonElement>('export-csv');
const progressBar = $<HTMLElement>('progress-bar');
const resultsBody = $<HTMLElement>('results-body');

const about = $<HTMLElement>('about');
const aboutBody = $<HTMLElement>('about-body');
const aboutBtn = $<HTMLButtonElement>('about-btn');
const aboutClose = $<HTMLButtonElement>('about-close');

let graph: Graph | null = null;
let pair: PairSpec = { source: 0, target: 0 };
let route: RouteResult | null = null;
let shortest = 0;
let cursor = 0;
let playing = false;
let timer = 0;
let rebuildTimer = 0;
let batchId = 0;

/** 批量结果按 configHash 累积，同哈希替换，保证可对比多个配置。 */
const batchRows = new Map<string, BatchStats>();

function currentSeed(): number {
  const value = Number(seedInput.value);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 42;
}

function currentAlpha(): number {
  return Number(alphaRange.value);
}

function draw(): void {
  if (!graph || !route) return;
  drawScene(canvas, {
    graph,
    pair,
    path: route.path,
    cursor,
    failed: !route.success,
  });
}

function updateMetrics(): void {
  if (!route) return;
  mSteps.textContent = String(route.steps);
  mShortest.textContent = shortest >= 0 ? String(shortest) : '—';
  mStretch.textContent =
    route.success && shortest > 0 ? (route.steps / shortest).toFixed(2) : '—';
  mLong.textContent = route.steps > 0 ? (route.longHops / route.steps).toFixed(2) : '—';
  mFailure.textContent =
    route.failure === 'none' ? '到达目标' : route.failure === 'dead-end' ? '死胡同' : '超限';
  mFailure.style.color = route.success ? '#16a34a' : '#dc2626';
}

function updateStatus(): void {
  if (!route) {
    statusEl.textContent = '准备中';
    return;
  }
  if (route.success) {
    statusEl.textContent = `第 ${cursor} / ${route.steps} 步`;
  } else {
    statusEl.textContent = route.failure === 'dead-end' ? `第 ${cursor} 步卡住` : '超过步数上限';
  }
}

function updatePlayButton(): void {
  playBtn.textContent = playing ? '暂停' : '播放';
}

function stopPlaying(): void {
  playing = false;
  window.clearTimeout(timer);
  timer = 0;
  updatePlayButton();
}

function tick(): void {
  if (!playing || !route) return;
  if (cursor >= route.path.length - 1) {
    stopPlaying();
    statusEl.textContent = route.success ? `完成：${route.steps} 步` : '未到达';
    return;
  }
  cursor++;
  draw();
  updateStatus();
  timer = window.setTimeout(tick, 1000 / Number(speedRange.value));
}

function reroute(): void {
  if (!graph) return;
  stopPlaying();
  route = greedyRoute(graph, pair.source, pair.target, { collectPath: true });
  shortest = shortestPathLength(graph, pair.source, pair.target);
  cursor = 0;
  updateMetrics();
  updateStatus();
  draw();
}

function rebuild(nextPair?: PairSpec): void {
  const n = Number(nSelect.value);
  const alpha = currentAlpha();
  graph = buildGraph({ n, alpha, k: 1, seed: currentSeed() });
  pair = nextPair ?? samplePair(n, currentSeed(), 0);
  reroute();
}

function markActiveCase(alpha: number | null): void {
  for (const button of presets.querySelectorAll('button')) {
    button.classList.toggle('active', Number(button.dataset.alpha) === alpha);
  }
}

function applyCase(alpha: number): void {
  alphaRange.value = String(alpha);
  alphaValue.textContent = alpha.toFixed(2);
  demoNote.hidden = false;
  rebuild(samplePair(Number(nSelect.value), currentSeed(), 0));
  markActiveCase(alpha);
}

function buildPresets(): void {
  for (const preset of CASES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = preset.label;
    button.dataset.alpha = String(preset.alpha);
    button.addEventListener('click', () => applyCase(preset.alpha));
    presets.append(button);
  }
}

/* ---------- 批量实验 ---------- */

/** 每次取消后销毁并重建 Worker；正在运行的批量随 terminate 立即停止。 */
function spawnWorker(): Worker {
  const worker = new Worker(new URL('../worker/experiment.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = onWorkerMessage;
  return worker;
}

let worker = spawnWorker();

type WorkerMessage =
  | { kind: 'progress'; id: number; done: number; total: number }
  | { kind: 'done'; id: number; result: { stats: BatchStats; cancelled: boolean } }
  | { kind: 'error'; id: number; message: string };

function onWorkerMessage(event: MessageEvent<WorkerMessage>): void {
  const data = event.data;
  if (data.id !== batchId) return;

  if (data.kind === 'progress') {
    progressBar.style.width = `${Math.round((data.done / data.total) * 100)}%`;
    return;
  }

  runBatchBtn.disabled = false;
  cancelBatchBtn.disabled = true;

  if (data.kind === 'error') {
    statusEl.textContent = `批量出错：${data.message}`;
    return;
  }

  upsertBatchRow(data.result.stats);
  exportBtn.disabled = batchRows.size === 0;
  progressBar.style.width = '100%';
  statusEl.textContent = data.result.cancelled ? '批量已取消' : '批量完成';
}

function upsertBatchRow(stats: BatchStats): void {
  let row = resultsBody.querySelector<HTMLTableRowElement>(`tr[data-hash="${stats.configHash}"]`);
  if (!row) {
    row = document.createElement('tr');
    row.dataset.hash = stats.configHash;
    resultsBody.append(row);
  }
  row.textContent = '';
  const cells = [
    String(stats.config.n),
    stats.config.alpha.toFixed(2),
    String(stats.trials),
    `${(stats.successRate * 100).toFixed(1)}%`,
    stats.meanSteps === null ? '—' : stats.meanSteps.toFixed(2),
    stats.meanShortest === null ? '—' : stats.meanShortest.toFixed(2),
    stats.meanStretch === null ? '—' : stats.meanStretch.toFixed(2),
    stats.longEdgeUsage === null ? '—' : stats.longEdgeUsage.toFixed(2),
  ];
  for (const text of cells) {
    const cell = document.createElement('td');
    cell.textContent = text;
    row.append(cell);
  }
  batchRows.set(stats.configHash, stats);
}

function startBatch(): void {
  if (!graph) return;
  const config = {
    n: Number(nSelect.value),
    alpha: currentAlpha(),
    k: 1,
    seed: currentSeed(),
    graphs: Math.max(1, Math.min(50, Number(graphsInput.value) || 5)),
    pairsPerGraph: Math.max(1, Math.min(200, Number(pairsInput.value) || 20)),
    stepLimitFactor: 10,
  };
  batchId++;
  progressBar.style.width = '0%';
  runBatchBtn.disabled = true;
  cancelBatchBtn.disabled = false;
  worker.postMessage({ kind: 'run', id: batchId, config });
}

function exportCsv(): void {
  if (batchRows.size === 0) return;
  const header = [
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
    'deadEndRate',
    'limitRate',
  ];
  const lines = [header.join(',')];
  for (const row of batchRows.values()) {
    lines.push(
      [
        row.configHash,
        row.config.n,
        row.config.alpha.toFixed(2),
        row.config.k,
        row.config.seed,
        row.config.graphs,
        row.config.pairsPerGraph,
        row.trials,
        row.successRate.toFixed(6),
        row.successCi.lower.toFixed(6),
        row.successCi.upper.toFixed(6),
        row.meanSteps?.toFixed(6) ?? '',
        row.stepsSe?.toFixed(6) ?? '',
        row.meanShortest?.toFixed(6) ?? '',
        row.meanStretch?.toFixed(6) ?? '',
        row.longEdgeUsage?.toFixed(6) ?? '',
        row.deadEndRate.toFixed(6),
        row.limitRate.toFixed(6),
      ].join(','),
    );
  }
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kleinberg-batch.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------- 事件绑定 ---------- */

tabDemo.addEventListener('click', () => {
  tabDemo.classList.add('active');
  tabBatch.classList.remove('active');
  batchPanel.hidden = true;
  document.body.classList.remove('in-batch');
  draw();
});

tabBatch.addEventListener('click', () => {
  tabBatch.classList.add('active');
  tabDemo.classList.remove('active');
  batchPanel.hidden = false;
  document.body.classList.add('in-batch');
});

playBtn.addEventListener('click', () => {
  if (!route) return;
  if (playing) {
    stopPlaying();
    return;
  }
  if (cursor >= route.path.length - 1) cursor = 0;
  playing = true;
  updatePlayButton();
  tick();
});

stepBtn.addEventListener('click', () => {
  if (!route) return;
  stopPlaying();
  if (cursor < route.path.length - 1) {
    cursor++;
    draw();
    updateStatus();
  }
});

resetBtn.addEventListener('click', () => {
  stopPlaying();
  cursor = 0;
  draw();
  updateStatus();
});

screenshotBtn.addEventListener('click', () => {
  canvas.toBlob((blob) => {
    if (!blob || !graph) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kleinberg-n${graph.n}-a${currentAlpha()}-s${currentSeed()}.png`;
    link.click();
    URL.revokeObjectURL(url);
  });
});

rebuildBtn.addEventListener('click', () => {
  demoNote.hidden = true;
  markActiveCase(null);
  rebuild();
});

seedRandomBtn.addEventListener('click', () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  seedInput.value = String(buf[0] % 1000000);
  demoNote.hidden = true;
  markActiveCase(null);
  rebuild();
});

alphaRange.addEventListener('input', () => {
  alphaValue.textContent = currentAlpha().toFixed(2);
  markActiveCase(null);
  demoNote.hidden = true;
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => rebuild(), 200);
});

speedRange.addEventListener('input', () => {
  speedValue.textContent = speedRange.value;
});

nSelect.addEventListener('change', () => {
  rebuild();
});

seedInput.addEventListener('change', () => {
  rebuild();
});

canvas.addEventListener('click', (event) => {
  if (!graph || !route) return;
  const id = nodeAt(canvas, graph.n, event.clientX, event.clientY);
  if (id === null) return;
  if (event.shiftKey) {
    if (id === pair.source) return;
    pair = { source: pair.source, target: id };
  } else {
    if (id === pair.target) return;
    pair = { source: id, target: pair.target };
  }
  demoNote.hidden = true;
  markActiveCase(null);
  reroute();
});

runBatchBtn.addEventListener('click', startBatch);

cancelBatchBtn.addEventListener('click', () => {
  batchId++;
  worker.terminate();
  worker = spawnWorker();
  runBatchBtn.disabled = false;
  cancelBatchBtn.disabled = true;
  progressBar.style.width = '0%';
  statusEl.textContent = '批量已取消';
});

exportBtn.addEventListener('click', exportCsv);

aboutBtn.addEventListener('click', () => {
  about.hidden = false;
});

aboutClose.addEventListener('click', () => {
  about.hidden = true;
  localStorage.setItem('kleinberg-about-seen', '1');
});

about.addEventListener('click', (event) => {
  if (event.target === about) about.hidden = true;
});

window.addEventListener('resize', () => draw());

aboutBody.innerHTML = ABOUT_HTML;

if (localStorage.getItem('kleinberg-about-seen') !== '1') {
  about.hidden = false;
}

buildPresets();
speedValue.textContent = speedRange.value;
rebuild();

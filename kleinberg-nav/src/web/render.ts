import { coordsOf, torusDistance } from '../core/distance.ts';
import type { Graph, PairSpec } from '../core/types.ts';

const SHORT_EDGE = { h: 214, s: 85, l: 55 };
const LONG_EDGE = { h: 4, s: 80, l: 55 };

export interface Scene {
  graph: Graph;
  pair: PairSpec;
  path: Int32Array;
  cursor: number;
  failed: boolean;
}

interface Frame {
  pad: number;
  cell: number;
  size: number;
}

function frameFor(width: number, height: number, n: number): Frame {
  const size = Math.min(width, height) - 28;
  const cell = size / n;
  return {
    pad: (width - size) / 2,
    cell,
    size,
  };
}

function px(frame: Frame, x: number): number {
  return frame.pad + (x + 0.5) * frame.cell;
}

function py(frame: Frame, y: number): number {
  return frame.pad + (y + 0.5) * frame.cell;
}

function edgeColor(distance: number, maxD: number): string {
  const t = Math.min(1, distance / Math.max(1, maxD));
  const h = SHORT_EDGE.h + (LONG_EDGE.h - SHORT_EDGE.h) * t;
  const s = SHORT_EDGE.s + (LONG_EDGE.s - SHORT_EDGE.s) * t;
  const l = SHORT_EDGE.l + (LONG_EDGE.l - SHORT_EDGE.l) * t;
  return `hsl(${h} ${s}% ${l}%)`;
}

export function drawScene(canvas: HTMLCanvasElement, scene: Scene): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 10 || height < 10) return;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const { graph, pair, path, cursor } = scene;
  const n = graph.n;
  const frame = frameFor(width, height, n);
  const maxD = 2 * (n >> 1);
  const dense = n <= 64;

  // 网格线
  ctx.strokeStyle = '#eef2f7';
  ctx.lineWidth = 1;
  const step = dense ? 1 : 8;
  ctx.beginPath();
  for (let i = 0; i <= n; i += step) {
    const p = frame.pad + i * frame.cell;
    ctx.moveTo(p, frame.pad);
    ctx.lineTo(p, frame.pad + frame.size);
    ctx.moveTo(frame.pad, p);
    ctx.lineTo(frame.pad + frame.size, p);
  }
  ctx.stroke();

  // 本地边
  if (dense) {
    ctx.strokeStyle = '#dbe3ec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let id = 0; id < graph.N; id++) {
      const { x, y } = coordsOf(id, n);
      const x0 = px(frame, x);
      const y0 = py(frame, y);
      if (x + 1 < n) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(px(frame, x + 1), y0);
      }
      if (y + 1 < n) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, py(frame, y + 1));
      }
    }
    ctx.stroke();
  }

  // 长程边
  const stride = dense ? 1 : Math.max(1, Math.round(graph.N / 3000));
  ctx.globalAlpha = dense ? 0.28 : 0.16;
  ctx.lineWidth = dense ? 0.7 : 0.6;
  for (let id = 0; id < graph.N; id += stride) {
    const target = graph.long[id * graph.k];
    if (target === id) continue;
    const { x, y } = coordsOf(id, n);
    const t = coordsOf(target, n);
    ctx.strokeStyle = edgeColor(torusDistance(id, target, n), maxD);
    ctx.beginPath();
    ctx.moveTo(px(frame, x), py(frame, y));
    ctx.lineTo(px(frame, t.x), py(frame, t.y));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 目标邻域
  const target = coordsOf(pair.target, n);
  ctx.strokeStyle = '#bfdbfe';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(px(frame, target.x), py(frame, target.y), Math.max(6, frame.cell * 1.6), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 已走路径
  const shown = Math.min(cursor, path.length - 1);
  if (shown > 0) {
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = Math.max(2, Math.min(4, frame.cell * 0.28));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= shown; i++) {
      const node = coordsOf(path[i], n);
      if (i === 0) ctx.moveTo(px(frame, node.x), py(frame, node.y));
      else ctx.lineTo(px(frame, node.x), py(frame, node.y));
    }
    ctx.stroke();

    // 未走部分淡显
    if (shown < path.length - 1) {
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.18)';
      ctx.lineWidth = Math.max(1.5, Math.min(3, frame.cell * 0.2));
      ctx.beginPath();
      for (let i = shown; i < path.length; i++) {
        const node = coordsOf(path[i], n);
        if (i === shown) ctx.moveTo(px(frame, node.x), py(frame, node.y));
        else ctx.lineTo(px(frame, node.x), py(frame, node.y));
      }
      ctx.stroke();
    }
  }

  // 节点
  const radius = Math.max(2, Math.min(5, frame.cell * 0.32));
  if (dense) {
    for (let id = 0; id < graph.N; id++) {
      const { x, y } = coordsOf(id, n);
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(px(frame, x), py(frame, y), radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 路径上的节点
  for (let i = 0; i <= shown; i++) {
    const node = coordsOf(path[i], n);
    ctx.fillStyle = i === shown ? '#ea580c' : '#fdba74';
    ctx.beginPath();
    ctx.arc(px(frame, node.x), py(frame, node.y), radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 起点与终点
  const source = coordsOf(pair.source, n);
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.arc(px(frame, source.x), py(frame, source.y), radius * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(px(frame, target.x), py(frame, target.y), radius * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 失败位置
  if (scene.failed && path.length > 0) {
    const last = coordsOf(path[path.length - 1], n);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(frame, last.x), py(frame, last.y), radius * 2.4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function nodeAt(
  canvas: HTMLCanvasElement,
  n: number,
  clientX: number,
  clientY: number,
): number | null {
  const rect = canvas.getBoundingClientRect();
  const frame = frameFor(rect.width, rect.height, n);
  const x = Math.floor((clientX - rect.left - frame.pad) / frame.cell);
  const y = Math.floor((clientY - rect.top - frame.pad) / frame.cell);
  if (x < 0 || y < 0 || x >= n || y >= n) return null;
  return y * n + x;
}

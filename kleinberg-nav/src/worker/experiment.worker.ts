import { runBatch } from '../core/index.ts';
import type { ExperimentConfig } from '../core/types.ts';

export interface WorkerRun {
  kind: 'run';
  id: number;
  config: ExperimentConfig;
}

export type WorkerRequest = WorkerRun;

export interface WorkerDone {
  kind: 'done';
  id: number;
  result: ReturnType<typeof runBatch>;
}

export type WorkerResponse =
  | { kind: 'progress'; id: number; done: number; total: number }
  | WorkerDone
  | { kind: 'error'; id: number; message: string };

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (data.kind !== 'run') return;

  try {
    const result = runBatch(data.config, {
      onProgress: (done, total) => {
        ctx.postMessage({ kind: 'progress', id: data.id, done, total });
      },
    });
    ctx.postMessage({ kind: 'done', id: data.id, result });
  } catch (error) {
    ctx.postMessage({
      kind: 'error',
      id: data.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

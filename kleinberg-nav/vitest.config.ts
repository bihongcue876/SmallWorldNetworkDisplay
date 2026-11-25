import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 沙箱环境禁止 fork 子进程，改用 worker_threads。
    pool: 'threads',
    include: ['tests/**/*.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    // Each file gets a fresh module graph, so the cached IndexedDB connection never leaks between files.
    isolate: true,
  },
});

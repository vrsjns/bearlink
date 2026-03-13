import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['app.js', 'controllers/**/*.js', 'services/**/*.js', 'routes/**/*.js'],
      exclude: ['**/node_modules/**', '**/coverage/**', '**/test/**'],
    },
    mockReset: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared'),
    },
  },
});

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
      include: ['index.js', 'src/**/*.{js,ts}'],
      exclude: ['**/node_modules/**', '**/coverage/**'],
    },
    mockReset: true,
    restoreMocks: true,
    server: {
      deps: {
        // Inline these modules so vitest can transform and mock them
        inline: [/shared/, /express-rate-limit/],
      },
    },
  },
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared'),
    },
  },
});

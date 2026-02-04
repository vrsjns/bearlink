import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['utils/**/*.js', 'middlewares/**/*.js', 'events/**/*.js'],
      exclude: ['**/node_modules/**', '**/coverage/**', '**/*.test.js'],
    },
  },
});

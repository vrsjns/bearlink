import { defineConfig } from 'vitest/config';

// Shared coverage configuration for workspace-level runs
// Individual project configs handle their own test setup, but coverage
// exclude patterns need to be defined here to work in merged reports
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        // Test infrastructure
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
        '**/setup.{js,ts}',
        '**/mocks/**',

        // Config files
        '**/vitest.config.{js,ts}',
        '**/vitest.workspace.{js,ts}',
        '**/*.config.{js,ts,mjs}',

        // Build artifacts and dependencies
        '**/node_modules/**',
        '**/dist/**',
        '**/prisma/**',
        '**/.next/**',
      ],
    },
  },
});

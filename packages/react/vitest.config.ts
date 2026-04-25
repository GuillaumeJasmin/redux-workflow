import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
  },
});

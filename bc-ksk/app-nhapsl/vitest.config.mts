import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: ['.env.local', '.env'], quiet: true });

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Test luôn chạy trên DB test, không bao giờ trên DB dev.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
  },
});

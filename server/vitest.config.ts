import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

// Los tests de la API usan una base aparte (tiusdei_test), definida en .env.test.
const env = loadEnv({ path: '.env.test' }).parsed ?? {};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env,
    setupFiles: ['test/setup.ts'],
    fileParallelism: false,
  },
});

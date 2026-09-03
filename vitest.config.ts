import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['tests/**/*.test.ts'],
    /* audit #9: studio suites set process-global MONGODB_DB_NAME at module
     * scope and wipe collections in afterAll — parallel files in one pool
     * raced each other's env (order-flaky runs). Sequential files give every
     * suite a deterministic, isolated environment; "passes twice" is real. */
    fileParallelism: false,
  },
});

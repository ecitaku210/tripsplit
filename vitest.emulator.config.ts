import { defineConfig } from 'vitest/config'

/**
 * Tests that need Google's Firestore emulator running. Kept out of the main
 * `npm test` so that suite stays fast and needs nothing but Node.
 * Run with `npm run test:emulator`, which starts and stops the emulator.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/emulator/**/*.test.ts'],
    // The emulator is one shared database; files must not race each other.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})

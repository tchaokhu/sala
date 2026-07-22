import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    // Node by default — the pure logic under lib/ has no DOM. Component tests
    // opt into jsdom per file with a `// @vitest-environment jsdom` comment.
    environment: 'node',
    include: ['lib/**/*.test.ts', 'tests/**/*.test.ts'],
  },
  resolve: {
    // Must match the `paths` entry in tsconfig.json or imports resolve in the
    // type checker and fail at runtime.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
})

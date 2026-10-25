import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: 'test-results.xml',
    passWithNoTests: true,
  },
})

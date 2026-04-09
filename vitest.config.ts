import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts'],
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@electron': path.resolve(__dirname, 'electron'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
})

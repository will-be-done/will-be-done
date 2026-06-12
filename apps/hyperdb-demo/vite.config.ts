import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const workspaceNodeModules = fileURLToPath(new URL('../../node_modules/', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^react$/,
        replacement: `${workspaceNodeModules}react`,
      },
      {
        find: /^react\/(.*)$/,
        replacement: `${workspaceNodeModules}react/$1`,
      },
      {
        find: /^react-dom$/,
        replacement: `${workspaceNodeModules}react-dom`,
      },
      {
        find: /^react-dom\/(.*)$/,
        replacement: `${workspaceNodeModules}react-dom/$1`,
      },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    sourcemapIgnoreList: false,
  },
})

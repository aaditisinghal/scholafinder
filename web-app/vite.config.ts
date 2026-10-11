import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Disable PostCSS config file search — it was climbing up to an unrelated
  // postcss.config.mjs in a parent directory outside this project.
  css: { postcss: {} },
  server: {
    proxy: {
      // local `npm run dev` hits the already-deployed API by default so you don't need a
      // second local server running just to test the UI. Override with API_PROXY_TARGET=
      // http://localhost:3000 to point at a locally-running `npm run dev` boss process instead
      // (needed for the orchestration view's SSE stream, which isn't viable on Vercel's
      // serverless functions — those don't hold a persistent connection or process-local event bus).
      "/api": {
        target: process.env.API_PROXY_TARGET || "https://scholafinder.vercel.app",
        changeOrigin: true,
        ws: true,
      },
    },
  },
})

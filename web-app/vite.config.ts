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
      // local `npm run dev` hits the already-deployed API so you don't need a second
      // local server running just to test the UI.
      "/api": {
        target: "https://scholafinder.vercel.app",
        changeOrigin: true,
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/', // absolute asset paths — './' breaks nested routes on Vercel (assets resolve relative to /loans, /settings, ...)
  server: {
    // Serve on every interface (dual-stack), so the app loads whether
    // the browser resolves localhost to ::1 or 127.0.0.1.
    host: true,
    // Send /api/* to the local Express server (server/index.js) in dev.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})

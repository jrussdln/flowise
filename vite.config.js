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
    // Send /api/* to the local Express server (server/index.js) in dev.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})

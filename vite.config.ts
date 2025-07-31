import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    port: 10000,
    host: true,
    allowedHosts: [
      'cazar-main.onrender.com',
      'localhost',
      '127.0.0.1'
    ]
  },
  server: {
    host: true,
    port: 5173
  }
})

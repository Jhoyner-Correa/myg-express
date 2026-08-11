import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Las pantallas se cargan por ruta. Logistica incluye ApexCharts y queda
    // deliberadamente debajo de este presupuesto por chunk asincrono.
    chunkSizeWarningLimit: 850,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      }
    }
  }
})

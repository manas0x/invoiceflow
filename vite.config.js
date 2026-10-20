import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787'
    },
    watch: {
      usePolling: true
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          vendor: ['react', 'react-dom', 'framer-motion', 'lucide-react', 'sweetalert2'],
          utils: ['xlsx', 'jspdf', 'jspdf-autotable']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  optimizeDeps: {
    entries: ['index.html']
  }
})

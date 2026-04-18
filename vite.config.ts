import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-utils': ['lucide-react', 'clsx', 'tailwind-merge'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-slot'],
          'vendor-visx': ['@visx/curve', '@visx/event', '@visx/grid', '@visx/responsive', '@visx/scale', '@visx/shape'],
          'vendor-yjs': ['yjs', 'y-websocket', 'y-webrtc', 'y-indexeddb'],
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api-v1': {
        target: 'https://instagram-scraper-20251.p.rapidapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-v1/, ''),
        secure: true,
      },
    },
  },
})

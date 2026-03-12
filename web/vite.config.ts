import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Local src alias
      '@': path.resolve(__dirname, './src'),
      // Workspace package aliases
      '@exoduze/core': path.resolve(__dirname, '../../packages/core/src'),
      '@exoduze/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@exoduze/web3': path.resolve(__dirname, '../../packages/web3/src'),
    },
  },
  server: {
    host: true, // Listen on all addresses, needed for tunneling
    port: 5173,
    proxy: {
      '/api/polymarket': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/polymarket/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable sourcemaps for production to reduce build size/time
    chunkSizeWarningLimit: 1200, // Increase warning limit slightly for Three.js
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
          'mui-vendor': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-label', '@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge', 'lucide-react', 'motion', 'sonner', 'vaul'],
          'chart-vendor': ['recharts'],
          'web3-vendor': ['viem'],
          'data-vendor': ['@tanstack/react-query', 'zod', 'socket.io-client', 'date-fns', 'html5-qrcode', 'qrcode.react'],
        },
      },
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION') {
          return;
        }
        warn(warning);
      },
    },
  },
})

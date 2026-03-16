/* eslint-env node */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    define: {
      '__APP_VERSION__': JSON.stringify(Date.now().toString()),
      '__APP_BUILD_ID__': JSON.stringify(env.VERCEL_GIT_COMMIT_SHA || 'local-dev'),
    },
    plugins: [
      react(),
      // Force full page reload (not HMR) when Firebase modules change.
      // HMR on Firebase files causes Firestore WebSocket assertion failures
      // because listeners get torn down/recreated faster than the SDK can handle.
      {
        name: 'firebase-hmr-guard',
        handleHotUpdate({ file, server }) {
          if (file.includes('firebase') || file.includes('firebaseConfig')) {
            server.ws.send({ type: 'full-reload' });
            return [];
          }
        }
      },
      VitePWA({
        workbox: { maximumFileSizeToCacheInBytes: 5000000 },
        injectRegister: null, // Disable auto-registration to prevent conflict with Firebase SW
        registerType: 'autoUpdate',
        includeAssets: ['logo.svg'],
        manifest: {
          name: 'LAMS - Lab Assignment Management System',
          short_name: 'LAMS',
          description: 'Efficient Lab Assignment Management System',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          gcm_sender_id: env.VITE_GCM_SENDER_ID || "482941778795", // Dynamic with Fallback
          orientation: 'portrait',
          start_url: '/',
          icons: [
            {
              src: 'logo.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            },
            {
              src: 'logo.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    base: '/',
    server: {
      proxy: {
        '/api': {
          target: 'https://lams.vercel.app',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      chunkSizeWarningLimit: 3000, // Increase limit to 3MB to finally silence warnings
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/messaging'],
            'pdf-vendor': ['jspdf', 'jspdf-autotable'],
            'xlsx-vendor': ['exceljs'], // Isolate heavy Excel library
            'file-vendor': ['file-saver'],
            'ui-vendor': ['lucide-react', 'react-hot-toast', 'react-confetti', 'recharts']
          }
        }
      }
    }
  }
})

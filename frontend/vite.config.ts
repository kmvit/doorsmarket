import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Адрес Django в разработке: порт 8000 бывает занят другим проектом —
  // тогда поднимаем backend на свободном порту и указываем его в frontend/.env.local
  // (VITE_PROXY_TARGET=http://localhost:8010)
  const env = loadEnv(mode, '.', '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000'
  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192x192.png', 'icon-512x512.png'],
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        swSrc: 'src/sw.ts',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Исключаем файлы, которые не должны кэшироваться
        globIgnores: ['**/node_modules/**/*'],
        // Добавляем ревизию для лучшего кэш-контроля
        dontCacheBustURLsMatching: /\.\w{8}\./,
      },
      manifest: {
        name: 'Marketing Doors',
        short_name: 'Marketing Doors',
        description: 'Система управления рекламациями Marketing Doors',
        theme_color: '#0ea5e9',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        id: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      },
    })
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true
      },
      // Загруженные файлы (планы открывания, фото) отдаёт Django
      '/media': {
        target: proxyTarget,
        changeOrigin: true
      },
      // Короткие ссылки замера /z/{код} обслуживает Django (как /api)
      '/z': {
        target: proxyTarget,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Добавляем хеши к именам файлов для лучшего кэширования
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
}
})

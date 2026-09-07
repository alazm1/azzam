import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'جدول المعلم',
        short_name: 'جدول المعلم',
        description: 'صوّر جدولك، وسنحوّله إلى جدول ذكي مرتب خلال لحظات.',
        lang: 'ar',
        dir: 'rtl',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f8f7',
        theme_color: '#0f7a4f',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // The OCR core and language data are large; cache them lazily at runtime.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['tesseract/**', 'tessdata/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/tesseract/') || url.pathname.includes('/tessdata/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-assets',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      // نسختان: المعلم (الجذر) والطالب الجامعي (/student/)
      input: { main: resolve(__dirname, 'index.html'), student: resolve(__dirname, 'student/index.html') },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 240_000,
    hookTimeout: 240_000,
  },
});

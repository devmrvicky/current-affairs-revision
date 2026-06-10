import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',       // prompt user before updating SW
      includeAssets: ['favicon.svg', 'icons/**/*'],
      manifest: {
        name: 'CurrentAffairsPro',
        short_name: 'CAP',
        description: 'Daily current affairs revision and quiz platform for competitive exam aspirants',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a12',
        theme_color: '#6366f1',
        orientation: 'portrait-primary',
        categories: ['education', 'productivity'],
        icons: [
          {
            src: '/icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          { name: "Today's Quiz", url: '/', description: "Start today's current affairs quiz" },
          { name: 'Revision Calendar', url: '/revision-calendar', description: 'Browse past quizzes' },
          { name: 'Wrong Questions', url: '/wrong-questions', description: 'Practise wrong questions' },
        ],
      },
      workbox: {
        // Cache strategies
        runtimeCaching: [
          // App shell — cache first
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // JSON quiz files — cache first (they never change)
          {
            urlPattern: /\/current-affairs\/.*\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'quiz-json-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Chapter JSON files
          {
            urlPattern: /\/chapters\/.*\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'chapter-json-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Pre-cache all built assets
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        skipWaiting: false,   // don't skip waiting — let user choose when to update
        clientsClaim: false,
      },
      devOptions: {
        enabled: false,       // disable SW in dev to avoid stale cache issues
      },
    }),
  ],
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/**/*'],
      manifest: {
        // PWA Builder requires these exact fields
        id: '/ca-revision/',
        name: 'Current Affairs Revision',
        short_name: 'CA Revision',
        description: 'Daily current affairs revision and quiz platform for competitive exam aspirants. Practice chapter-wise questions, track wrong answers, and build revision streaks.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0a0a12',
        theme_color: '#6366f1',
        orientation: 'portrait-primary',
        categories: ['education', 'productivity'],
        lang: 'en',
        dir: 'ltr',
        // All required icon sizes as PNG for Android/PWA Builder compatibility
        icons: [
          { src: '/icons/icon-72x72.png',   sizes: '72x72',   type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-96x96.png',   sizes: '96x96',   type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192x192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: "Today's Quiz",       short_name: 'Today',    url: '/',                     icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }] },
          { name: 'Revision Calendar',  short_name: 'Calendar', url: '/revision-calendar',    icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }] },
          { name: 'Wrong Questions',    short_name: 'Practice', url: '/wrong-questions',       icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }] },
          { name: 'Chapter Wise',       short_name: 'Chapters', url: '/chapter-wise-current-affairs', icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96' }] },
        ],
        screenshots: [
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Home Dashboard',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        // Navigation fallback for SPA routing
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
        runtimeCaching: [
          // Google Fonts
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
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // App JS/CSS chunks (stale-while-revalidate for fast load)
          {
            urlPattern: /\.(?:js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-assets-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Images and icons
          {
            urlPattern: /\.(?:png|svg|ico|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    // Code splitting for performance
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-core';
          if (id.includes('node_modules/react-router-dom')) return 'router';
          if (id.includes('node_modules/recharts')) return 'charts';
          if (id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          if (id.includes('node_modules/zustand')) return 'state';
          if (id.includes('node_modules/idb')) return 'idb';
        },
      },
    },
  },
});

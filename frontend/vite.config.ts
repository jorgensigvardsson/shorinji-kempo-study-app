import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 700,
    // One stylesheet for the whole app rather than one per lazy chunk. Nearly all of
    // it is the Bootstrap theme, which the first paint needs anyway, and keeping it
    // in a single file means a lazily-loaded page can never appear unstyled while
    // its own stylesheet is still on the way.
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // React and the UI libraries are the largest thing in the bundle and the
        // thing that changes least, so they go in their own chunk: an app release
        // then only invalidates the app's own code, and the browser can fetch both
        // halves in parallel on a first visit.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Workbox is already emitted separately by the PWA plugin.
          if (id.includes('workbox-window')) return;
          // @xyflow is the single heaviest dependency in the app and is reached
          // only from the organization page's tree view, itself a lazy import
          // (see AdminOrganization.tsx). Forcing it into vendor would undo that:
          // vendor loads for everyone the moment the app goes idle, which is
          // precisely what an admin who never opens the tree view should not pay
          // for. Its own dependencies (checked with `npm ls`: nothing else in
          // this app uses them) need excluding by name individually, since a
          // substring match on the importer's id would only catch @xyflow itself.
          if (['@xyflow', 'd3-', 'classcat', 'zustand'].some(pkg => id.includes(`/node_modules/${pkg}`))) return;
          return 'vendor';
        },
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['import', 'if-function', 'global-builtin', 'color-functions'],
      },
    },
  },
  plugins: [
    ...(process.env.VITE_HTTPS !== 'false' ? [mkcert()] : []),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})

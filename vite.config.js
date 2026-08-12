import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Los Workers / Assets / Widgets / ThirdParty de CesiumJS se sirven desde
// public/cesiumStatic, donde los deja scripts/copy-cesium-assets.mjs (ganchos
// predev y prebuild). index.html apunta ahi con window.CESIUM_BASE_URL.

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    // Celestrak no envia cabeceras CORS permisivas de forma fiable, asi que en
    // desarrollo pasamos por el proxy de Vite. En produccion hay que replicar
    // este proxy en el servidor (ver README).
    proxy: {
      '/celestrak': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/celestrak/, ''),
      },
    },
  },
  // satellite.js v7 incluye un runtime WebAssembly con top-level await. El
  // formato 'iife' por defecto de los workers no lo admite, y nuestro worker de
  // propagacion ya se instancia con { type: 'module' }, asi que ES es el formato
  // coherente.
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4000,
  },
})

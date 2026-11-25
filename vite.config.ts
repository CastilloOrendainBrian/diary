import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

// The SPA lives in src/client; the build output goes to dist/client,
// where the production server serves it as static files.
export default defineConfig({
  root: fileURLToPath(new URL("./src/client", import.meta.url)),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The new service worker activates on the next load; no prompt is shown to the user.
      registerType: "autoUpdate",
      // Service worker only in production builds, so development never serves stale code.
      devOptions: { enabled: false },
      manifest: {
        name: "Diario",
        short_name: "Diario",
        description: "Notas personales organizadas por fecha y hora",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#fafaf9",
        theme_color: "#292524",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the application shell only (never API responses or user data).
        globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
        // Client-side routes (/day/2026-11-24) fall back to the cached shell when offline.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    outDir: fileURLToPath(new URL("./dist/client", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the Fastify dev server during development.
      "/api": apiTarget,
    },
  },
});

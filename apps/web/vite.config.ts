import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Source maps only get built when there's a token to upload them with. The
// plugin reads SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT from env, and
// deletes the maps after upload so they never ship to the public site.
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN;

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      disable: !uploadSourceMaps,
      telemetry: false,
      sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] }
    })
  ],
  build: {
    sourcemap: uploadSourceMaps ? "hidden" : false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");

          if (!normalized.includes("/node_modules/")) {
            return undefined;
          }

          if (
            normalized.includes("/react/") ||
            normalized.includes("/react-dom/") ||
            normalized.includes("/react-router/") ||
            normalized.includes("/react-router-dom/")
          ) {
            return "vendor-react";
          }

          if (
            normalized.includes("/@rocicorp/") ||
            normalized.includes("/@badrap/valita/") ||
            normalized.includes("/zod/")
          ) {
            return "vendor-zero";
          }

          if (normalized.includes("/react-icons/")) {
            return "vendor-icons";
          }

          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    host: !!process.env.VITE_EXPOSE_HOST,
    // Production serves /share/<game> from functions/_middleware.js; this is
    // the same proxy for dev.
    proxy: {
      "^/share/(shikaku|pips|zip)": {
        target: loadEnv(mode, process.cwd(), "").VITE_API_URL || "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/share\/(\w+)/, "/api/$1/puzzle"),
        headers: { "x-share-origin": "http://localhost:5173" }
      }
    }
  }
}));

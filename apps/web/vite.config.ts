import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
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

          if (normalized.includes("/boring-avatars/")) {
            return "vendor-avatar";
          }

          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    host: !!process.env.VITE_EXPOSE_HOST
  }
});

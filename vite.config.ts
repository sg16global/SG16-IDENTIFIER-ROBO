import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/*
 * One Vite project, two outputs: the React single-page app (index.html → dist/client)
 * and the Cloudflare Worker (wrangler.jsonc "main" → dist/sg16_identifier). The
 * Cloudflare plugin runs the Worker in workerd during `vite dev`, so the API and the
 * app are developed together with HMR. Tailwind CSS 4 is processed by PostCSS
 * (postcss.config.mjs), which Vite loads automatically for src/styles/globals.css.
 */
export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  // CORS is the Worker's decision (VITEX_CORS_ORIGINS), as in production; Vite's own
  // middleware would otherwise answer preflights before the Worker sees them.
  server: { cors: false },
  preview: { cors: false },
});

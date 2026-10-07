import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  server: {
    // Same-origin in production; the dev server proxies the API instead of using CORS.
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: { target: "es2022", sourcemap: true },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";

// Cross-origin isolation lets tfhe prove multi-threaded (~5x faster encryption).
// Same headers ship to prod via vercel.json.
const isolation = {
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm()],
  server: { port: 5173, headers: isolation },
  preview: { port: 4173, headers: isolation },
  optimizeDeps: { exclude: ["tfhe"], esbuildOptions: { target: "esnext" } },
  assetsInclude: ["**/*.wasm"],
  define: { global: "globalThis" },
  worker: { format: "es" },
  build: { target: "esnext" },
});

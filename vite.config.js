import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      // These helpers only build module-local data indexes; unused screens
      // do not need to load their registration datasets.
      treeshake: {
        moduleSideEffects: id => !/\/src\/(geo|domains|zipmatch)\.js$/.test(id)
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        // The Node API (npm run dev, port 3000). `npm run dev:php` starts Vite in "php" mode for the PHP server on 8000.
        target: mode === "php" ? "http://127.0.0.1:8000" : `http://127.0.0.1:${process.env.PORT || 3000}`,
        changeOrigin: true
      }
    }
  }
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
});

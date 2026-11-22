import path from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const backend = "http://127.0.0.1:" + (process.env.EXILE_TRADE_DEV_BACKEND_PORT ?? 8584);

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: "esnext",
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === "webview",
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ipc": path.resolve(__dirname, "./src/../../ipc"),
      "@specs": path.resolve(__dirname, "./specs"),
    },
    extensions: [".ts", ".js", ".vue", ".json"],
  },
  define: {
    "import.meta.vitest": "undefined",
  },
  server: {
    proxy: {
      "^/(config|uploads|proxy|custom-icons)": { target: backend },
      "/events": { ws: true, target: backend },
    },
  },
});

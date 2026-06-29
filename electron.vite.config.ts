import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve("app/src/main/index.ts")
      }
    },
    resolve: {
      alias: {
        "@main": resolve("app/src/main"),
        "@shared": resolve("app/src/shared")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve("app/src/preload/index.ts")
      }
    },
    resolve: {
      alias: {
        "@shared": resolve("app/src/shared")
      }
    }
  },
  renderer: {
    root: resolve("app/src/renderer"),
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve("app/src/renderer/index.html")
      }
    },
    resolve: {
      alias: {
        "@renderer": resolve("app/src/renderer"),
        "@shared": resolve("app/src/shared")
      }
    }
  }
});

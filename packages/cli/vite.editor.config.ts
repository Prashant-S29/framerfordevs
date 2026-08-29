import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "./editor-app",
  base: "/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist/editor-assets",
    emptyOutDir: false,
    sourcemap: false,
    manifest: false,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        entryFileNames: "assets/editor.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith(".css"))
            ? "assets/editor.css"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
});

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), react()],
  build: {
    outDir: "artifact",
    emptyOutDir: true,
    manifest: "manifest.json",
    rollupOptions: {
      input: "src/app/index.tsx",
      output: {
        entryFileNames: "assets/studio-[hash].js",
        chunkFileNames: "assets/chunk-[hash].js",
        assetFileNames: "assets/studio-[hash][extname]",
      },
    },
  },
});

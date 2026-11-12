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
        chunkFileNames: "assets/chunk/[name]-[hash].js",
        assetFileNames: "assets/studio-[hash][extname]",
        // Keeps React and its CommonJS helpers in one vendor chunk, matching the reviewed M19B chunk graph.
        codeSplitting: {
          groups: [
            {
              name: "react-dom",
              test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/,
            },
          ],
        },
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force une instance unique de react-router pour éviter le double contexte
      'react-router/dom': path.resolve(
        './node_modules/react-router/dist/development/dom-export.mjs'
      ),
      'react-router': path.resolve(
        './node_modules/react-router/dist/development/index.mjs'
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000", // Aligné sur le port réel du backend
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Split the heavy, rarely-changing libraries out of the app chunk so the
    // dashboard shell paints without waiting for the charting bundle.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("three") || id.includes("@react-three") || id.includes("troika")) return "three";
          if (id.includes("@radix-ui")) return "ui";
          if (id.includes("react-router")) return "router";
          if (id.includes("react-dom") || id.includes("/react/")) return "react";
          return undefined;
        },
      },
    },
  },
});
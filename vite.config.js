import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  plugins: [react()],
  publicDir: "../assets",
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5174",
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});

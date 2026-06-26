import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During local development, the Vite dev server proxies /api requests to the
// backend (assumed running on localhost:3001, per server/.env.example's default).
// In production, the client is built as static files and the API base URL
// comes from VITE_API_URL (see .env.example) — there's no proxy in production.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});

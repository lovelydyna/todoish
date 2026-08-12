import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri's devUrl points at 5173, so that stays the default. A PORT in the
// environment wins, which lets a browser-only preview run alongside it.
const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "node",
  },
});

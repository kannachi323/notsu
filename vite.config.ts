import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { assertNoPrivilegedKeys, onlineConfig } from "./src/features/accounts/data/config.ts";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => {
  // Fail before bundling a mistakenly supplied secret into public frontend assets.
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  assertNoPrivilegedKeys(env);
  onlineConfig(env);
  return {
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/.tools/**"] },
  },
  };
});

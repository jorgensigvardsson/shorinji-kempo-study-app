import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Node 25's experimental global localStorage is incomplete unless a backing
// file is configured. Disable it in test workers so happy-dom provides the
// browser-compatible implementation instead.
if (!process.env.NODE_OPTIONS?.includes("--no-experimental-webstorage")) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--no-experimental-webstorage"]
    .filter(Boolean)
    .join(" ");
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Supplied by vite-plugin-pwa during a real build, which is not in this config
      // — without it anything importing App.tsx fails to resolve rather than fails a
      // test. The stub is inert: registration is the plugin's job, and a test that
      // cares about the update prompt drives it through the hook's callbacks.
      "virtual:pwa-register/react": resolve(__dirname, "src/test-stubs/pwa-register.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test-setup.ts"],
  },
});

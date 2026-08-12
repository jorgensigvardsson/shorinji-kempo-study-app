import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

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
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test-setup.ts"],
  },
});

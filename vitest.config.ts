import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // UI tests with Radix are slow on a busy machine; a real failure still fails, just later.
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});

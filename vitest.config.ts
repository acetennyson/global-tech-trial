import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts"],
    // client/ is its own package (own vitest.config.ts, own fake-indexeddb setup)
    // and is run via `npm test` inside client/, not from the root suite.
    exclude: ["node_modules/**", ".next/**", "client/**"],
  },
});

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts"],
    // client/ is its own package with its own tests: run `npm test` inside client/
    exclude: ["node_modules/**", ".next/**", "client/**"],
  },
});

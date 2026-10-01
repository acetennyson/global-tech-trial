import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // bcrypt (cost 12, pure JS) takes ~1-2s per hash on a slow or busy machine, and the auth tests
    // hash several times. The 5s default times out there even though nothing is wrong.
    testTimeout: 30_000,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts"],
    // client/ is its own package with its own tests: run `npm test` inside client/
    exclude: ["node_modules/**", ".next/**", "client/**"],
  },
});

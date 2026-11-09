import { resolve } from "node:path";
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "packages/sports-assets/tests/**"],
  },
  resolve: {
    alias: {
      "@pitchlab/contracts": resolve(__dirname, "packages/contracts/src/index.ts"),
      "@pitchlab/models": resolve(__dirname, "packages/models/src/index.ts"),
      "@pitchlab/engines-reference": resolve(__dirname, "packages/engines-reference/src/index.ts"),
      "@pitchlab/sports-assets": resolve(__dirname, "packages/sports-assets/src/index.ts"),
    },
  },
});

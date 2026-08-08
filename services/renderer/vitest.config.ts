import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // A compilação de verdade chama `pdflatex`, que leva alguns segundos na primeira vez.
    testTimeout: 60_000,
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": src,
      "@modules": `${src}/modules`,
      "@shared": `${src}/shared`,
      "@infrastructure": `${src}/infrastructure`,
      "@design-system": `${src}/design-system`,
    },
  },
});

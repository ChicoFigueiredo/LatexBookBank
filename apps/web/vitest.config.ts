import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  test: {
    // Node por padrão; os testes de componente pedem DOM via `@vitest-environment happy-dom`.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      // Ver `tests/stubs/server-only.ts` para o motivo.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": src,
      "@modules": `${src}/modules`,
      "@shared": `${src}/shared`,
      "@infrastructure": `${src}/infrastructure`,
      "@design-system": `${src}/design-system`,
    },
  },
});

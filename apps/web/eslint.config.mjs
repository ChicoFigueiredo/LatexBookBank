import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

import boundaries from "./eslint.boundaries.mjs";
import tokenAdherence from "./eslint.tokens.mjs";

/**
 * Flat config nativo do `eslint-config-next` v16 — sem `FlatCompat`, sem `@eslint/eslintrc`.
 *
 * As regras de fronteira arquitetural vivem em `eslint.boundaries.mjs`, escopadas por `files`,
 * e são exercitadas por `tests/architecture-boundaries.test.ts`.
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**", "src/generated/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  ...boundaries,
  ...tokenAdherence,
];

export default config;

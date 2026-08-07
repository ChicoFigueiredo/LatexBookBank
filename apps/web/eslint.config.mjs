import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * Flat config nativo do `eslint-config-next` v16 — sem `FlatCompat`, sem `@eslint/eslintrc`.
 *
 * As regras de fronteira arquitetural (domain não importa prisma/next/node:fs/SDK de IA,
 * renderer não conhece storage nem domínio) entram na issue #4, escopadas por `files`.
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"],
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
];

export default config;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // El guion bajo al inicio significa "a propósito no se usa". Sirve sobre
      // todo para desestructurar omitiendo: `const { colonies: _c, ...loc }`.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Legacy artifacts from the pre-migration (Memberstack-era) codebase.
    "temp-pata-amiga/**",
    "tests/**",
    "*.js",
    "test-memberstack-api.ts",
    // No son código de la aplicación: código extraído de Webflow, utilerías
    // sueltas y widgets estáticos servidos tal cual. La reja de CI vigila src/.
    "login code extracted/**",
    "scripts/**",
    "scratch/**",
    "public/**",
  ]),
]);

export default eslintConfig;

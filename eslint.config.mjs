import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",

    // Legacy v1 editor files kept temporarily in the repo.
    "components/editor/*.test.ts",
    "components/editor/*.legacy.*",
    "components/editor/*.bak",
    "components/editor/mirror.ts",
    "components/editor/unfold.ts",
    "components/editor/offset.ts",
    "components/editor/dart.ts",
    "components/editor/snapping.ts",
    "components/editor/shapeBounds.ts",
  ]),
]);

export default eslintConfig;

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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The sync CLI is Node, not React. eslint-config-next applies the React
    // compiler rules to every file it sees, and they misread a plain
    // `setToken(...)` inside a helper as a setState call in an effect.
    // scripts/ has its own tsconfig and is checked by `npm run typecheck:sync`.
    "scripts/**",
  ]),
]);

export default eslintConfig;

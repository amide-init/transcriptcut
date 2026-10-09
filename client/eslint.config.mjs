import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default defineConfig([
  globalIgnores([".next/**", "dist/**", "src/generated/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactRefresh.configs.vite,
  {
    plugins: { "react-hooks": reactHooks },
    // Match the previous eslint-config-next setup's react-hooks coverage
    // (rules-of-hooks + exhaustive-deps) rather than pulling in
    // eslint-plugin-react-hooks v7's much larger React Compiler-oriented
    // rule set -- this migration ports the framework, not a full relint.
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // shadcn's generated primitives legitimately co-export a component and
    // its variant helper (e.g. buttonVariants) from the same file.
    files: ["src/components/ui/**"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);

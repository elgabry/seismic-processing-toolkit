import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const typescriptFiles = ["**/*.ts"];

export default [
  {
    ignores: ["dist/**", "local-release/**", "node_modules/**", ".npm-cache/**", "src/legacy/reference/**", "public/legacy/**"]
  },
  js.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node }
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files: typescriptFiles })),
  {
    files: typescriptFiles,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error"
    }
  }
];

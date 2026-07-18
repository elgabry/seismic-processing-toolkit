import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const typescriptFiles = ["**/*.ts"];

export default [
  {
    ignores: ["dist/**", "node_modules/**", ".npm-cache/**", "src/legacy/reference/**", "public/legacy/**"]
  },
  js.configs.recommended,
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

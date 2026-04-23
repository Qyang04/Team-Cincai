import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import nextTs from "eslint-config-next/typescript.js";
import nextVitals from "eslint-config-next/core-web-vitals.js";
import tseslint from "typescript-eslint";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/coverage/**",
    "apps/web/next-env.d.ts",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/api/**/*.ts", "packages/shared/**/*.ts"],
    rules: {
      "no-undef": "off",
    },
  },
  ...compat.config(nextVitals).map((config) => ({
    ...config,
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
  })),
  ...compat.config(nextTs).map((config) => ({
    ...config,
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
  })),
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-undef": "off",
    },
  },
]);

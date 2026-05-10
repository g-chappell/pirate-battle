// ESLint flat config (v9+).
// TS parser + recommended rules across the monorepo. React plugin is scoped
// to apps/web (the only React surface). Prettier handles formatting, so
// `eslint-config-prettier` is applied last to disable conflicting rules.
import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-types/**",
      "**/dist-types-node/**",
      "**/build/**",
      "**/out/**",
      "**/coverage/**",
      "**/.vite/**",
      "**/*.tsbuildinfo",
      "packages/db/generated/**",
      "roadmap/viewer/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx,jsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
  {
    files: ["**/*.mjs", "**/*.js", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: [
      "roadmap/**/*.mjs",
      "scripts/**/*.mjs",
      ".claude/hooks/**/*.mjs",
      ".claude/skills/**/*.mjs",
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
      "import/order": "off",
    },
  },
  prettierConfig,
];

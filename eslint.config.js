import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "drawings/**",
      ".sites/**",
      ".deploy/**",
      ".local-share/**",
      "data/**",
      "tmp/spreadsheets/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "deploy/**/*.mjs"],
    languageOptions: {
      globals: {
        URL: "readonly",
        fetch: "readonly",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
);

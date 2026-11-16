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
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
);

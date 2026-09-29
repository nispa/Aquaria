import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const PURE_LAYERS = ["src/core/**", "src/scene/**", "src/sim/**"];

export default defineConfig(
  { ignores: ["dist", "coverage", "playwright-report", "test-results", "*.config.js"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.mjs"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Use named exports only.",
        },
      ],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/consistent-type-imports": "error",
      eqeqeq: "error",
    },
  },
  {
    files: PURE_LAYERS,
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/render/**", "**/ui/**", "**/app/**", "**/input/**"],
              message: "core, scene and sim must not depend on render, ui, input or app.",
            },
            {
              group: ["three", "three/*"],
              importNames: [
                "WebGLRenderer",
                "Scene",
                "Mesh",
                "Material",
                "ShaderMaterial",
                "Object3D",
                "Texture",
              ],
              message: "Only Three.js math classes are allowed in pure layers.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Pure layers must not touch the DOM." },
        { name: "document", message: "Pure layers must not touch the DOM." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded RNG from core/." },
        { object: "Date", property: "now", message: "Use the injected clock from core/." },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "e2e/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["*.config.ts", "eslint.config.mjs"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-restricted-syntax": "off" },
  },
);

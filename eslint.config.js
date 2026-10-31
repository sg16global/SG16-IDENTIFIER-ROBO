import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist/**",
    ".wrangler/**",
    ".vite/**",
    ".next/**",
    ".open-next/**",
    // Generated: the embedded certificate and the Worker runtime types.
    "src/lib/legal/certificate-image.ts",
    "src/worker/worker-configuration.d.ts",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      // Provider JSON is parsed loosely in places; flagged for review, not a build failure.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // The single-page app: fast refresh needs components-only modules.
    files: ["src/**/*.tsx"],
    extends: [reactRefresh.configs.vite],
    rules: {
      // Some UI modules export helpers beside their components (signalRobot, fetchPioneers);
      // Fast Refresh then reloads the module instead of patching it. Dev-only, so a warning.
      "react-refresh/only-export-components": "warn",
    },
  },
  {
    files: ["src/worker/**/*.ts", "src/lib/**/*.ts", "src/db/**/*.ts"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["*.{js,mjs}", "scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
]);

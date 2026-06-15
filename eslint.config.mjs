import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".agents/**",
      ".artifacts/**",
      ".claude/**",
      "coverage/**",
      "dist/**",
      "memory/**",
      "modal/**",
      "node_modules/**",
      "out/**",
      "reference-repos/**",
      "skills/**",
      "video-review-out*/**",
      ".calibration-temp/**",
      "app/api/services/thinkforge/**",
      "app/dashboard/thinkforge/**",
      "components/dashboard/ThinkForge/**",
      "lib/thinkforge/**",
      "lib/middleware/services/thinkforge.ts",
      "./lib/utils/thinkforgeSession.ts",
      "./lib/utils/sessionMetadata.ts",
      "./lib/auth/sessionManager.ts",
      "./lib/utils/raceConditionManager.ts",
      "./lib/services/pdfExportService.ts"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-img-element": "warn",
      "prefer-const": "warn",
    },
  },
  {
    files: [
      "*.cjs",
      "*.config.{js,cjs,ts}",
      "scripts/**/*.{js,cjs}",
      "test-*.{js,cjs}",
    ],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;

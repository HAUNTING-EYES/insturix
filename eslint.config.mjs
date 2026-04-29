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
      "@typescript-eslint/no-unused-vars": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-img-element": "warn",
      "prefer-const": "warn",
    },
  },
];

export default eslintConfig;

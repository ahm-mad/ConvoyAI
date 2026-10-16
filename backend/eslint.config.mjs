// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "src/generated/**", "prisma/generated/**"] },
  eslint.configs.recommended,
  // Config files themselves aren't part of the tsconfig `include` — keep
  // them on plain (non-type-checked) linting rather than fighting the
  // TS project service over files it was never meant to type-check.
  { files: ["*.mjs", "*.config.*"], ...tseslint.configs.disableTypeChecked },
  // `ecosystem.config.cjs` (Phase 7, D-0095) is genuinely CommonJS (pm2's
  // own config format, loaded by the pm2 CLI, not this project's `"type":
  // "module"` runtime) — needs Node's CommonJS globals (`__dirname`,
  // `module`, `require`) that the rest of this ESM project doesn't. Listed
  // by hand rather than pulling in the `globals` package for one file.
  {
    files: ["*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { __dirname: "readonly", __filename: "readonly", module: "readonly", require: "readonly" },
    },
  },
  {
    files: ["src/**/*.ts", "scripts/**/*.ts"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CONVENTIONS.md: no console.* — use the injected pino logger.
      "no-console": "error",
      // CONVENTIONS.md: async/await only — no raw .then() chains.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Build-time contract tooling: it walks untyped JSON documents / the TypeScript AST and prints reports to the
  // terminal, so the runtime-code rules about `any`, non-null assertions and console output do not apply.
  {
    files: [
      "src/platform/openapi/{contract,contract-components,contract-file,contract-split,error-trace,response-types,request-types,route-introspection}.ts",
      "scripts/openapi-*.ts",
    ],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-unnecessary-template-expression": "off",
    },
  },
  {
    files: ["src/platform/openapi/__tests__/**"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // The contract test walks an untyped JSON document.
    },
  },
);

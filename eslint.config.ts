import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Project-wide rule overrides applied on top of typescript-eslint's
// strictTypeChecked + stylisticTypeChecked presets.
//
// - consistent-type-definitions (off): library code uses `type` aliases
//   freely; the presets default to "interface" but that preference is purely
//   stylistic.
// - no-invalid-void-type (off): we use `[TArgs] extends [void]` overload
//   discrimination on the hook return types; that's a legitimate use of
//   `void` as a generic-position type.
// - no-redundant-type-constituents (off): `unknown | null` reads more clearly
//   than `unknown` alone in places where null is a meaningful default.
const sharedRules = {
  '@typescript-eslint/consistent-type-definitions': 'off',
  '@typescript-eslint/no-invalid-void-type': 'off',
  '@typescript-eslint/no-redundant-type-constituents': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
} as const;

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'packages/website/**', // Docusaurus has its own setup
    ],
  },

  js.configs.recommended,

  {
    files: ['packages/core/src/**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: true },
      globals: globals.node,
    },
    rules: {
      ...sharedRules,
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  {
    files: ['packages/react/src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: true },
      globals: globals.browser,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      ...sharedRules,
    },
  },

  // Slice files use Immer-managed drafts inside `extraReducers`; deleting
  // dynamically-keyed entries off a draft is the canonical pattern, so the
  // generic `no-dynamic-delete` warning doesn't apply.
  {
    files: ['packages/core/src/store/*.ts'],
    rules: {
      '@typescript-eslint/no-dynamic-delete': 'off',
    },
  },

  // Saga runners and the test store helpers bridge Redux-saga's loosely-typed
  // effect API and a generic Redux store shape. The `no-unsafe-*` family
  // can't see through `getContext`/`call` typing or arbitrary state slices,
  // so we accept the same trade-off the file-level `no-explicit-any`
  // disables already do. `no-unnecessary-condition` fires on the `while
  // (true)` event-loop idiom that's standard in saga generators.
  // `no-dynamic-delete` fires on the `delete record[cacheKey]` bookkeeping
  // in the gc runner's per-key state; the records are private, freshly
  // initialised plain objects with no prototype-pollution surface.
  {
    files: [
      'packages/core/src/saga/*.ts',
      'packages/core/src/testing/storeHelpers.ts',
      'packages/core/src/testing/setupApiTest.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
    },
  },

  // Hook implementations select against a generic Redux state shape, which
  // is `any` by construction. Same trade-off as the saga code.
  {
    files: ['packages/react/src/hooks/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  // Test code is allowed to use `!` after an `expect(...)` assertion and to
  // template-stringify numeric/unknown values. `unbound-method` triggers on
  // `expect(api.method).toHaveBeenCalled()` style assertions. `require-await`
  // fires on test fixtures that use `async` purely to match a real-world
  // signature (e.g. `async execute(args)` that returns a literal).
  {
    files: ['packages/**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },

  prettier,
);

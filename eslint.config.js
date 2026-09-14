// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.svelte-kit/**',
      // adapter-static output of the example app (also present in CI, which
      // builds before it lints).
      '**/build/**'
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // The `(string & {})` open-type trick and the opaque `data` channel
      // deliberately use `{}`; keep the strict preset otherwise.
      '@typescript-eslint/no-empty-object-type': 'off',
      // `Serializer` / `CompositeSerializer` are intentional static-only
      // namespaces (stateful only via the private migrations map).
      '@typescript-eslint/no-extraneous-class': 'off'
    }
  },
  {
    // Tests may use non-null assertions freely on known-present lookups.
    files: ['**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  {
    // React adapter + its example: the rules-of-hooks checks the rest of the
    // repo has no use for. The React package leans on `useSyncExternalStore`
    // and `useImperativeHandle`, where a mis-ordered hook is a silent bug.
    files: ['packages/react/**/*.{ts,tsx}', 'examples/react/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    // Node-context files: config files (svelte/vite/tailwind/postcss) and the
    // standalone `.mjs` scripts examples run under plain Node. Give them Node
    // globals and allow CommonJS `require` in the `.cjs` PostCSS config.
    files: ['**/*.config.{js,ts}', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
);

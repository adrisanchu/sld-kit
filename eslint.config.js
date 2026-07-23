// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

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
    // Node-context config files (svelte/vite/tailwind/postcss) — give them Node
    // globals and allow CommonJS `require` in the `.cjs` PostCSS config.
    files: ['**/*.config.{js,ts}', '**/*.cjs'],
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

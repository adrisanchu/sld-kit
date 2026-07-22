// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.svelte-kit/**']
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
  }
);

// Unscript root ESLint flat config — strict TypeScript for the CLI runtime.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      // The Sanity Studio lives in its own project with its own lint setup.
      'unscript-knowledge/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript is the type checker; ESLint globals would only produce noise.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // The repo convention for intentionally-unused parameters/args is a
      // leading underscore (e.g. keypress handlers ignore args).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // ANSI escape stripping is the point of the regexes in text.ts,
      // terminal.ts, and the tests that exercise them.
      'no-control-regex': 'off',
    },
  },
);

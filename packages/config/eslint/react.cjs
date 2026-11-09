/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: false,
  extends: [
    './base.cjs',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  plugins: ['react', 'react-hooks', 'jsx-a11y'],
  settings: { react: { version: 'detect' } },
  env: { browser: true, node: true, es2022: true },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'jsx-a11y/label-has-associated-control': ['error', { assert: 'either' }],
  },
};

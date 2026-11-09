/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: false,
  extends: ['./base.cjs'],
  env: { node: true, es2022: true },
  rules: {
    'no-console': 'off',
  },
};

/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "@remix-run/eslint-config/jest-testing-library",
    "prettier",
  ],
  // Vitest is used (not Jest). Tell eslint-plugin-jest a version so CI
  // doesn't crash with "Unable to detect Jest version".
  settings: {
    jest: {
      version: 29,
    },
  },
  globals: {
    shopify: "readonly",
  },
};

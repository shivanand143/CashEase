
module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    quotes: ["error", "double"],
  },
   parserOptions: {
     ecmaVersion: 2020, // Use a modern ECMAScript version
   },
};

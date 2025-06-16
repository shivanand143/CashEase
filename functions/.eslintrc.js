module.exports = {
  'env': {
    es6: true,
    node: true,
  },
  'parserOptions': {
    'ecmaVersion': 2018,
  },
  'extends': [
    'eslint:recommended',
    'google',
  ],
  'rules': {
    'max-len': ['off'],
  },
  'overrides': [
    {
      files: ['**/*.spec.*'],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  'globals': {},
};

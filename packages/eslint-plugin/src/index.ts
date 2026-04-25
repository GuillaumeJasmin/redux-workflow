import requireYieldStar from './rules/require-yield-star';

const plugin = {
  meta: { name: '@redux-workflow/eslint-plugin', version: '0.0.1' },
  rules: {
    'require-yield-star': requireYieldStar,
  },
};

export default plugin;

import plugin from '../index';

// Flat config preset. Spread into your `eslint.config.ts`:
//   import reduxWorkflowRecommended from '@redux-workflow/eslint-plugin/configs/recommended'
//   export default tseslint.config(reduxWorkflowRecommended, ...)
export default {
  plugins: { '@redux-workflow': plugin },
  rules: {
    '@redux-workflow/require-yield-star': 'error',
  },
} as const;

# @redux-workflow/eslint-plugin

ESLint rules for [redux-workflow]. Currently ships one rule:

- **`@redux-workflow/require-yield-star`** — flags `yield <effect>(...)` and
  auto-fixes to `yield* <effect>(...)` so TypeScript can infer the correct
  return type from `typed-redux-saga` effects.

## Install

```bash
pnpm add -D @redux-workflow/eslint-plugin
```

`eslint` (>=9) is a peer dependency.

## Usage (flat config)

Spread the recommended preset:

```ts
// eslint.config.ts
import reduxWorkflowRecommended from '@redux-workflow/eslint-plugin/configs/recommended';

export default [reduxWorkflowRecommended];
```

Or wire the rule manually:

```ts
import reduxWorkflow from '@redux-workflow/eslint-plugin';

export default [
  {
    plugins: { '@redux-workflow': reduxWorkflow },
    rules: {
      '@redux-workflow/require-yield-star': 'error',
    },
  },
];
```

## Documentation

Full docs at **[redux-workflow.dev](https://redux-workflow.dev)**.

## License

MIT © Guillaume Jasmin

[redux-workflow]: https://github.com/GuillaumeJasmin/redux-workflow

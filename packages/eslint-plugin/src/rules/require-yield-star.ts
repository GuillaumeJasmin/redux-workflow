import type { Rule } from 'eslint';

// Names of saga effects that return a SagaGenerator and therefore require
// `yield*` to preserve TypeScript's return-type inference. Mirrors the surface
// vendored at packages/core/src/effects.
const SAGA_EFFECTS = new Set([
  'call',
  'apply',
  'cps',
  'put',
  'putResolve',
  'take',
  'takeMaybe',
  'takeEvery',
  'takeLatest',
  'takeLeading',
  'select',
  'fork',
  'spawn',
  'join',
  'cancel',
  'cancelled',
  'actionChannel',
  'flush',
  'getContext',
  'setContext',
  'delay',
  'throttle',
  'debounce',
  'retry',
  'race',
  'all',
]);

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require `yield*` (not `yield`) for redux-workflow saga effects so TypeScript can infer the correct return type.',
      recommended: true,
    },
    fixable: 'code',
    messages: {
      requireYieldStar:
        "Use 'yield*' instead of 'yield' for {{name}}() — otherwise the result is typed as `any`.",
    },
    schema: [],
  },
  create(context) {
    return {
      YieldExpression(node) {
        if (node.delegate) return; // already `yield*`
        const arg = node.argument;
        if (!arg || arg.type !== 'CallExpression') return;
        const callee = arg.callee;
        if (callee.type !== 'Identifier') return;
        if (!SAGA_EFFECTS.has(callee.name)) return;

        context.report({
          node,
          messageId: 'requireYieldStar',
          data: { name: callee.name },
          fix(fixer) {
            const yieldToken = context.sourceCode.getFirstToken(node);
            if (!yieldToken) return null;
            return fixer.insertTextAfter(yieldToken, '*');
          },
        });
      },
    };
  },
};

export default rule;

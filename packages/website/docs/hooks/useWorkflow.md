---
title: useWorkflow
---

# `useWorkflow`

Run a workflow. Returns a `[trigger, status]` tuple. Use this when the work
involves orchestration — multiple queries/mutations, saga primitives, or a
long-lived connection.

```ts
import { useWorkflow } from '@redux-workflow/react';

const [trigger, { data, isLoading, isSuccess, isError, error, reset }] = useWorkflow(
  api.workflows.publishPost,
  {
    cancelOnUnmount: true,
  },
);

trigger({ postId });
reset(); // clears the workflow state
```

## Features

- Dispatches the workflow when you call `trigger(args)`.
- Tracks the latest run's status (`isLoading`, `isSuccess`, `isError`, `data`,
  `error`).
- Optionally cancels the running workflow on unmount via `cancelOnUnmount` —
  the workflow's `finally` block still runs (see
  [`dismiss`](/docs/workflows#dismiss--cancel-on-a-domain-action) for the
  domain-action equivalent).
- Pairs with the workflow's `*execute` context (`query`, `mutate`, `select`,
  `put`, `getCache`, `patchCache`).

## Signature

```ts
function useWorkflow<TResult, TArgs>(
  instance: WorkflowInstance<TResult, TArgs>,
  options?: UseWorkflowOptions,
): UseWorkflowResult<TResult, TArgs>;

type UseWorkflowOptions = {
  cancelOnUnmount?: boolean;
};

type UseWorkflowResult<TResult, TArgs> = [
  trigger: [TArgs] extends [void] ? () => void : (args: TArgs) => void,
  status: {
    data: TResult | null; // last successful result, or null
    isLoading: boolean; // workflow is pending
    isSuccess: boolean; // workflow is fulfilled
    isError: boolean; // workflow is rejected
    error: unknown | null; // last failure, or null
    reset: () => void; // clears data/error and returns to idle
  },
];
```

| Argument   | Type                 | Notes                                   |
| ---------- | -------------------- | --------------------------------------- |
| `instance` | `WorkflowInstance`   | A workflow from `api.workflows.<name>`. |
| `options`  | `UseWorkflowOptions` | Optional. See [Options](#options).      |

## Options

| Field             | Type      | Default | Notes                                                                                                                   |
| ----------------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `cancelOnUnmount` | `boolean` | `false` | When `true`, dispatches the workflow's internal cancel action on unmount. Any `finally` block in `*execute` still runs. |

:::tip `cancelOnUnmount` runs `finally`
Cancellation goes through the same path as the workflow's
[`dismiss`](/docs/workflows#dismiss--cancel-on-a-domain-action) action — your
`try { … } finally { … }` block still runs, so cleanup logic (closing
sockets, releasing locks) is preserved.
:::

:::caution `reset()` affects every subscriber
Like [`useMutation`](./useMutation), workflow status is keyed by the workflow
itself. `reset()` from one component clears `data` / `error` for every
component reading the same workflow.
:::

## Trigger

```ts
trigger(args: TArgs): void;
```

Dispatches the workflow. When `TArgs` is `void`, `trigger` is callable with no
arguments (`trigger()`).

## Status

| Field       | Type              | Notes                                                                                  |
| ----------- | ----------------- | -------------------------------------------------------------------------------------- |
| `data`      | `TResult \| null` | The workflow's last successful result, or `null`.                                      |
| `isLoading` | `boolean`         | `true` while the workflow is `pending`.                                                |
| `isSuccess` | `boolean`         | `true` when the workflow is `fulfilled`.                                               |
| `isError`   | `boolean`         | `true` when the workflow is `rejected`.                                                |
| `error`     | `unknown \| null` | The error from the last failed run, or `null`.                                         |
| `reset`     | `() => void`      | Clears `data` and `error` and returns the workflow to `idle`. Affects all subscribers. |

## Example

```tsx
function CheckoutButton({ amount }: { amount: number }) {
  const [pay, { isLoading, isSuccess, isError, error }] = useWorkflow(api.workflows.pay, {
    cancelOnUnmount: true,
  });

  if (isSuccess) return <div>Paid!</div>;

  return (
    <>
      <button onClick={() => pay({ amount })} disabled={isLoading}>
        {isLoading ? 'Processing…' : `Pay $${amount}`}
      </button>
      {isError && <div>{String(error)}</div>}
    </>
  );
}
```

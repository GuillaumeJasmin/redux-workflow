---
title: useWorkflow
---

# `useWorkflow`

Run a workflow. Returns a `[trigger, status]` tuple. Pass
`{ cancelOnUnmount: true }` to dispatch the workflow's cancel action when the
component unmounts — useful for long-running orchestrations the user navigated
away from. The workflow's `finally` block still runs.

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

## Signature

```ts
useWorkflow(instance, options?) // → [trigger, status]
```

| Argument   | Type                 | Notes                                   |
| ---------- | -------------------- | --------------------------------------- |
| `instance` | `WorkflowInstance`   | A workflow from `api.workflows.<name>`. |
| `options`  | `UseWorkflowOptions` | Optional. See [Options](#options).      |

## Options

| Field             | Type      | Default | Notes                                                                                                                   |
| ----------------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `cancelOnUnmount` | `boolean` | `false` | When `true`, dispatches the workflow's internal cancel action on unmount. Any `finally` block in `*execute` still runs. |

## Trigger

```ts
trigger(args: TArgs): void
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

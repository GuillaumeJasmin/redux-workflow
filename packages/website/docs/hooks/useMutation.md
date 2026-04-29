---
title: useMutation
---

# `useMutation`

Run a mutation. Returns a `[trigger, status]` tuple.

```ts
import { useMutation } from '@redux-workflow/react';

const [trigger, { data, isLoading, isSuccess, isError, error, reset }] = useMutation(
  api.mutations.updateUser,
);

trigger({ id, name });
reset(); // clears the mutation state
```

## Features

- Dispatches the mutation when you call `trigger(args)`.
- Tracks the latest run's status (`isLoading`, `isSuccess`, `isError`, `data`,
  `error`).
- Refreshes any queries listed in the mutation's
  [`invalidates`](/docs/mutations#invalidates--cache-invalidation-by-query-name).
- Plays well with optimistic updates declared via
  [`onStart` / `onError`](/docs/mutations#optimistic-updates--onstart--onerror)
  on the mutation definition.

## Signature

```ts
function useMutation<TResult, TArgs>(
  instance: MutationInstance<TResult, TArgs>,
): UseMutationResult<TResult, TArgs>;

type UseMutationResult<TResult, TArgs> = [
  trigger: [TArgs] extends [void] ? () => void : (args: TArgs) => void,
  status: {
    data: TResult | null; // last successful result, or null
    isLoading: boolean; // mutation is pending
    isSuccess: boolean; // mutation is fulfilled
    isError: boolean; // mutation is rejected
    error: unknown | null; // last failure, or null
    reset: () => void; // clears data/error and returns to idle
  },
];
```

| Argument   | Type               | Notes                                   |
| ---------- | ------------------ | --------------------------------------- |
| `instance` | `MutationInstance` | A mutation from `api.mutations.<name>`. |

There are no options.

:::caution `reset()` affects every subscriber
A mutation has a single shared status entry, keyed by the mutation itself
(not by args). Calling `reset()` from one component clears `data` / `error`
for every component reading the same mutation.
:::

:::note `void`-arg mutations
When the mutation declares no args (`TArgs = void`), `trigger` is callable
with no arguments — `trigger()` instead of `trigger(undefined)`. The
returned type reflects this.
:::

## Trigger

```ts
trigger(args: TArgs): void;
```

Dispatches the mutation. When `TArgs` is `void`, `trigger` is callable with no
arguments (`trigger()`).

## Status

| Field       | Type              | Notes                                                                                  |
| ----------- | ----------------- | -------------------------------------------------------------------------------------- |
| `data`      | `TResult \| null` | The mutation's last successful result, or `null`.                                      |
| `isLoading` | `boolean`         | `true` while the mutation is `pending`.                                                |
| `isSuccess` | `boolean`         | `true` when the mutation is `fulfilled`.                                               |
| `isError`   | `boolean`         | `true` when the mutation is `rejected`.                                                |
| `error`     | `unknown \| null` | The error from the last failed run, or `null`.                                         |
| `reset`     | `() => void`      | Clears `data` and `error` and returns the mutation to `idle`. Affects all subscribers. |

## Example

```tsx
function NewPost() {
  const [createPost, { isLoading, isError, error, reset }] = useMutation(api.mutations.createPost);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createPost({ title: 'hi', body: '...' });
      }}
    >
      <button disabled={isLoading}>{isLoading ? 'Saving…' : 'Create'}</button>
      {isError && (
        <div>
          {String(error)} <button onClick={reset}>Dismiss</button>
        </div>
      )}
    </form>
  );
}
```

---
title: useMutation
---

# `useMutation`

Run a mutation. Returns a `[trigger, status]` tuple. The status entry is
shared across every component reading the same mutation — call `status.reset()`
to clear `data` / `error` and return to `idle`.

```ts
import { useMutation } from '@redux-workflow/react';

const [trigger, { data, isLoading, isSuccess, isError, error, reset }] = useMutation(
  api.mutations.updateUser,
);

trigger({ id, name });
reset(); // clears the mutation state
```

## Signature

```ts
useMutation(instance); // → [trigger, status]
```

| Argument   | Type               | Notes                                   |
| ---------- | ------------------ | --------------------------------------- |
| `instance` | `MutationInstance` | A mutation from `api.mutations.<name>`. |

There are no options.

## Trigger

```ts
trigger(args: TArgs): void
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

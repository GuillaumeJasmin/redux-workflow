---
title: useLazyQuery
---

# `useLazyQuery`

Manually triggered version of [`useQuery`](/docs/hooks/useQuery). Returns a
`[trigger, result]` tuple — the query only runs when you call `trigger(args)`.
The cache subscription follows the most-recently triggered args; switching args
unsubscribes from the previous entry and subscribes to the new one.

```ts
import { useLazyQuery } from '@redux-workflow/react';

const [trigger, { data, isLoading, isSuccess, isError, error, isUntriggered }] = useLazyQuery(
  api.queries.getUser,
);

trigger({ id: '1' });
```

## Signature

```ts
useLazyQuery(instance); // → [trigger, result]
```

| Argument   | Type            | Notes                              |
| ---------- | --------------- | ---------------------------------- |
| `instance` | `QueryInstance` | A query from `api.queries.<name>`. |

There are no options — `refetchOnFocus` / `refetchOnReconnect` come from the
endpoint definition and apply once `trigger` has subscribed the hook to a
cache entry.

## Trigger

```ts
trigger(args: TArgs): void
```

Dispatches the query for `args`. If the hook was previously subscribed to a
different cache key, that subscription is released first. The most-recently
triggered args drive the returned `result`.

## Result

| Field           | Type              | Notes                                                                                                             |
| --------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `data`          | `TResult \| null` | The cached value for the last-triggered args, or `null`.                                                          |
| `isLoading`     | `boolean`         | `true` once the hook has been triggered and the entry is `pending` or `uninitialized`. Always `false` until then. |
| `isSuccess`     | `boolean`         | `true` when the current entry is `fulfilled`.                                                                     |
| `isError`       | `boolean`         | `true` when the current entry is `rejected`.                                                                      |
| `error`         | `unknown \| null` | The error from the last failed run, or `null`.                                                                    |
| `isUntriggered` | `boolean`         | `true` until `trigger` is called for the first time. Useful to distinguish "no fetch yet" from "fetch in flight." |

## Example

```tsx
function UserLookup() {
  const [fetchUser, { data, isLoading, isUntriggered }] = useLazyQuery(api.queries.getUser);

  return (
    <>
      <input onChange={(e) => fetchUser({ id: e.target.value })} />
      {!isUntriggered && (isLoading ? <Spinner /> : <div>{data?.name}</div>)}
    </>
  );
}
```

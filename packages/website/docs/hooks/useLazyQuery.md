---
title: useLazyQuery
---

# `useLazyQuery`

Manually triggered version of [`useQuery`](./useQuery). Use it when the fetch
shouldn't run until the user asks — search-on-type, "Load more", deferred
panels.

```ts
import { useLazyQuery } from '@redux-workflow/react';

const [trigger, { data, isLoading, isSuccess, isError, error, isUntriggered }] = useLazyQuery(
  api.queries.getUser,
);

trigger({ id: '1' });
```

## Features

- Doesn't fetch until you call `trigger(args)`.
- Subscribes to the cache entry of the most-recently triggered args; the
  previous subscription is released automatically.
- Reuses the same cache as [`useQuery`](./useQuery) — a fresh entry returns
  immediately without a network call.
- `isUntriggered` lets you distinguish "no fetch yet" from "fetch in flight".

## Signature

```ts
function useLazyQuery<TResult, TArgs>(
  instance: QueryInstance<TResult, TArgs>,
): UseLazyQueryResult<TResult, TArgs>;

type UseLazyQueryResult<TResult, TArgs> = [
  trigger: (args: TArgs) => void,
  result: {
    data: TResult | null; // cached value for the last-triggered args, or null
    isLoading: boolean; // pending after the first trigger; false until then
    isSuccess: boolean; // current entry is fulfilled
    isError: boolean; // current entry is rejected
    error: unknown | null; // last failure, or null
    isUntriggered: boolean; // true until trigger is called for the first time
  },
];
```

| Argument   | Type            | Notes                              |
| ---------- | --------------- | ---------------------------------- |
| `instance` | `QueryInstance` | A query from `api.queries.<name>`. |

There are no options — `refetchOnFocus` / `refetchOnReconnect` come from the
endpoint definition and apply once `trigger` has subscribed the hook to a
cache entry.

:::note Subscription follows the latest args
Calling `trigger` with new args releases the previous cache subscription
before subscribing to the new one. Only one entry is held alive per hook
instance at a time.
:::

:::tip Cache reuse with `useQuery`
The cache is shared across hooks. If a `useQuery(getUser, { id: '1' })`
mounted elsewhere already has fresh data, `trigger({ id: '1' })` resolves
immediately without a network call.
:::

## Trigger

```ts
trigger(args: TArgs): void;
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

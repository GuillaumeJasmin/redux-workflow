---
title: useQuery
---

# `useQuery`

Subscribe to a query. Fetches on mount, dedupes concurrent calls for the same
args, and keeps the cache entry alive while the component is mounted. The
entry is garbage-collected once the last subscriber unmounts.

```ts
import { useQuery } from '@redux-workflow/react';

const { data, isLoading, isSuccess, isError, error, refetch } = useQuery(
  api.queries.getUser,
  { id },
  options,
);
```

## Signature

```ts
useQuery(instance, args, options?)
```

| Argument   | Type              | Notes                                              |
| ---------- | ----------------- | -------------------------------------------------- |
| `instance` | `QueryInstance`   | A query from `api.queries.<name>`.                 |
| `args`     | `TArgs`           | Args for the query. Used to compute the cache key. |
| `options`  | `UseQueryOptions` | Optional. See [Options](#options).                 |

## Options

| Field                       | Type                | Default          | Notes                                                                                                                                                                                                                           |
| --------------------------- | ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skip`                      | `boolean`           | `false`          | When `true`, the hook doesn't fetch, doesn't subscribe, and doesn't count as an active user of the cache entry. It still reads whatever data is already there.                                                                  |
| `refetchOnMountOrArgChange` | `boolean \| number` | `false`          | Force a refetch on mount or when `args` change, even if the cache is fresh. `true` always refetches; a number (seconds) refetches when the cached entry is older than that. Same name and semantics as RTK Query's hook option. |
| `refetchOnFocus`            | `boolean`           | endpoint default | Per-hook override of the endpoint's `refetchOnFocus` flag. Set to `false` to opt this subscriber out of focus refetches even when the endpoint enables them.                                                                    |
| `refetchOnReconnect`        | `boolean`           | endpoint default | Per-hook override of the endpoint's `refetchOnReconnect` flag.                                                                                                                                                                  |

## Result

| Field       | Type              | Notes                                                                                |
| ----------- | ----------------- | ------------------------------------------------------------------------------------ |
| `data`      | `TResult \| null` | The cached value, or `null` when no entry exists yet.                                |
| `isLoading` | `boolean`         | `true` while the query is `pending` or `uninitialized`.                              |
| `isSuccess` | `boolean`         | `true` when the entry is `fulfilled`.                                                |
| `isError`   | `boolean`         | `true` when the entry is `rejected`.                                                 |
| `error`     | `unknown \| null` | The error from the last failed run, or `null`.                                       |
| `refetch`   | `() => void`      | Force-refetch — always re-runs the network call, even when the cached data is fresh. |

## Example

```tsx
function UserCard({ id }: { id: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery(api.queries.getUser, { id });

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorBanner message={String(error)} />;
  return (
    <>
      <div>{data?.name}</div>
      <button onClick={refetch}>Refresh</button>
    </>
  );
}
```

### Conditional fetching

```tsx
useQuery(api.queries.getUser, { id }, { skip: !id });
```

### Always refetch on mount

```tsx
useQuery(api.queries.getUser, { id }, { refetchOnMountOrArgChange: true });

// Or refetch only if the cached entry is older than 30 seconds.
useQuery(api.queries.getUser, { id }, { refetchOnMountOrArgChange: 30 });
```

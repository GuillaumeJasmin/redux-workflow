---
title: useQuery
---

# `useQuery`

Subscribe to a query. The hook is the default way to render server data inside
a component.

```ts
import { useQuery } from '@redux-workflow/react';

const { data, isLoading, isSuccess, isError, error, refetch } = useQuery(
  api.queries.getUser,
  { id },
  options,
);
```

## Features

- Fetches on mount and whenever `args` change.
- Dedupes concurrent calls for the same args.
- Subscribes the component to the cache entry; the entry is garbage-collected
  after the last subscriber unmounts (see [`keepUnusedDataFor`](/docs/queries#garbage-collection-keepunuseddatafor)).
- Refetches on focus / reconnect when the endpoint opts in (see
  [`refetchOnFocus` / `refetchOnReconnect`](/docs/queries#refetchonfocus--refetchonreconnect)).
- Honors the query's `cache` window — see [Cache (staleTime)](/docs/queries#cache-staletime).

## Signature

```ts
function useQuery<TResult, TArgs>(
  instance: QueryInstance<TResult, TArgs>,
  args: TArgs,
  options?: UseQueryOptions,
): UseQueryResult<TResult>;

type UseQueryOptions = {
  skip?: boolean;
  refetchOnMountOrArgChange?: boolean | number;
  refetchOnFocus?: boolean;
  refetchOnReconnect?: boolean;
};

type UseQueryResult<TResult> = {
  data: TResult | null; // cached value, or null when no entry exists yet
  isLoading: boolean; // true while pending or uninitialized
  isSuccess: boolean; // true when the entry is fulfilled
  isError: boolean; // true when the entry is rejected
  error: unknown | null; // last failure, or null
  refetch: () => void; // force refetch — runs even when the cache is fresh
};
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

:::note `skip` is a read, not an unsubscribe
When `skip` is `true` the hook still reads whatever is in the cache for those
args — it just doesn't fetch, doesn't subscribe, and doesn't keep the entry
alive. Useful for "show what we have, but don't go fetch".
:::

:::tip Per-hook focus / reconnect overrides
`refetchOnFocus` and `refetchOnReconnect` default to whatever the endpoint
declared. Set either to `false` on a single subscriber to opt that component
out without changing the endpoint definition.
:::

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

---
title: Comparison with RTK Query
---

# Comparison with RTK Query

`redux-workflow` overlaps heavily with [RTK Query](https://redux-toolkit.js.org/rtk-query/overview)
on the query/mutation side and intentionally extends it with **workflows**
(saga-based orchestration) and a few opinionated defaults. This page is a
migration cheatsheet — same names where possible, mapped names where they
differ, and the small set of RTK Query features that aren't here yet.

If you're coming from RTK Query, the easiest mental model is:

- **Queries / Mutations** — same idea, mostly the same names.
- **Workflows** — RTK Query has nothing like this; it's the headline
  reason to pick `redux-workflow`.
- **Tag-based invalidation** — replaced by query-name invalidation.

## Side-by-side

| Feature                                                | RTK Query | Redux Workflow | Notes                                                                                                                                                           |
| ------------------------------------------------------ | :-------: | :------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useQuery`                                             |    ✅     |       ✅       |                                                                                                                                                                 |
| `useMutation`                                          |    ✅     |       ✅       |                                                                                                                                                                 |
| `keepUnusedDataFor`                                    |    ✅     |       ✅       |                                                                                                                                                                 |
| `refetchOnMountOrArgChange`                            |    ✅     |       ✅       |                                                                                                                                                                 |
| `skip` option                                          |    ✅     |       ✅       |                                                                                                                                                                 |
| `skipToken`                                            |    ✅     |       🟠       | Coming soon.                                                                                                                                                    |
| `refetch()`                                            |    ✅     |       ✅       |                                                                                                                                                                 |
| `refetchOnFocus`                                       |    ✅     |       ✅       | Set on the endpoint definition or override per `useQuery` call.                                                                                                 |
| `refetchOnReconnect`                                   |    ✅     |       ✅       | Set on the endpoint definition or override per `useQuery` call.                                                                                                 |
| `setupListeners`                                       |    ✅     |       ✅       | redux-workflow's signature accepts a custom platform bridge for React Native.                                                                                   |
| `pollingInterval`                                      |    ✅     |       ✅       | redux-workflow uses endpoint-level `poll: N` in seconds; RTK Query is per-hook and in milliseconds.                                                             |
| Cache invalidation                                     |    ✅     |       ✅       |                                                                                                                                                                 |
| `transformResponse`                                    |    ✅     |       ✅       | In redux-workflow it's available on `httpRequest`, not as a generic endpoint option.                                                                            |
| Subscription lifecycle                                 |    ✅     |       ✅       | RTK Query: `onCacheEntryAdded`. redux-workflow dispatches `firstSubscribe` / `lastUnsubscribe` actions, observable from any saga.                               |
| `onQueryStarted`                                       |    ✅     |       ✅       | redux-workflow exposes it on mutations as `onStart` / `onError` (return a rollback value from `onStart`, receive it in `onError`). For queries, use a workflow. |
| Streaming updates inside an endpoint                   |    ✅     |       ✅       | RTK Query: `onCacheEntryAdded`. redux-workflow: a workflow that listens to `firstSubscribe`.                                                                    |
| Cache patching                                         |    ✅     |       ✅       | RTK Query: `upsertQueryData` / `updateQueryData`. redux-workflow: `ctx.patchCache` from a workflow / mutation.                                                  |
| `cache`                                                |    ❌     |       ✅       | Endpoint-level fresh window — declares the cache stale after N seconds.                                                                                         |
| Test helper                                            |    ❌     |       ✅       | redux-workflow's `setupApiTest` gives chainable assertions over dispatched actions and cache state. See [Testing](/docs/testing).                               |
| Saga-based orchestration (workflows)                   |    ❌     |       ✅       | The headline reason to pick redux-workflow.                                                                                                                     |
| `selectFromResult`                                     |    ✅     |       🟠       | Coming soon.                                                                                                                                                    |
| `prefetch` helpers                                     |    ✅     |       🟠       | Coming soon.                                                                                                                                                    |
| Incremental cache (`merge`, infinite scroll)           |    ✅     |       🟠       | Coming soon. Possible with Workflows + `patchCache`                                                                                                             |
| Per-hook polling override                              |    ✅     |       ❌       | Polling is endpoint-level in redux-workflow.                                                                                                                    |
| Custom `serializeQueryArgs`                            |    ✅     |       ❌       | redux-workflow serializes args with stable JSON ordering.                                                                                                       |
| Split hooks (`useQuerySubscription` / `useQueryState`) |    ✅     |       ❌       | redux-workflow's `useQuery` covers both roles.                                                                                                                  |
| Code-gen from OpenAPI                                  |    ✅     |       ❌       | Not planned for v1.                                                                                                                                             |

If any of the ❌ rows on the redux-workflow side are blockers for you, please open an issue.

## Migrating tag-based invalidation

RTK Query's tags (`providesTags` / `invalidatesTags`) collapse into
query-name invalidation here. The model is:

```ts
// RTK Query
endpoints: (build) => ({
  getUsers: build.query({ query: () => '/users', providesTags: ['User'] }),
  renameUser: build.mutation({
    query: (args) => ({ url: `/users/${args.id}`, method: 'PATCH' }),
    invalidatesTags: ['User'],
  }),
}),

// redux-workflow
queries: (query) => ({
  getUsers: query({ execute: httpRequest({ url: '/users' }) }),
}),
mutations: (mutation) => ({
  renameUser: mutation({
    execute: httpRequest({ url: ({ id }) => `/users/${id}`, method: 'PATCH' }),
    invalidates: ['getUsers'], // ← every cached `getUsers(...)` entry refetches
  }),
}),
```

Differences worth knowing:

- Invalidation is by **query name** — every cached `args` combination of
  that query refetches.
- For finer-grained invalidation, dispatch
  `api.invalidateCache({ cacheKey })` directly. Build the cacheKey with
  `buildCacheKey(api.queries.getUsers._key, args)`.
- Most teams move from "tags" to "query name + targeted `invalidateCache`"
  without losing expressiveness — tags often just mirror the query name in
  practice.

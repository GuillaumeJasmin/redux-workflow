---
title: Queries
---

# Queries

Queries are cached, deduped reads.

## Basic query

```ts
import { createApi, httpRequest } from '@redux-workflow/core';

const api = createApi({
  name: 'users',
  queries: (query) => ({
    getUser: query({
      execute: httpRequest<User, { id: string }>({
        url: ({ id }) => `/users/${id}`,
      }),
    }),
  }),
});
```

`httpRequest` is the built-in fetch adapter — see [`httpRequest`](#httprequest--fetch-based-execute-adapter)
below. You can also pass a plain `async` function (or a generator) as `execute`
when you need more control.

### Custom `async` executor

When the data source isn't a plain HTTP endpoint — an SDK, IndexedDB, a service
worker — pass any `async` function returning `{ data }` / `{ error }`:

```ts
const api = createApi({
  name: 'users',
  queries: (query) => ({
    getUser: query({
      async execute({ id }: { id: string }) {
        const user = await usersSdk.fetchById(id);
        if (!user) return { error: 'NOT_FOUND' as const };
        return { data: user };
      },
    }),
  }),
});
```

### Generator executor

When you need saga primitives (`race` for timeouts, `select` to read store
state, cancellation, channels), use a generator:

```ts
import { createApi, call, race, delay } from '@redux-workflow/core';

const api = createApi({
  name: 'posts',
  queries: (query) => ({
    getPost: query({
      *execute({ id }: { id: string }) {
        // race the fetch against a timeout — saga cancels the losing branch
        const { response, timeout } = yield* race({
          response: call(fetchPost, { id }),
          timeout: delay(5000),
        });
        if (timeout) return { error: 'TIMEOUT' };
        return { data: response };
      },
    }),
  }),
});
```

See [`async` vs generators](#async-by-default-generators-when-you-need-saga-primitives)
for the full discussion of when to pick which.

Use in a component:

```tsx
function UserCard({ id }: { id: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery(api.queries.getUser, { id });

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorBanner message={error} />;
  return <div>{data.name}</div>;
}
```

## Return shape: `{ data }` or `{ error }`

Queries, mutations, and workflows all share the same `execute` entry point and
follow RTK Query's pattern: return `{ data }` on success, `{ error }` on
failure. Throwing also works — an uncaught throw is treated as
`{ error: thrown }` — but explicit returns are preferred because they give you
control over the error shape.

```ts
async execute({ id }: { id: string }) {
  try {
    const user = await fetchJson(`/users/${id}`);
    return { data: user };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { error: 'NOT_FOUND' };
    }
    return { error }; // normalized to a string for the cache entry
  }
}
```

`ctx.query(name, args)` and `ctx.mutate(name, args)` (used inside workflows)
return the same shape. Workflow `execute` bodies themselves return `TResult`
directly and may throw.

## `async` by default, generators when you need saga primitives

`execute` accepts a plain `async` function or a generator (`function*`). At
runtime they behave identically. **Default to `async`** — it's the clearest
shape for the common "call gateway → return data" body. Reach for a generator
when you need `select`, `put`, `race`, `take`, channels, or cancellation.

```ts
queries: (query) => ({
  // async: the default
  getPosts: query<GetPostsResult, void>({
    async execute() {
      const data = await fetchPosts();
      return { data };
    },
  }),
  // generator: only when you need saga primitives
  getPost: query({
    *execute({ id }: { id: string }) {
      // race the fetch against a timeout — saga cancels the losing branch
      const { response, timeout } = yield* race({
        response: call(fetchPost, { id }),
        timeout: delay(5000),
      });
      if (timeout) return { error: 'TIMEOUT' };
      return { data: response };
    },
  }),
}),
```

Workflow `execute` is always a generator because its `ctx` methods
(`ctx.query`, `ctx.mutate`, …) are saga-based — see [Workflows](/docs/workflows).

## Reading store state from `async` bodies: `ctx.getState`

`execute` receives a second argument `{ getState }`. Use it from an `async`
body when you'd otherwise reach for `yield* select(...)`:

```ts
createPost: mutation({
  async execute({ title, body }, { getState }) {
    const user = selectAuthenticatedUser(getState());
    if (!user) return { error: 'USER_NOT_FOUND' };

    const isDraft = selectIsDraft(getState());
    const data = await savePost({
      title, body, authorId: user.id, isDraft,
    });
    return { data };
  },
}),
```

`getState` is **live** (returns current store state, not a snapshot) when your
saga middleware was configured with
`createSagaMiddleware({ context: { getState } })`. Without that config,
`getState()` falls back to a snapshot captured right before `execute` started
(fine for pre-`await` reads in simple bodies).

To dispatch from an async body, either return `{ error }` (the runner
dispatches the `rejected` action) or switch to a generator and use `yield* put`.

## Cache (staleTime)

`cache: N` means "data is fresh for N seconds after it was fetched."

```ts
getUser: query({
  async execute({ id }: { id: string }) {
    const data = await fetchUser(id);
    return { data };
  },
}),
```

Within 60s, a remount or re-render doesn't re-fetch. After 60s, the next mount
that needs the data triggers a re-fetch.

## Polling

```ts
getAlerts: query({
  async execute() { /* ... */ },
  poll: 10, // re-fetch every 10s while a subscriber exists
}),
```

## Auto-triggering on a domain action

To fire a query in response to a domain action, declare a workflow
that listens for the action and calls the query through `ctx.query`:

```ts
import { createAction } from '@reduxjs/toolkit';

const pageEntered = createAction<{ postId: string }>('postPage/pageEntered');

createApi({
  name: 'posts',
  queries: (query) => ({
    getPost: query({
      async execute({ postId }: { postId: string }) {
        const data = await fetchPost(postId);
        return { data };
      },
      cache: 60,
    }),
  }),
  workflows: (workflow) => ({
    onPageEntered: workflow({
      listen: pageEntered.match,
      *execute({ postId }: { postId: string }, { query }) {
        yield* query('getPost', { postId });
      },
    }),
  }),
});
```

Dispatching `pageEntered({ postId: 'p1' })` runs the workflow, which
populates the `getPost` cache entry. See [Workflows](/docs/workflows).

## Garbage collection (`keepUnusedDataFor`)

When the last subscriber unmounts, the entry lingers for `keepUnusedDataFor`
seconds (default `60`) then gets removed from the cache. A new subscribe
before the timer elapses cancels the removal. Same name and semantics as
RTK Query.

```ts
getUser: query({
  async execute({ id }: { id: string }) { /* ... */ },
  keepUnusedDataFor: 300,  // 5 minutes
}),

// Special values:
// 0         — remove immediately on last unsubscribe
// Infinity  — never remove
```

## Manual cache control

Each api exposes two top-level helpers for invalidating cache from anywhere
(reducers, sagas, event handlers — outside of `useQuery`/`useMutation`):

```ts
// Mark a single entry stale — next access re-fetches.
store.dispatch(api.invalidateCache({ cacheKey }));

// Wipe every entry for this api.
store.dispatch(api.resetCache());
```

To build a `cacheKey` from args:

```ts
import { buildCacheKey } from '@redux-workflow/core';

const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });
```

## `refetch()`

`refetch()` is a **force refetch**: it always re-runs the network call, even
when the cached data is fresh. Same as RTK Query's `refetch()`.

```tsx
const { data, refetch } = useQuery(api.queries.getUser, { id });

<button onClick={refetch}>Refresh</button>;
```

## `refetchOnMountOrArgChange`

Force a refetch when the component mounts or when the args change. Same name
and semantics as RTK Query.

```tsx
// Always refetch on mount, even within the cache window.
useQuery(api.queries.getUser, { id }, { refetchOnMountOrArgChange: true });

// Or: refetch only if the cached entry is older than 30 seconds.
useQuery(api.queries.getUser, { id }, { refetchOnMountOrArgChange: 30 });
```

Defaults to `false` — the hook respects the query's `cache` window.

## `skip`

Don't trigger, don't subscribe — useful for conditional fetching:

```tsx
useQuery(api.queries.getUser, { id }, { skip: !id });
```

## `useLazyQuery` — fetch on demand

No auto-fetch on mount; trigger manually.

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

## `httpRequest` — fetch-based `execute` adapter

When your `execute` is just "call an HTTP endpoint, return the body,"
`httpRequest(options)` builds the function for you. It fits directly as
`execute:` on any query or mutation.

```ts
import { httpRequest } from '@redux-workflow/core';

getUser: query({
  execute: httpRequest<User, { id: string }>({
    baseUrl: 'https://api.example.com',
    url: ({ id }) => `/users/${id}`,
  }),
}),

createUser: mutation({
  execute: httpRequest<User, { name: string }>({
    baseUrl: 'https://api.example.com',
    url: '/users',
    method: 'POST',
    body: (args) => args, // plain object → JSON + Content-Type
  }),
}),
```

### Options

| Field                    | Type                                                       | Notes                                                                                 |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `url`                    | `string \| (args) => string`                               | Absolute URL bypasses `baseUrl`.                                                      |
| `baseUrl`                | `string`                                                   | Prepended to relative `url`.                                                          |
| `method`                 | `'GET' \| 'POST' \| 'PUT' \| ...`                          | Defaults to `'GET'`.                                                                  |
| `body`                   | `unknown \| (args) => unknown`                             | Plain objects are JSON-stringified; `FormData`/`URLSearchParams`/`Blob` pass through. |
| `headers`                | `Record<string,string> \| (args) => Record<string,string>` | Merged with auto-set `Content-Type`.                                                  |
| `params`                 | `Record<string, ParamValue> \| (args) => …`                | Serialized as query string; `null`/`undefined` dropped.                               |
| `prepareHeaders`         | `(headers: Headers, ctx) => Headers`                       | Runs last; typical use is reading an auth token out of `ctx.getState()`.              |
| `transformResponse`      | `(parsed, args) => TResult`                                | Map parsed body before `{ data }`.                                                    |
| `transformErrorResponse` | `(parsed, status, args) => unknown`                        | Shape the error before `{ error }`.                                                   |
| `fetchFn`                | `typeof fetch`                                             | Override for tests or custom transports.                                              |

### Return shape

- 2xx → `{ data: <parsed body or transformResponse(parsed, args)> }`
- non-2xx → `{ error: { status, data } }` (or `transformErrorResponse(...)`)
- fetch rejection → `{ error: 'NETWORK_ERROR' }`

**No factory**: there's no `createHttpRequest({ baseUrl })`. Wrap `httpRequest`
yourself when you want to share config (base URL, auth headers) across
endpoints — a small closure works well and preserves type inference:

```ts
import { httpRequest, type HttpRequestOptions } from '@redux-workflow/core';

export function baseHttpRequest<TResult = unknown, TArgs = void>(
  options: HttpRequestOptions<TResult, TArgs>,
) {
  return httpRequest<TResult, TArgs>({
    baseUrl: 'https://api.example.com',
    prepareHeaders: (h, { getState }) => {
      const token = selectToken(getState());
      if (token) h.set('Authorization', `Bearer ${token}`);
      return h;
    },
    ...options, // per-endpoint options win over factory defaults
  });
}

// Endpoints just supply the per-call bits:
getUser: query({
  execute: baseHttpRequest<User, { id: string }>({
    url: ({ id }) => `/users/${id}`,
  }),
}),

renameUser: mutation({
  execute: baseHttpRequest<User, { id: string; name: string }>({
    url: ({ id }) => `/users/${id}`,
    method: 'PATCH',
    body: ({ name }) => ({ name }),
  }),
}),
```

## `refetchOnFocus` / `refetchOnReconnect`

Flag a query to refetch every currently-**subscribed** cache entry when the app
regains focus or the network comes back online:

```ts
getNotifications: query({
  refetchOnFocus: true,
  refetchOnReconnect: true,
  async execute({ userId }: { userId: string }) {
    return { data: await fetchNotifications(userId) };
  },
}),
```

Unsubscribed entries are left alone (they'll refetch on the next `useQuery`
mount anyway). Per-args caching is respected — each subscribed args
combination refetches independently.

**Wire the platform signals** via `setupListeners(dispatch, platformWiring?)`.
Browser is the default:

```ts
import { setupListeners } from '@redux-workflow/core';
const cleanup = setupListeners(store.dispatch); // focus / blur / online / offline
```

React Native supplies its own bridge (typically `AppState` + `NetInfo`):

```ts
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

setupListeners(store.dispatch, (_, { onFocus, onFocusLost, onOnline, onOffline }) => {
  const appState = AppState.addEventListener('change', (s) => {
    s === 'active' ? onFocus() : onFocusLost();
  });
  const unsubNet = NetInfo.addEventListener((s) => (s.isConnected ? onOnline() : onOffline()));
  return () => {
    appState.remove();
    unsubNet();
  };
});
```

If you drive the signals yourself (tests, custom saga), dispatch the global
action creators directly:

```ts
import { focusEvent, onlineEvent } from '@redux-workflow/core';
store.dispatch(focusEvent());
store.dispatch(onlineEvent());
```

Every api's rootSaga watches these and fans out refetches.

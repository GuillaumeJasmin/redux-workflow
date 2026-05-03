---
title: Workflows
---

# Workflows

Workflows are stateful async orchestration. They can listen to actions, call
queries/mutations, push events, open long-lived connections, and cancel
cleanly.

## Basic workflow

```ts
const api = createApi({
  name: 'checkout',
  workflows: (workflow) => ({
    pay: workflow({
      *execute({ amount }: { amount: number }) {
        // ... multi-step async work
        return { confirmationId: '...' };
      },
    }),
  }),
});
```

Trigger manually from a component:

```tsx
const [pay, { isLoading, isSuccess, data }] = useWorkflow(api.workflows.pay);

<button onClick={() => pay({ amount: 42 })}>Pay</button>;
```

## `listen` — auto-run on a domain action

```ts
const pageEntered = createAction<{ userId: string }>('dashboard/entered');

workflows: (workflow) => ({
  loadDashboard: workflow({
    listen: pageEntered,
    *execute({ userId }) { /* ... */ },
  }),
}),
```

Multiple listen actions: pass an array.

## `dismiss` — cancel on a domain action

```ts
const pageLeft = createAction('dashboard/left');

watchInactivity: workflow({
  listen: pageEntered,
  dismiss: pageLeft,   // or [pageLeft, sessionExpired]
  *execute({ userId }) {
    try {
      yield* delay(60_000);
      // ... inactivity modal logic
    } finally {
      // runs on cancellation too
    }
  },
}),
```

## `cancelOnUnmount` — React-driven cancel

```tsx
const [trigger, { isLoading }] = useWorkflow(api.workflows.publishPost, {
  cancelOnUnmount: true,
});
```

On unmount, the hook dispatches the workflow's internal cancel action. The
workflow's `finally` block runs.

## Execute context

Inside a workflow's `execute`, the second argument is the typed context:

```ts
*execute({ postId }, { query, mutate, getCache, patchCache, select, put }) {
  // type-checked against this api's queries + mutations
  const postResult = yield* query('getPost', { id: postId });
  if ('error' in postResult) throw new Error('post fetch failed');
  const post = postResult.data;

  const cachedComments = yield* getCache('getComments', { postId });

  if (!post.published) throw new Error('not published');

  const notifyResult = yield* mutate('markPublished', { postId });
  if ('error' in notifyResult) throw new Error('notify failed');

  yield* put(domainEvent({ postId }));
}
```

- `query(nameOrInstance, args)` — dispatch the query + wait for its
  resolution (or return cached data if fresh). Accepts either a name
  (own api) or a query instance (any api — see
  [Cross-api access](#cross-api-access)). Returns `{ data } | { error }`.
- `mutate(nameOrInstance, args)` — dispatch the mutation + wait for its
  resolution. Same name/instance overload as `query`. Returns
  `{ data } | { error }`.
- `getCache(nameOrInstance, args)` — read the current cache entry's
  data (or `null`).
- `patchCache(nameOrInstance, args, dataOrUpdater)` — write directly into
  the cache entry. Accepts a value or `(previous) => next`.
- `select(selector)` — `yield* select(...)` forwarded from redux-saga.
- `put(action)` — `yield* put(...)` forwarded from redux-saga.

The workflows builder callback ctx exposes typed access to the api's
slice:

- `selectors` — bound slice selectors, ready to use with `select`.
- `actions` — typed action creators from the slice's `reducers`. These
  are private; they only exist on this ctx, not on the public api.

```ts
workflows: (workflow, { selectors, actions }) => ({
  toggle: workflow({
    *execute(_, { select, put }) {
      const isOpen = yield* select(selectors.selectIsOpen);
      if (!isOpen) yield* put(actions.open());
    },
  }),
});
```

`actions.x()` is the canonical way to update slice state from a
workflow when the action has no other meaning. For state changes
_caused by_ something else (mutation lifecycle, external action), use
the slice's `extraReducers` instead — see [API slice](/docs/api-slice).

## Cross-api access

`query` / `mutate` / `getCache` / `patchCache` accept either a **name**
(your own api's queries/mutations) or an **instance** (any api you can
import). The instance form is how you reach a shared api like an
authentication service from inside another api's workflow.

```ts
// ./auth-api.ts
export const authApi = createApi({
  name: 'auth',
  queries: (query) => ({
    getCurrentUser: query({
      execute: httpRequest<{ id: string; role: 'admin' | 'user' }, void>({
        url: '/me',
      }),
    }),
  }),
  mutations: (mutation) => ({
    refreshToken: mutation({
      execute: httpRequest<{ token: string }, void>({
        method: 'POST',
        url: '/auth/refresh',
      }),
    }),
  }),
});
```

```ts
// ./billing-api.ts
import { authApi } from './auth-api';

export const billingApi = createApi({
  name: 'billing',
  queries: (query) => ({
    getInvoice: query({ execute: ... }),
  }),
  workflows: (workflow) => ({
    syncInvoice: workflow({
      *execute({ args }: { args: { id: string } }, { query, mutate }) {
        // Own api — string form (names autocomplete from QDefs).
        const invoice = yield* query('getInvoice', { id: args.id });
        if ('error' in invoice) return;

        // External api — instance form. Result is fully typed via
        // the instance's own generics.
        const user = yield* query(authApi.queries.getCurrentUser, undefined);
        if ('error' in user) return;
        if (user.data.role !== 'admin') return;

        // External mutation.
        const refreshed = yield* mutate(authApi.mutations.refreshToken, undefined);
        // ...
      },
    }),
  }),
});
```

Cache helpers work the same way:

```ts
*execute(_, { getCache, patchCache }) {
  // Read external cache without triggering a fetch.
  const cachedUser = yield* getCache(authApi.queries.getCurrentUser, undefined);

  // Write into external cache (e.g., from a websocket frame).
  yield* patchCache(authApi.queries.getCurrentUser, undefined, (prev) =>
    prev ? { ...prev, role: 'admin' } : prev,
  );
}
```

Listening to an external api's lifecycle and matching it from a slice
already work today — the instance overload doesn't change that:

```ts
workflows: (workflow) => ({
  onTokenRefresh: workflow({
    listen: authApi.mutations.refreshToken.on.succeeded,
    *execute({ data }) { /* data is typed: { token: string } */ },
  }),
}),
```

For testing apis that depend on others, see
[Mocking dependent apis](/docs/testing#mocking-dependent-apis).

## Referencing queries / mutations at the def level

The workflow builder callback receives instance refs — use them for `listen`
and `dismiss`:

```ts
workflows: (workflow, { queries, mutations }) => ({
  revalidateOnCreate: workflow({
    listen: mutations.createPost.on.succeeded,
    *execute({ args, data, mutationKey }) {
      // react to successful mutation
    },
  }),
}),
```

## Streaming pattern

Open a long-lived connection when the first subscriber arrives; close it when
the last one leaves; push incoming data into the cache.

```ts
const api = createApi({
  name: 'chat',
  queries: (query) => ({
    messages: query({
      execute: httpRequest<Message[], { roomId: string }>({
        url: ({ roomId }) => `/rooms/${roomId}/messages`,
      }),
      keepUnusedDataFor: Infinity, // keep while streaming
    }),
  }),

  workflows: (workflow, { queries }) => ({
    streamMessages: workflow({
      listen: queries.messages.firstSubscribe,
      dismiss: queries.messages.lastUnsubscribe,
      *execute({ args, cacheKey }: { args: { roomId: string }; cacheKey: string }, { patchCache }) {
        const socket = new WebSocket(`/rooms/${args.roomId}/stream`);
        const channel = eventChannelFromSocket(socket);

        try {
          while (true) {
            const message = yield* take(channel);
            yield* patchCache('messages', args, (previous) => [...(previous ?? []), message]);
          }
        } finally {
          channel.close();
          socket.close();
        }
      },
    }),
  }),
});
```

The workflow:

1. Starts when the first `useQuery(messages, {roomId})` mount subscribes.
2. Receives `args` from the subscribe action — same shape as the query's args.
3. `patchCache` writes directly to the cache entry; subscribers re-render.
4. `finally` closes the socket when the last subscriber unmounts.

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

- `query(name, args)` — dispatch the query + wait for its resolution (or
  return cached data if fresh). Returns `{ data } | { error }`.
- `mutate(name, args)` — dispatch the mutation + wait for its resolution.
  Returns `{ data } | { error }`.
- `getCache(name, args)` — read the current cache entry's data (or `null`).
- `patchCache(name, args, dataOrUpdater)` — write directly into the cache
  entry. Accepts a value or `(previous) => next`.
- `select(selector)` — `yield* select(...)` forwarded from redux-saga.
- `put(action)` — `yield* put(...)` forwarded from redux-saga.

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

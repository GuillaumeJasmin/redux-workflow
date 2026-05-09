---
title: Mutations
---

# Mutations

Mutations are writes. They invalidate the cache and can run optimistic updates.

## Basic mutation

```ts
import { createApi, httpRequest } from '@redux-workflow/core';

const api = createApi({
  name: 'posts',
  mutations: (mutation) => ({
    createPost: mutation({
      execute: httpRequest<Post, { title: string; body: string }>({
        url: '/posts',
        method: 'POST',
        body: (args) => args,
      }),
    }),
  }),
});
```

`httpRequest` is the built-in fetch adapter — see
[`httpRequest`](/docs/queries#httprequest--fetch-based-execute-adapter) on the
queries page for the full options table. You can also pass a plain `async`
function (or a generator) as `execute` when you need more control.

Use in a component:

```tsx
function NewPost() {
  const [createPost, { isLoading, isSuccess, data, error }] = useMutation(api.mutations.createPost);

  return (
    <button onClick={() => createPost({ title: 'hi', body: '...' })}>
      {isLoading ? 'Saving…' : 'Create'}
    </button>
  );
}
```

## `invalidates` — cache invalidation by query name

```ts
mutations: (mutation) => ({
  deletePost: mutation({
    execute: httpRequest<null, { id: string }>({
      url: ({ id }) => `/posts/${id}`,
      method: 'DELETE',
    }),
    invalidates: ['listPosts'], // all cached args combinations of listPosts refetch
  }),
}),
```

`invalidates` is type-checked against the declared queries — typos are caught
at compile time.

## Auto-triggering on a domain action

To fire a mutation in response to a domain action, declare a workflow
that listens for the action and calls the mutation through `ctx.mutate`:

```ts
const alertAcknowledged = createAction<{ alertId: string }>('alerts/ack');

createApi({
  name: 'alerts',
  mutations: (mutation) => ({
    acknowledgeAlert: mutation({
      execute: httpRequest<null, { alertId: string }>({
        url: ({ alertId }) => `/alerts/${alertId}/ack`,
        method: 'POST',
      }),
      invalidates: ['getAlerts'],
    }),
  }),
  workflows: (workflow) => ({
    onAlertAcknowledged: workflow({
      listen: alertAcknowledged.match,
      *execute({ alertId }: { alertId: string }, { mutate }) {
        yield* mutate('acknowledgeAlert', { alertId });
      },
    }),
  }),
});
```

## Optimistic updates — `onStart` + `onError`

```ts
mutations: (mutation) => ({
  likePost: mutation({
    execute: httpRequest<Post, { postId: string }>({
      url: ({ postId }) => `/posts/${postId}/like`,
      method: 'POST',
    }),

    *onStart({ postId }, { getCache, patchCache }) {
      const previous = yield* getCache('getPost', { id: postId });
      yield* patchCache('getPost', { id: postId }, (prev) => ({
        ...(prev ?? { id: postId }),
        liked: true,
      }));
      return previous; // handed to onError on failure
    },

    *onError(previous, { postId }, { patchCache }) {
      if (previous) {
        yield* patchCache('getPost', { id: postId }, previous);
      }
    },
  }),
}),
```

`onStart` runs before `execute`. Its return value is remembered. If `execute`
returns `{ error }` or throws, `onError` is called with that value so you can
roll back.

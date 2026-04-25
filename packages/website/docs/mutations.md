---
title: Mutations
---

# Mutations

Mutations are writes. They invalidate the cache and can run optimistic updates.

## Basic mutation

```ts
const api = createApi({
  name: 'posts',
  mutations: (mutation) => ({
    createPost: mutation({
      async execute(args: { title: string; body: string }) {
        const response = await fetch('/posts', {
          method: 'POST',
          body: JSON.stringify(args),
        });
        const data = await response.json();
        return { data };
      },
    }),
  }),
});
```

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
    async execute({ id }: { id: string }) {
      await fetch(`/posts/${id}`, { method: 'DELETE' });
      return { data: null };
    },
    invalidates: ['listPosts'], // all cached args combinations of listPosts refetch
  }),
}),
```

`invalidates` is type-checked against the declared queries — typos are caught
at compile time.

## `listen` on mutations

Like queries, mutations can auto-fire on a domain action:

```ts
const alertAcknowledged = createAction<{ alertId: string }>('alerts/ack');

acknowledgeAlert: mutation({
  listen: alertAcknowledged,
  async execute({ alertId }) {
    await fetch(`/alerts/${alertId}/ack`, { method: 'POST' });
    return { data: null };
  },
  invalidates: ['getAlerts'],
}),
```

## Optimistic updates — `onStart` + `onError`

```ts
mutations: (mutation) => ({
  likePost: mutation({
    async execute({ postId }: { postId: string }) {
      const data = await fetch(`/posts/${postId}/like`, { method: 'POST' });
      return { data };
    },

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

---
title: Architecture & circular imports
sidebar_label: Architecture
---

# Architecture & circular imports

## Intra-feature is safe

Within one feature, a slice **can** listen to its own api's actions via
`extraReducers`, and the api **can** read slice state via `selectSlice`:

```ts
// posts.slice.ts
import { postsApi } from './posts.api';

createSlice({
  extraReducers: (builder) => {
    builder.addMatcher(
      postsApi.mutations.publishPost.on.pending.match,
      (state) => { /* clear draft, mark optimistic */ }
    );
  },
});

// posts.api.ts — same feature, OK
publishPost: mutation({
  *execute() {
    const { draft } = yield* select(postsSlice.selectSlice);
    // ...
  },
}),
```

Why it works: `posts.api.ts` doesn't access `postsSlice` at module load — only
inside generator bodies which run later. By the time `posts.slice.ts`'s
`createSlice(...)` evaluates its `extraReducers` callback, `postsApi` is fully
loaded.

## Cross-feature listening: pick one recipe

When a slice in feature A wants to react to events from feature B's api,
**do NOT import feature B's api directly into A's slice**. It almost always
closes a cycle through selectors (A.slice → B.api → B's saga bodies →
selectors → A.selectors → A.slice).

### Recipe 1 — plain domain action (default)

The api dispatches a plain action defined in a neutral module. The foreign
slice listens for that action.

```ts
// actions.ts (or a neutral events file)
export const authenticatedUserUnauthorized = createAction('auth/unauthorized');

// posts.api.ts
fetchPost: (query({
  *execute({ id }) {
    try {
      const data = yield* call(fetchPost, { id });
      return { data };
    } catch (error) {
      if (error instanceof AuthenticatedUserNotAuthorizedError) {
        yield* put(authenticatedUserUnauthorized());
        return { error: 'AUTHENTICATED_USER_NOT_AUTHORIZED' };
      }
      return { error };
    }
  },
}),
  // authentication.slice.ts
  builder.addMatcher(authenticatedUserUnauthorized.match, (state) => {
    state.user = null;
  }));
```

**Use this as the default.** No cycle, no imports between features, and the
action name documents the contract.

### Recipe 2 — lazy matcher (action-type string)

If you want to observe an api's lifecycle action directly _without_ the api
owner cooperating, write the matcher as an inline function that uses the
action type string:

```ts
// authentication.slice.ts — no postsApi import
builder.addMatcher(
  (action): action is PayloadAction<{ error: string }> =>
    action.type === 'postsApi/queries/fetchPost/failed' &&
    (action as any).payload?.error === 'AUTHENTICATED_USER_NOT_AUTHORIZED',
  (state) => {
    state.user = null;
  },
);
```

The matcher runs at dispatch time — no api import needed. Trade-off:
**fragile to renames** (action type strings aren't type-checked). Only use
when you don't control the owning api.

### Recipe 3 — workflow relay

If the reacting logic is non-trivial (multiple steps, async work), add a
workflow **in the owning feature** that translates the lifecycle event into a
clean domain action:

```ts
// posts.api.ts (inside the same createApi that owns fetchPost)
workflows: (workflow, { queries }) => ({
  relayAuthFailure: workflow({
    listen: queries.fetchPost.on.failed,
    *execute({ error }, { put }) {
      if (error === 'AUTHENTICATED_USER_NOT_AUTHORIZED') {
        yield* put(authenticatedUserUnauthorized());
      }
    },
  }),
}),
```

The workflow runs inside the owning feature (no cycle) and translates to a
neutral domain action. The foreign slice listens to the domain action.

## Summary

| Situation                                      | Pattern                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Slice listens to its own feature's api         | Direct matcher on `api.queries.X.on.*.match` — intra-feature is safe |
| Foreign slice listens to an api event          | Plain domain action (Recipe 1)                                       |
| Foreign slice can't get the owner to cooperate | Lazy action-type matcher (Recipe 2)                                  |
| Reaction logic is multi-step                   | Workflow relay in the owning feature (Recipe 3)                      |

## Why slices shouldn't import another feature's api

Modulo cycle formation: a feature's api typically uses selectors from other
features (to read cross-cutting state like the authenticated user). Those
selectors re-export from slice modules. If a foreign slice then imports the
api, you get:

```
foreign.slice → api → neutral selectors → owning.slice → owning.selectors → foreign.slice (top-level destructure) → 💥 TDZ
```

The TDZ failure is specifically triggered by top-level
`const { x } = someSlice.selectors` destructures in `*.selectors.ts` files.
Avoiding the cross-feature import prevents the chain entirely.

---
title: API slice
---

# API slice

Co-located domain state for an api — without standing up a separate
`createSlice` and registering a second reducer in your store.

```ts
import { createApi } from '@redux-workflow/core';

const newsletterApi = createApi({
  name: 'newsletter',
  mutations: (mutation) => ({
    subscribe: mutation({ execute: ... }),
  }),
  slice: (slice, { mutations }) =>
    slice({
      initialState: { subscribed: false },
      extraReducers: (builder) => {
        builder.addMatcher(mutations.subscribe.on.succeeded.match, (state) => {
          state.subscribed = true;
        });
      },
      selectors: {
        selectSubscribed: (local) => local.subscribed,
      },
    }),
});

newsletterApi.selectors.selectSubscribed(store.getState()); // → boolean
```

## When to use it

Use the api's `slice` for state that belongs to the api's domain — UI
flags, draft data, per-session counters — anything you'd otherwise have
created an external `createSlice` for. Don't use it as a global state
bag; one slice per api keeps the boundary clean.

## Shape

```ts
slice: (slice, ctx) => slice({
  initialState,            // any value
  reducers?,               // private writers — workflow ctx only
  extraReducers?,          // (builder) => void — react to actions
  selectors?,              // { name: (local, root) => any }
})
```

The slice is a builder callback (mirrors `queries` / `mutations` /
`workflows`). The first arg `slice` is a typed builder you call with
your config — it's identity at runtime, but its job is to lock the
slice's TypeScript generics at the call site so `extraReducers` and
`selectors` are properly typed.

The second arg `ctx` exposes the api's `queries` and `mutations`
instance maps for use in `extraReducers` matchers. **Workflows are not
in the slice ctx** — slice runs _before_ workflows in the dependency
chain so that workflows can read slice state via their own ctx. To
listen to a workflow's lifecycle from a slice, either:

- Reference `api.workflows.x.on.succeeded.match` via api self-reference
  (lint may warn; works at runtime).
- Have the workflow dispatch a domain event the slice listens to (the
  bridge pattern).

## Public surface vs private writers

| Surface                | Public |  Private   |
| ---------------------- | :----: | :--------: |
| `api.selectors.*`      |   ✅   |            |
| `api.reducer`          |   ✅   |            |
| `api.actions`          |        | _no field_ |
| Workflow ctx `actions` |        |     ✅     |

`slice.reducers` action creators are generated but **never exposed on
the api**. The only ergonomic dispatch site is the workflow ctx's
`actions` field. This keeps workflows as the sole writers — readers
(UI, selectors, other slices) can't bypass them.

## State changes — two paths

| Need                                                              | Use                                        |
| ----------------------------------------------------------------- | ------------------------------------------ |
| The workflow needs to set this state. Nothing else dispatches it. | `reducers.x` → `yield* put(actions.x())`   |
| Something _outside_ this slice causes the change                  | `extraReducers` matching the source action |

Choose by **intent**, not syntax. If you'd be the only one dispatching the
action, use `reducers`. If you're listening to something that already
exists (a mutation lifecycle, an external action, a `createAction`
event), use `extraReducers`.

## `reducers` — private state writers

```ts
slice: (slice) =>
  slice({
    initialState: { isOpen: false, email: '' },
    reducers: {
      open: (state, _action: PayloadAction<void>) => {
        state.isOpen = true;
      },
      close: (state, _action: PayloadAction<void>) => {
        state.isOpen = false;
      },
      setEmail: (state, action: PayloadAction<string>) => {
        state.email = action.payload;
      },
    },
  }),
workflows: (workflow, { actions }) => ({
  open: workflow({
    *execute(_, { put }) {
      yield* put(actions.open());
    },
  }),
}),
```

Reducer signature is the canonical RTK shape: `(state, action: PayloadAction<P>) => void`. For no-payload reducers, write `_action: PayloadAction<void>` explicitly — same convention as `createSlice`.

State is contextually typed from `initialState` (immer enabled). Action payloads are inferred per reducer.

## `extraReducers` — react to outside actions

Use when the trigger is something other than a workflow setter:

- This api's queries / mutations lifecycle:
  `queries.x.on.succeeded.match`, `mutations.x.on.succeeded.match` (via
  the slice ctx).
- Workflow lifecycle: dispatch a domain event from the workflow that
  the slice listens to, or reference `api.workflows.x.on.succeeded.match`
  via api self-reference.
- Internal events: `createAction` declared at module scope (not exported).
- External actions: imported action creators from elsewhere
  (`userLoggedOut`, etc.).

```ts
slice: (slice, { mutations }) =>
  slice({
    initialState: { subscribed: false, draftEmail: '', isOpen: false },
    extraReducers: (builder) => {
      builder
        // 1. This api's mutation lifecycle
        .addMatcher(mutations.subscribe.on.succeeded.match, (state) => {
          state.subscribed = true;
          state.isOpen = false;
        })
        // 2. Internal event
        .addCase(modalOpened, (state) => { state.isOpen = true; })
        // 3. External action
        .addCase(userLoggedOut, (state) => {
          state.subscribed = false;
          state.draftEmail = '';
        });
    },
  }),
```

## Selectors — `(localState, rootState) => T`

Selectors get both the slice's local state and the root state.

```ts
selectors: {
  selectIsOpen: (local) => local.isOpen,
  selectIsOpenForUser: (local, root) => {
    const user = selectUser(root);
    return user.canOpen && local.isOpen;
  },
},
```

On the api they're exposed bound to root state:

```ts
api.selectors.selectIsOpen(store.getState()); // → boolean
api.selectors.selectIsOpenForUser(store.getState()); // → boolean
```

`local` is contextually typed; `root` defaults to `any` (matches RTK
ergonomics).

## Why the `slice(...)` builder?

The slice's TypeScript generics (`TInitial` for the state, `TSelectors`
for the selectors map) are inferred from the config you pass. If we
inferred them at the `createApi` call site, TypeScript struggles when
the callback also has a typed `ctx` parameter — it commits to the
parameter shape and skips return-type inference.

Wrapping the config in a `slice(...)` call moves the inference to its
own site. The result is fully typed `extraReducers` and `selectors` even
when ctx access is used.

This is the same pattern as `queries` / `mutations` / `workflows`:
each callback receives a builder symbol (`query`, `mutation`,
`workflow`, `slice`) used at the per-definition call site to lock
generics.

## State location in the store

When `slice` is configured, the api's state subtree adds a `slice` key:

```
state[api.reducerPath] = {
  queries: { ... },
  mutations: { ... },
  workflows: { ... },
  slice: TInitial,
}
```

`api.selectors.x` already knows where to look.

## Reading slice state from a workflow

```ts
workflows: (workflow) => ({
  toggle: workflow({
    *execute(_, { select, put }) {
      const isOpen = yield* select(api.selectors.selectIsOpen);
      if (!isOpen) yield* put(opened());
    },
  }),
}),
```

## Reading slice state from React

```tsx
import { useSelector } from 'react-redux';

const isOpen = useSelector(newsletterApi.selectors.selectIsOpen);
```

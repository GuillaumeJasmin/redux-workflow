---
title: Testing
---

# Testing

Test helper for APIs built with `createApi`. Gives you a fresh store + saga
task per test, a stable `dispatch`/`flush`/`then` surface, and chainable
**Object Assertions** for cache entries, mutations, workflows, and the
companion slice.

```ts
import { setupApiTest } from '@redux-workflow/core/testing';
```

## Quick start — BDD scenario

```ts
describe('post page', () => {
  let fakePostsGateway: FakePostsGateway;

  const { dispatch, flush, then, reset } = setupApiTest({
    api: postsApi,
    slice: postsSlice,
  });

  beforeEach(() => {
    reset(); // fresh store + saga
    fakePostsGateway = new FakePostsGateway();
    registry.set(postsGatewayToken, fakePostsGateway);
  });

  it('fetches the post when the user enters the page', async () => {
    // Given
    fakePostsGateway.fetchPost.mockResolvedValue(somePost);

    // When
    dispatch(pageEntered({ postId: 'abc' }));
    await flush();

    // Then
    then.query(postsApi.queries.fetchPost, { id: 'abc' }).isFulfilled().hasData(somePost);

    then.slice().matches({ post: somePost });
  });
});
```

## Why `reset()` and not an auto-registered `beforeEach`?

The helper is test-runner-agnostic — it never touches `beforeEach` /
`afterEach` itself (which would tie it to vitest/jest). You wire `reset` into
whichever lifecycle hook your framework provides.

Internally `reset()` cancels the previous root saga task, clears the captured
action log, and rebuilds a fresh store + saga middleware. The returned
`dispatch`/`getState`/`flush`/`then` are **stable closures** that read the
_current_ store — so destructuring at describe-scope keeps working across every
reset.

`setupApiTest` itself calls `reset()` once during initialization so the first
test doesn't need to call it. The normal pattern is still `beforeEach(reset)`.

## API

```ts
setupApiTest({ api, slice? }) => {
  dispatch:             (action) => action,
  getState:             () => RootState,
  flush:                () => Promise<void>,
  reset:                () => void,
  getDispatchedActions: () => Action[],
  then: {
    query(instance, args)       : QueryAssertion,
    mutation(instance)          : MutationAssertion,
    workflow(instance)          : WorkflowAssertion,
    slice()                     : SliceAssertion,  // only if `slice` was passed
    hasDispatchedAction(matcher): void,
    hasNoDispatchedAction(matcher): void,
  }
}
```

`slice` is optional. Pass it when the API coexists with a companion slice
whose state you want to assert against — `then.slice()` is only defined when a
slice was provided; otherwise the field is absent.

## Assertions (Object Assertion pattern)

All assertion methods throw through vitest's `expect`, so failing test output
points at the actual expected/actual diff — not at the helper. All methods
return `this`, so they chain.

### `then.query(instance, args)`

```ts
then
  .query(api.queries.fetchPost, { id: 'abc' })
  .isFulfilled() // status check
  .hasData(expectedPost) // toEqual on entry.data
  .hasPartialData({ id: 'abc' }); // toMatchObject
```

| Method                     | Asserts                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `.isUninitialized()`       | no cache entry exists (or entry with uninitialized status) |
| `.isPending()`             | `entry.status === 'pending'`                               |
| `.isFulfilled()`           | `entry.status === 'fulfilled'`                             |
| `.isRejected()`            | `entry.status === 'rejected'`                              |
| `.hasData(expected)`       | `entry.data` deep-equals `expected` (`toEqual`)            |
| `.hasPartialData(partial)` | `entry.data` matches `partial` (`toMatchObject`)           |
| `.hasError(expected)`      | `entry.error` equals `expected`                            |
| `.raw()`                   | returns the underlying `CacheEntry \| undefined`           |

### `then.mutation(instance)`

Same surface as query, plus `.isIdle()` for "never fired". `hasData` is
`toEqual`, `hasPartialData` is `toMatchObject`.

### `then.workflow(instance)`

Same surface as mutation.

### `then.slice()`

```ts
then.slice().equals(fullExpectedState); // toEqual
then.slice().matches({ post: somePost }); // toMatchObject
then.slice().state; // raw, unwrapped
```

## Gateways

Gateway stubbing is **outside the helper's scope** on purpose — wire your
gateway mocks in your own `beforeEach` using the project's `registry`. Keeping
this out means the helper has nothing project-specific baked in:

```ts
beforeEach(() => {
  reset();
  registry.set(postsGatewayToken, new FakePostsGateway());
});
```

## Dispatched-action assertions

Prefer `then.hasDispatchedAction` / `then.hasNoDispatchedAction` over raw
inspection — they give you clean vitest diffs on failure.

```ts
dispatch(api.mutations.renamePost.trigger({ id: 'abc', title: 'new' }));
await flush();

// Match any dispatched action of that type (pass the action creator).
then.hasDispatchedAction(api.mutations.renamePost.on.succeeded);

// Match a specific instance: type + payload deep-equality.
then.hasDispatchedAction(api.mutations.renamePost.trigger({ id: 'abc', title: 'new' }));

// Absence assertion.
then.hasNoDispatchedAction(api.queries.fetchPost.trigger);
```

Argument discrimination:

| You pass…                                             | It matches…                                  |
| ----------------------------------------------------- | -------------------------------------------- |
| An action creator — `api.mutations.x.trigger`         | any dispatched action with that `.type`      |
| An action object — `api.mutations.x.trigger(payload)` | type + payload deep-equal (`toContainEqual`) |

### `getDispatchedActions()`

Escape hatch returning a snapshot of every action that hit the store — useful
for custom assertions (ordering, counts, etc.) beyond presence / absence.

```ts
const types = getDispatchedActions().map((a) => a.type);
```

## Mocking dependent apis

When the api under test imports another api (e.g. a shared `authApi`),
`mockApi(...)` lets you simulate that api's behaviour without depending
on its implementation. Pass the mocks to `setupApiTest({ mocks })`.

```ts
import { setupApiTest, mockApi } from '@redux-workflow/core/testing';
import { billingApi } from './billing-api';
import { authApi } from './auth-api';

const harness = setupApiTest({
  api: billingApi,
  mocks: [
    mockApi(authApi, {
      queries: {
        // Each mock replaces the real `execute`. Return `{ data }` for
        // success, `{ error }` for failure.
        getCurrentUser: () => ({ data: { id: '1', role: 'admin' as const } }),
      },
      mutations: {
        refreshToken: () => ({ data: { token: 'fake-token' } }),
      },
    }),
  ],
});

harness.dispatch(billingApi.workflows.syncInvoice.trigger({ invoiceId: 'inv-1' }));
await harness.flush();

harness.then.workflow(billingApi.workflows.syncInvoice).isFulfilled();
harness.then.query(authApi.queries.getCurrentUser, undefined).hasData({ id: '1', role: 'admin' });
```

### How it works

`mockApi` returns a spec; `setupApiTest`:

1. Mounts each mocked api's **real reducer** at its own
   `reducerPath` — so cache state lives where production code expects it.
2. Skips the mocked api's `rootSaga` entirely. In its place, runs an
   **interceptor saga** that:
   - Listens for each mocked query/mutation's `trigger` action.
   - Dispatches `on.pending` then `on.succeeded` (or `on.failed`) with
     the result your mock function returned.

The api under test (`billingApi`) is unchanged. Its workflow still calls
`yield* query(authApi.queries.getCurrentUser, undefined)`; the
interceptor produces the response. **No production code is modified to
make tests pass.**

### Mock function forms

Each entry can be one of:

```ts
mocks: {
  queries: {
    // Sync return
    getCurrentUser: () => ({ data: { id: '1', role: 'admin' as const } }),

    // Args-aware
    getUser: (args: { id: string }) => ({ data: { id: args.id, name: 'Ada' } }),

    // Error
    getCurrentUser: () => ({ error: 'NOT_AUTHENTICATED' }),

    // Async
    getCurrentUser: async () => {
      await delay(10);
      return { data: { id: '1', role: 'admin' as const } };
    },

    // Generator (saga primitives)
    *getCurrentUser() {
      yield* delay(10);
      return { data: { id: '1', role: 'admin' as const } };
    },
  },
}
```

### What's mocked, what isn't

| Aspect                                                               | Mocked?                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| Query `execute`                                                      | ✅                                                    |
| Mutation `execute`                                                   | ✅                                                    |
| Lifecycle action types (`on.pending` / `on.succeeded` / `on.failed`) | Real (dispatched by the interceptor with mocked data) |
| Reducer behaviour (cache slice updates)                              | Real                                                  |
| Workflows of the mocked api                                          | Not run (the interceptor doesn't run workflows)       |
| GC / refetch listeners of the mocked api                             | Not run                                               |

If the api under test depends on the mocked api's workflows, you
typically don't want to mock that api at all — let its real `rootSaga`
run alongside. Use `mockApi` only for the queries / mutations you want
to fake.

### Validation

`mockApi(api, mocks)` validates eagerly: a typo in a mock key (e.g.
`getCuurentUser`) throws at the call site, not later inside the saga.

## When `flush()` isn't enough

`flush()` resolves on the next tick (`setImmediate`) — it covers sagas that
settle synchronously or with microtasks. For multi-tick workflows (timers,
streaming), use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`. A
`waitForAction(instance.on.succeeded)` primitive may be added if patterns
accumulate.

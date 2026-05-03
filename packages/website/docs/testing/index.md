---
title: Testing
sidebar_label: Overview
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

## API surface

```ts
setupApiTest({ api, slice?, mocks? }) => {
  dispatch:             (action) => action,
  getState:             () => RootState,
  flush:                () => Promise<void>,
  reset:                () => void,
  getDispatchedActions: () => Action[],
  then: {
    query(instance, args)         : QueryAssertion,
    mutation(instance)            : MutationAssertion,
    workflow(instance)            : WorkflowAssertion,
    slice()                       : SliceAssertion,  // only if `slice` was passed
    hasDispatchedAction(matcher)  : void,
    hasNoDispatchedAction(matcher): void,
  }
}
```

- `slice` — optional. Pass it when the api coexists with a companion
  slice whose state you want to assert against. `then.slice()` is only
  defined when a slice was provided.
- `mocks` — optional. An array of [`mockApi(...)`](./mocking-dependent-apis)
  results for apis the one under test depends on (e.g. a shared
  `authApi`).

See:

- [Assertions](./assertions) — `then.query` / `mutation` / `workflow` / `slice`
- [Dispatched actions](./dispatched-actions) — `hasDispatchedAction`, etc.
- [Mocking dependent apis](./mocking-dependent-apis) — `mockApi(...)`
- [Advanced](./advanced) — gateways, timing, escape hatches

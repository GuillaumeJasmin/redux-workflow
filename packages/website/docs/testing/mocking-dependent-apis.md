---
title: Mocking dependent apis
---

# Mocking dependent apis

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

## How it works

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

## Mock function forms

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

## What's mocked, what isn't

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

## Validation

`mockApi(api, mocks)` validates eagerly: a typo in a mock key (e.g.
`getCuurentUser`) throws at the call site, not later inside the saga.

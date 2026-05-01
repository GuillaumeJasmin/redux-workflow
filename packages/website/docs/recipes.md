---
title: Recipes
---

# Recipes

Worked examples for patterns that compose the primitives in non-obvious
ways. Each recipe targets one specific problem and shows the smallest
working solution.

The core API stays small on purpose. When you need something the API
doesn't have a dedicated method for, the answer is usually here.

> **Status.** This page is a recipe index. Full examples are pending
> while the API stabilizes. Each entry below describes the problem the
> recipe will cover.

## Data flows

### Pagination

How to wire offset / cursor / infinite-scroll pagination on top of a
single cached query, including cache key strategy and "load more" UX.

### Debounced search

Combine `useLazyQuery` with input debouncing so each keystroke doesn't
fire a network call.

### Optimistic list operations

Add or remove an item from a cached list immediately, then roll back if
the mutation fails — without losing the in-flight read.

### Stale-while-revalidate display

Show the previous result while a refetch is in flight, with a subtle
"refreshing…" indicator. Avoids the empty-state flicker on arg changes.

## Real-time

### Websocket tied to a query's lifetime

Open a socket when the first subscriber mounts, close it when the last
one unmounts. Push frames into the cache via `patchCache`.

### Server-Sent Events stream

Same shape as the websocket recipe, but for SSE / EventSource.

### Push notification → patchCache

External event (FCM, APNs, browser push) updates a cached query without
triggering a fetch.

### Polling with backoff

`poll` handles the simple case. This recipe shows backoff on failure,
exponential intervals, and stopping when the tab is backgrounded.

## Auth & session

### Token refresh on 401

Intercept the response in `httpRequest`, refresh the token via a
mutation, and retry the original call once.

### Login flow

Mutation runs → slice records the user → workflow dispatches a
post-login domain action → router navigates. End-to-end shape.

### Logout cleanup

`resetCache` plus slice reset via `extraReducers` listening to
`userLoggedOut`. Ensures no per-user data leaks across sessions.

## Multi-step processes

### Wizard / multi-step form

Form data lives in `slice`, workflow drives transitions, mutations fire
on submit. How to keep the page reload-safe and back-button-friendly.

### Long-running async with progress

Workflow that emits progress events into the slice as it runs. UI shows
a progress bar without coupling to the workflow's internals.

### Background sync queue

Queue mutations while offline; drain them when the network returns.
Uses `setupListeners` + a workflow.

## Cross-cutting state

### React to this api's own lifecycle

When extraReducers needs to flip a flag based on a mutation's result.
The internal `createAction()` bridge pattern.

### Cross-api lifecycle reactions

One api's slice reacts to another api's mutation succeeded / failed.
When module ordering matters, when it doesn't.

### Multi-source aggregation

Several workflows or mutations all flip the same slice flag — without
each writing its own duplicate `setX` action.

## Beyond HTTP

### Custom transport: IndexedDB

Use a plain async `execute` function to read/write IndexedDB instead of
`fetch`. Cache + invalidates + optimistic updates still work.

### Custom transport: native SDK

Wrap a vendor SDK (Firebase, Supabase, AWS Amplify) in `execute`.
Translate the SDK's error shape to the `{ error }` contract.

### gRPC streaming

Use a saga generator and channels to pump a streaming RPC into a query
cache entry.

### Race against timeout

`yield* race({ response, timeout })` for queries that should fail fast.
Patterns for surfacing timeout vs network error to the UI.

## Platform & setup

### React Native focus / online wiring

`AppState` + `NetInfo` bridged into `setupListeners` so
`refetchOnFocus` / `refetchOnReconnect` work on RN.

### Multiple apis in one store

Splitting domain by api boundary. When to combine, when to keep
separate. State path conventions.

### Testing a workflow end-to-end

Spin up a store with the api, dispatch the trigger, assert against
slice state and dispatched actions. Without mocking the network.

### Testing a React component with the api

Render a component, drive its hooks, assert on `setupStore` state.
Patterns for fakes vs full integration.

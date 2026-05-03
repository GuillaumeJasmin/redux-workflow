---
title: Advanced
---

# Advanced

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

## When `flush()` isn't enough

`flush()` resolves on the next tick (`setImmediate`) — it covers sagas that
settle synchronously or with microtasks. For multi-tick workflows (timers,
streaming), use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`. A
`waitForAction(instance.matchFulfilled)` primitive may be added if patterns
accumulate.

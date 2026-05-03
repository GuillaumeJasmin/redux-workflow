---
title: Dispatched actions
---

# Dispatched-action assertions

Prefer `then.hasDispatchedAction` / `then.hasNoDispatchedAction` over raw
inspection — they give you clean vitest diffs on failure.

```ts
dispatch(api.mutations.renamePost.trigger({ id: 'abc', title: 'new' }));
await flush();

// Match any dispatched action of that type (pass the matcher).
then.hasDispatchedAction(api.mutations.renamePost.matchFulfilled);

// Match a specific instance: type + payload deep-equality.
then.hasDispatchedAction(api.mutations.renamePost.trigger({ id: 'abc', title: 'new' }));

// Absence assertion.
then.hasNoDispatchedAction(api.queries.fetchPost.trigger);
```

## Argument discrimination

| You pass…                                             | It matches…                                  |
| ----------------------------------------------------- | -------------------------------------------- |
| An action creator — `api.mutations.x.trigger`         | any dispatched action with that `.type`      |
| An action object — `api.mutations.x.trigger(payload)` | type + payload deep-equal (`toContainEqual`) |

## `getDispatchedActions()`

Escape hatch returning a snapshot of every action that hit the store — useful
for custom assertions (ordering, counts, etc.) beyond presence / absence.

```ts
const types = getDispatchedActions().map((a) => a.type);
```

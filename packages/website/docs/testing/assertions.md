---
title: Assertions
---

# Assertions (Object Assertion pattern)

All assertion methods throw through vitest's `expect`, so failing test output
points at the actual expected/actual diff — not at the helper. All methods
return `this`, so they chain.

## `then.query(instance, args)`

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

## `then.mutation(instance)`

Same surface as query, plus `.isIdle()` for "never fired". `hasData` is
`toEqual`, `hasPartialData` is `toMatchObject`.

## `then.workflow(instance)`

Same surface as mutation.

## `then.slice()`

```ts
then.slice().equals(fullExpectedState); // toEqual
then.slice().matches({ post: somePost }); // toMatchObject
then.slice().state; // raw, unwrapped
```

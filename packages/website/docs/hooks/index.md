---
title: React hooks
sidebar_label: Overview
---

# React hooks

The four hooks live in `@redux-workflow/react`. They wrap the dispatcher and
selectors so components don't have to know about the underlying redux-saga
machinery.

```ts
import { useQuery, useLazyQuery, useMutation, useWorkflow } from '@redux-workflow/react';
```

## At a glance

| Feature                      | [`useQuery`](./useQuery) | [`useLazyQuery`](./useLazyQuery) | [`useMutation`](./useMutation) | [`useWorkflow`](./useWorkflow) |
| ---------------------------- | :----------------------: | :------------------------------: | :----------------------------: | :----------------------------: |
| Auto-fetches on mount        |            ✅            |                                  |                                |                                |
| Manual trigger               |                          |                ✅                |               ✅               |               ✅               |
| Subscribes to a cache entry  |            ✅            |                ✅                |                                |                                |
| Returns `[trigger, result]`  |                          |                ✅                |               ✅               |               ✅               |
| `refetch()`                  |            ✅            |                                  |                                |                                |
| `reset()`                    |                          |                                  |               ✅               |               ✅               |
| `skip` / conditional read    |            ✅            |                                  |                                |                                |
| Refetch on focus / reconnect |            ✅            |                ✅                |                                |                                |
| Cancel on unmount            |                          |                                  |                                |               ✅               |

## Picking a hook

- **Read data on mount** — [`useQuery`](./useQuery). The default choice for
  rendering server data inside a component.
- **Read data on demand** — [`useLazyQuery`](./useLazyQuery). Use for
  search-on-type, "Load more", or anything that shouldn't fetch until the user
  asks.
- **Write data** — [`useMutation`](./useMutation). Pair with `invalidates` on
  the mutation definition to refresh related queries.
- **Run a multi-step process** — [`useWorkflow`](./useWorkflow). Use when the
  work involves orchestration (multiple queries/mutations, saga primitives,
  long-lived connections).

## Shared status fields

Every hook exposes the same boolean status fields, derived from the entry's
`status`:

| Field       | When it's `true`                           |
| ----------- | ------------------------------------------ |
| `isLoading` | The entry is `pending` (or uninitialized). |
| `isSuccess` | The entry is `fulfilled`.                  |
| `isError`   | The entry is `rejected`.                   |

`error` and `data` always come together with these flags, and are `null` until
the first run completes.

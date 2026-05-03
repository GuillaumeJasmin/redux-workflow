---
title: Cheat sheet
---

# Cheat sheet

| I want to…                                        | Use                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Read data in a component                          | `useQuery(q, args)`                                                             |
| Read data only when some condition is met         | `useQuery(q, args, { skip: !ready })`                                           |
| Fetch on a button click                           | `useLazyQuery(q)`                                                               |
| Write data + invalidate related queries           | `useMutation(m)` + `invalidates: [...]`                                         |
| Optimistic UI with rollback                       | `onStart` / `onError` on the mutation                                           |
| Run something complex when a domain event happens | Workflow with `listen`                                                          |
| Cancel the complex thing cleanly                  | Workflow `dismiss` + `finally`                                                  |
| Open a websocket tied to a query's lifetime       | Workflow `listen: q.firstSubscribe.match`, `dismiss: q.lastUnsubscribe.match`   |
| Write data into the cache without a fetch         | `ctx.patchCache` (inside mutation/workflow) or dispatch `api.patchCache` action |
| Force a refresh                                   | `api.invalidateCache({ cacheKey })`                                             |
| Clear everything                                  | `api.resetCache()`                                                              |

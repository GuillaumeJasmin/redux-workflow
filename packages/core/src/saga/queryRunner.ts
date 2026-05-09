/* eslint-disable @typescript-eslint/no-explicit-any */

import { call, put, select, take, fork, cancel, delay, all } from 'typed-redux-saga';
import type { Task } from 'redux-saga';
import type { ActionCreatorWithPayload, PayloadAction } from '@reduxjs/toolkit';
import { buildCacheKey } from '../utils/cacheKey';
import { buildExecuteCallContext, isErrorResult, toErrorMessage } from './actionHelpers';
import type { QueryInstance, SagaGen } from '../createApi/types';

function createQuerySaga(
  instance: QueryInstance,
  invalidateCache: ActionCreatorWithPayload<{ cacheKey: string }>,
): (action: PayloadAction<any>) => SagaGen<void> {
  const { _def: def } = instance;

  function* runFetch(args: unknown, cacheKey: string): SagaGen<boolean> {
    yield* put(instance._pendingAction({ args, cacheKey } as any));

    try {
      const ctx = yield* buildExecuteCallContext();
      const result: any = yield* call(def.execute as any, args as any, ctx as any);

      if (isErrorResult(result)) {
        yield* put(instance._rejectedAction({ args, cacheKey, error: result.error } as any));
        return false;
      }

      yield* put(instance._fulfilledAction({ args, cacheKey, data: result?.data } as any));
      return true;
    } catch (error) {
      const message = toErrorMessage(error);
      yield* put(instance._rejectedAction({ args, cacheKey, error: message } as any));
      return false;
    }
  }

  function* pollLoop(args: unknown, cacheKey: string): SagaGen<void> {
    if (!def.poll || def.poll <= 0) {
      return;
    }

    while (true) {
      yield* delay(def.poll * 1000);
      yield* runFetch(args, cacheKey);
    }
  }

  function* watchInvalidation(args: unknown, cacheKey: string): SagaGen<void> {
    while (true) {
      yield* take(
        (action: any) =>
          action.type === invalidateCache.type && action.payload?.cacheKey === cacheKey,
      );
      yield* runFetch(args, cacheKey);
    }
  }

  return function* onTrigger(action: PayloadAction<any>): SagaGen<void> {
    const args = action.payload;
    const cacheKey = buildCacheKey(instance._key, args);

    const fetched: boolean = yield* runFetch(args, cacheKey);

    if (!fetched) {
      return;
    }

    yield* all([pollLoop(args, cacheKey), watchInvalidation(args, cacheKey)]);
  };
}

export function createWatchQueryTriggers(
  reducerPath: string,
  queryInstances: Record<string, QueryInstance>,
  invalidateCache: ActionCreatorWithPayload<{ cacheKey: string }>,
) {
  return function* watchQueryTriggers(): SagaGen<void> {
    const watchers = Object.values(queryInstances).map((instance) =>
      call(watchInstance, reducerPath, instance, invalidateCache),
    );

    yield* all(watchers);
  };
}

// Per-cacheKey dedup + takeLatest:
//   - if an entry is already `pending` for this cacheKey, drop the trigger
//     (prevents double-fetch on concurrent mounts of the same query + args).
//   - exception: if the trigger carries `meta.forceRefetch`, bypass the
//     pending drop so the in-flight task is cancelled and a fresh fetch
//     runs (dispatched by `ctx.query(..., { forceRefetch: true })`).
//   - otherwise, different args run in parallel; a same-args re-trigger after
//     the first settles replaces the prior task.
function* watchInstance(
  reducerPath: string,
  instance: QueryInstance,
  invalidateCache: ActionCreatorWithPayload<{ cacheKey: string }>,
): SagaGen<void> {
  const saga = createQuerySaga(instance, invalidateCache);

  const tasks: Record<string, Task> = {};

  while (true) {
    const action = yield* take(instance.trigger.match);

    const cacheKey = buildCacheKey(instance._key, action.payload);

    const currentStatus = yield* select(
      (state: any) => state[reducerPath]?.queries?.[cacheKey]?.status,
    );

    const forceRefetch = (action as any).meta?.forceRefetch === true;

    if (currentStatus === 'pending' && !forceRefetch) {
      continue;
    }

    const existing = tasks[cacheKey];
    if (existing?.isRunning()) {
      yield* cancel(existing);
    }

    tasks[cacheKey] = yield* fork(saga, action);
  }
}

import { cancel, delay, fork, put, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';
import type { Action, ActionCreatorWithPayload, PayloadAction } from '@reduxjs/toolkit';
import type { QueryInstance, SagaGen } from '../createApi/types';
import { findQueryInstanceForCacheKey } from '../utils/cacheKey';

const DEFAULT_KEEP_UNUSED_DATA_FOR = 60;

export function createWatchGarbageCollector(
  _reducerPath: string,
  queryInstances: Record<string, QueryInstance>,
  subscribe: ActionCreatorWithPayload<{ args: unknown; cacheKey: string }>,
  unsubscribe: ActionCreatorWithPayload<{ args: unknown; cacheKey: string }>,
  removeFromCache: ActionCreatorWithPayload<{ cacheKey: string }>,
) {
  const instancesList = Object.values(queryInstances);

  function resolveKeepUnusedDataFor(instance: QueryInstance): number {
    return instance._def.keepUnusedDataFor ?? DEFAULT_KEEP_UNUSED_DATA_FOR;
  }

  return function* watchGarbageCollector(): SagaGen<void> {
    // Reference counts updated synchronously on every subscribe/unsubscribe.
    const counts: Record<string, number> = {};
    // Last externally-reported state — what we already dispatched a transition
    // event for. Used to decide whether the current count constitutes a
    // 0→positive or positive→0 transition that needs a `firstSubscribe` /
    // `lastUnsubscribe`.
    const reportedState: Record<string, 'positive' | 'zero'> = {};
    // True while a flush task is queued for this cacheKey. We only schedule
    // one flush per burst so synchronous churn collapses to a single event.
    const flushScheduled: Record<string, boolean> = {};
    // Args of the most recent subscribe/unsubscribe action — used as the
    // payload when we eventually dispatch `firstSubscribe` / `lastUnsubscribe`.
    // For a given cacheKey args are stable (cacheKey is derived from them).
    const latestArgs: Record<string, unknown> = {};
    const gcTimers: Record<string, Task> = {};

    function* flushTransition(cacheKey: string): SagaGen<void> {
      // One-tick debounce: collapse synchronous churn (e.g. React 18
      // strict-mode's subscribe → unsubscribe → subscribe within a single
      // commit) into a single transition.
      yield* delay(0);
      flushScheduled[cacheKey] = false;

      const count = counts[cacheKey] ?? 0;
      const args = latestArgs[cacheKey];
      const instance = findQueryInstanceForCacheKey(cacheKey, instancesList);
      const previous = reportedState[cacheKey];
      const isPositive = count > 0;

      if (isPositive) {
        if (previous === 'positive') return;
        const timer = gcTimers[cacheKey];
        if (timer?.isRunning()) yield* cancel(timer);
        delete gcTimers[cacheKey];
        if (instance) yield* put(instance.firstSubscribe({ args, cacheKey }));
        reportedState[cacheKey] = 'positive';
        return;
      }

      // count === 0
      if (previous === 'positive' && instance) {
        yield* put(instance.lastUnsubscribe({ args, cacheKey }));
      }
      reportedState[cacheKey] = 'zero';

      // Schedule gc whether or not we just fired `lastUnsubscribe`. A burst
      // that goes 0 → 1 → 0 within one tick never fires either transition
      // event, but the entry was created in the store by the subscribe
      // reducer — we still need it cleaned up.
      const keepUnusedDataFor = instance
        ? resolveKeepUnusedDataFor(instance)
        : DEFAULT_KEEP_UNUSED_DATA_FOR;

      if (keepUnusedDataFor === 0) {
        yield* put(removeFromCache({ cacheKey }));
        delete counts[cacheKey];
        delete reportedState[cacheKey];
        delete latestArgs[cacheKey];
        return;
      }

      if (!Number.isFinite(keepUnusedDataFor)) return;

      const existing = gcTimers[cacheKey];
      if (existing?.isRunning()) return;

      gcTimers[cacheKey] = yield* fork(
        runGarbageCollector,
        keepUnusedDataFor,
        cacheKey,
        removeFromCache,
      );
    }

    while (true) {
      const action = (yield* take(
        (candidate: Action) =>
          candidate.type === subscribe.type || candidate.type === unsubscribe.type,
      )) as PayloadAction<{ args: unknown; cacheKey: string }>;

      const { cacheKey, args } = action.payload;
      const isSubscribe = action.type === subscribe.type;

      counts[cacheKey] = isSubscribe
        ? (counts[cacheKey] ?? 0) + 1
        : Math.max((counts[cacheKey] ?? 0) - 1, 0);
      latestArgs[cacheKey] = args;

      if (!flushScheduled[cacheKey]) {
        flushScheduled[cacheKey] = true;
        yield* fork(flushTransition, cacheKey);
      }
    }
  };
}

function* runGarbageCollector(
  keepUnusedDataFor: number,
  cacheKey: string,
  removeFromCache: ActionCreatorWithPayload<{ cacheKey: string }>,
): SagaGen<void> {
  yield* delay(keepUnusedDataFor * 1000);
  yield* put(removeFromCache({ cacheKey }));
}

/* eslint-disable @typescript-eslint/no-explicit-any */

import { put, select, take } from 'typed-redux-saga';
import { focusEvent, onlineEvent } from '../events';
import type { QueryInstance, SagaGen } from '../createApi/types';
import type { CacheState, CacheEntry } from '../store/cacheSlice';
import { findQueryInstanceForCacheKey } from '../utils/cacheKey';

type RefetchTrigger = 'focus' | 'reconnect';

/**
 * Watches the global `focusEvent` / `onlineEvent` signals and refetches every
 * cache entry whose subscriber set asked for the corresponding refetch. The
 * effective `refetchOnFocus` / `refetchOnReconnect` for each subscriber is
 * resolved by the hook (hook option > endpoint default) and tallied on the
 * entry as `focusSubscribers` / `reconnectSubscribers`.
 */
export function createWatchRefetchEvents(
  reducerPath: string,
  queryInstances: Record<string, QueryInstance>,
) {
  const instancesList = Object.values(queryInstances);

  function counterFor(entry: CacheEntry, trigger: RefetchTrigger): number {
    return trigger === 'focus' ? entry.focusSubscribers : entry.reconnectSubscribers;
  }

  return function* watchRefetchEvents(): SagaGen<void> {
    while (true) {
      const action = yield* take(
        (candidate: { type: string }) =>
          candidate.type === focusEvent.type || candidate.type === onlineEvent.type,
      );

      const trigger: RefetchTrigger = action.type === focusEvent.type ? 'focus' : 'reconnect';

      const cacheEntries = yield* select(
        (state: any) => (state[reducerPath]?.queries ?? {}) as CacheState,
      );

      for (const [cacheKey, entry] of Object.entries(cacheEntries)) {
        if (counterFor(entry, trigger) <= 0) continue;
        const instance = findQueryInstanceForCacheKey(cacheKey, instancesList);
        if (!instance) continue;
        yield* put(instance.trigger(entry.args as any));
      }
    }
  };
}

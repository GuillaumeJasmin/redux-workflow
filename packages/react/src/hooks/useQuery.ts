/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import {
  buildCacheKey,
  isCacheStale,
  type CacheEntry,
  type QueryInstance,
} from '@redux-workflow/core';

export type UseQueryOptions = {
  /**
   * If true, the hook won't fetch, won't subscribe, and won't count as an
   * active user of the cache entry. It still reads whatever data is present.
   */
  skip?: boolean;
  /**
   * Force a refetch on mount or args change, even if the cache is fresh.
   * Same name and semantics as RTK Query's hook option:
   *   - `false` (default) — respect the query's `cache` window.
   *   - `true` — always refetch on mount / args change.
   *   - `number` (seconds) — refetch if cached data is older than N seconds.
   */
  refetchOnMountOrArgChange?: boolean | number;
  /**
   * Per-hook override for the endpoint's `refetchOnFocus` flag. When omitted,
   * the endpoint default is used. Set explicitly to `false` to opt this
   * subscriber out of focus refetches even if the endpoint enables them.
   */
  refetchOnFocus?: boolean;
  /**
   * Per-hook override for the endpoint's `refetchOnReconnect` flag.
   */
  refetchOnReconnect?: boolean;
};

export type UseQueryResult<TResult> = {
  data: TResult | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown | null;
  refetch: () => void;
};

function selectEntry(state: any, reducerPath: string, cacheKey: string): CacheEntry | undefined {
  return state[reducerPath]?.queries?.[cacheKey];
}

function isOlderThan(entry: CacheEntry | undefined, ageSeconds: number): boolean {
  if (entry?.updatedAt == null) return true;
  return (Date.now() - entry.updatedAt) / 1000 > ageSeconds;
}

/**
 * Subscribe to a query. Fetches on mount, dedupes concurrent calls for the same
 * args, and keeps the cache entry alive while the component is mounted. The
 * entry is garbage-collected once the last subscriber unmounts.
 *
 * @example
 * const { data, isLoading, error, refetch } = useQuery(
 *   usersApi.queries.getUser,
 *   { id },
 * );
 */
export function useQuery<TResult, TArgs>(
  instance: QueryInstance<TResult, TArgs>,
  args: TArgs,
  options: UseQueryOptions = {},
): UseQueryResult<TResult> {
  const dispatch = useDispatch();
  const store = useStore();
  const { skip = false, refetchOnMountOrArgChange = false } = options;

  const refetchOnFocus = options.refetchOnFocus ?? instance._def.refetchOnFocus ?? false;
  const refetchOnReconnect =
    options.refetchOnReconnect ?? instance._def.refetchOnReconnect ?? false;

  const cacheKey = useMemo(() => buildCacheKey(instance._key, args), [instance._key, args]);

  const entry = useSelector((state: any) => selectEntry(state, instance._reducerPath, cacheKey));

  const latestRef = useRef({ instance, args });
  // eslint-disable-next-line react-hooks/refs -- intentional latest-ref pattern; effects below read latestRef.current to avoid re-subscribing on every arg change
  latestRef.current = { instance, args };

  useEffect(() => {
    if (skip) return;

    const { instance: latestInstance, args: latestArgs } = latestRef.current;

    // Read live store state instead of an entry captured during render. React's
    // dev double-effect (and any other "setup → cleanup → setup" within one
    // commit) doesn't re-render between the two setups, so a render-time
    // snapshot wouldn't reflect the dispatch from the first setup. The live
    // read lets the `pending` / fresh-cache guards trip on the second setup.
    const liveEntry = selectEntry(store.getState(), latestInstance._reducerPath, cacheKey);

    if (liveEntry?.status === 'pending') return;

    const shouldForceRefetch =
      refetchOnMountOrArgChange === true ||
      (typeof refetchOnMountOrArgChange === 'number' &&
        isOlderThan(liveEntry, refetchOnMountOrArgChange));

    if (shouldForceRefetch || isCacheStale(liveEntry, latestInstance._def.cache)) {
      dispatch(latestInstance.trigger(latestArgs));
    }
  }, [cacheKey, dispatch, skip, refetchOnMountOrArgChange, store]);

  useEffect(() => {
    if (skip) return;

    const { instance: latestInstance, args: latestArgs } = latestRef.current;
    // Capture in closure so the cleanup decrements the same counters that
    // the setup incremented, even if the resolved flags change mid-mount.
    const focus = refetchOnFocus;
    const reconnect = refetchOnReconnect;
    dispatch(
      latestInstance._subscribe({
        args: latestArgs,
        cacheKey,
        refetchOnFocus: focus,
        refetchOnReconnect: reconnect,
      }),
    );
    return () => {
      dispatch(
        latestInstance._unsubscribe({
          args: latestArgs,
          cacheKey,
          refetchOnFocus: focus,
          refetchOnReconnect: reconnect,
        }),
      );
    };
  }, [dispatch, cacheKey, skip, refetchOnFocus, refetchOnReconnect]);

  const refetch = useCallback(() => {
    dispatch(instance.trigger(args));
  }, [dispatch, instance, args]);

  const status = entry?.status ?? 'uninitialized';

  return {
    data: (entry?.data as TResult | null) ?? null,
    isLoading: status === 'pending' || status === 'uninitialized',
    isSuccess: status === 'fulfilled',
    isError: status === 'rejected',
    error: entry?.error ?? null,
    refetch,
  };
}

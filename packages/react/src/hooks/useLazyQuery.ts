/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { buildCacheKey, type CacheEntry, type QueryInstance } from '@redux-workflow/core';

export type UseLazyQueryResult<TResult, TArgs> = [
  trigger: (args: TArgs) => void,
  result: {
    data: TResult | null;
    isLoading: boolean;
    isSuccess: boolean;
    isError: boolean;
    error: unknown | null;
    isUntriggered: boolean;
  },
];

function selectEntry(
  state: any,
  reducerPath: string,
  cacheKey: string | null,
): CacheEntry | undefined {
  if (cacheKey === null) return undefined;
  return state[reducerPath]?.queries?.[cacheKey];
}

/**
 * Manually triggered version of `useQuery`. Returns a `[trigger, result]`
 * tuple; the query only runs when you call `trigger(args)`. The cache
 * subscription follows the most-recently triggered args.
 *
 * @example
 * const [getUser, { data, isUntriggered }] = useLazyQuery(usersApi.queries.getUser);
 * // ... <button onClick={() => getUser({ id: '1' })}>Load</button>
 */
export function useLazyQuery<TResult, TArgs>(
  instance: QueryInstance<TResult, TArgs>,
): UseLazyQueryResult<TResult, TArgs> {
  const dispatch = useDispatch();
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const subscribedKeyRef = useRef<string | null>(null);

  const entry = useSelector((state: any) => selectEntry(state, instance._reducerPath, cacheKey));

  const lastArgsRef = useRef<TArgs | null>(null);

  const refetchOnFocus = instance._def.refetchOnFocus ?? false;
  const refetchOnReconnect = instance._def.refetchOnReconnect ?? false;

  const trigger = useCallback(
    (args: TArgs) => {
      const nextKey = buildCacheKey(instance._key, args);

      if (subscribedKeyRef.current && subscribedKeyRef.current !== nextKey) {
        dispatch(
          instance._unsubscribe({
            args: lastArgsRef.current as TArgs,
            cacheKey: subscribedKeyRef.current,
            refetchOnFocus,
            refetchOnReconnect,
          }),
        );
      }

      if (subscribedKeyRef.current !== nextKey) {
        dispatch(
          instance._subscribe({
            args,
            cacheKey: nextKey,
            refetchOnFocus,
            refetchOnReconnect,
          }),
        );
        subscribedKeyRef.current = nextKey;
      }

      lastArgsRef.current = args;
      setCacheKey(nextKey);
      dispatch(instance.trigger(args));
    },
    [dispatch, instance, refetchOnFocus, refetchOnReconnect],
  );

  useEffect(() => {
    return () => {
      if (subscribedKeyRef.current) {
        dispatch(
          instance._unsubscribe({
            args: lastArgsRef.current as TArgs,
            cacheKey: subscribedKeyRef.current,
            refetchOnFocus,
            refetchOnReconnect,
          }),
        );
        subscribedKeyRef.current = null;
      }
    };
  }, [dispatch, instance, refetchOnFocus, refetchOnReconnect]);

  const status = entry?.status ?? 'uninitialized';
  const isUntriggered = cacheKey === null;

  return [
    trigger,
    {
      data: (entry?.data as TResult | null) ?? null,
      isLoading: !isUntriggered && (status === 'pending' || status === 'uninitialized'),
      isSuccess: status === 'fulfilled',
      isError: status === 'rejected',
      error: entry?.error ?? null,
      isUntriggered,
    },
  ];
}

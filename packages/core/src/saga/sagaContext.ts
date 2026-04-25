/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Action, ActionCreatorWithPayload } from '@reduxjs/toolkit';
import { put, select, take, race } from 'typed-redux-saga';
import type { ExecuteContext, MutationInstance, QueryInstance, SagaGen } from '../createApi/types';
import { buildCacheKey, isCacheStale } from '../utils/cacheKey';
import type { CacheEntry } from '../store/cacheSlice';

export function createSagaContext(
  reducerPath: string,
  queryInstances: Record<string, QueryInstance>,
  mutationInstances: Record<string, MutationInstance>,
  patchCacheAction: ActionCreatorWithPayload<{ cacheKey: string; data: unknown }>,
): ExecuteContext {
  function selectCacheEntry(state: any, cacheKey: string): CacheEntry | undefined {
    return state[reducerPath]?.queries?.[cacheKey];
  }

  function* waitForQueryResolution(
    instance: QueryInstance,
    cacheKey: string,
  ): SagaGen<{ data: unknown } | { error: unknown }> {
    const { succeeded, failed } = yield* race({
      succeeded: take(
        (action: any) =>
          instance.on.succeeded.match(action) && action.payload.cacheKey === cacheKey,
      ),
      failed: take(
        (action: any) => instance.on.failed.match(action) && action.payload.cacheKey === cacheKey,
      ),
    });

    if (failed) {
      return { error: (failed as any).payload.error };
    }

    return { data: (succeeded as any).payload.data };
  }

  function lookupQuery(name: PropertyKey): QueryInstance {
    const instance = queryInstances[name as string];
    if (!instance) {
      throw new Error(`[redux-workflow] query "${String(name)}" not found in api "${reducerPath}"`);
    }
    return instance;
  }

  function* runQuery(
    name: PropertyKey,
    args: unknown,
  ): SagaGen<{ data: unknown } | { error: unknown }> {
    const instance = lookupQuery(name);
    const cacheKey = buildCacheKey(instance._key, args);

    const entry = yield* select((state: any) => selectCacheEntry(state, cacheKey));

    if (entry?.status === 'fulfilled' && !isCacheStale(entry, instance._def.cache)) {
      return { data: entry.data };
    }

    if (entry?.status === 'pending') {
      return yield* waitForQueryResolution(instance, cacheKey);
    }

    yield* put(instance.trigger(args as any));
    return yield* waitForQueryResolution(instance, cacheKey);
  }

  function* runGetCache(name: PropertyKey, args: unknown): SagaGen {
    const instance = lookupQuery(name);
    const cacheKey = buildCacheKey(instance._key, args);
    const entry = yield* select((state: any) => selectCacheEntry(state, cacheKey));
    return entry?.data ?? null;
  }

  function* runPatchCache(name: PropertyKey, args: unknown, data: unknown): SagaGen<void> {
    const instance = lookupQuery(name);
    const cacheKey = buildCacheKey(instance._key, args);

    let nextData: unknown = data;
    if (typeof data === 'function') {
      const entry = yield* select((state: any) => selectCacheEntry(state, cacheKey));
      nextData = (data as (previous: unknown) => unknown)(entry?.data ?? null);
    }

    yield* put(patchCacheAction({ cacheKey, data: nextData }));
  }

  function* waitForMutationResolution(
    instance: MutationInstance,
  ): SagaGen<{ data: unknown } | { error: unknown }> {
    const { succeeded, failed } = yield* race({
      succeeded: take(instance.on.succeeded.match),
      failed: take(instance.on.failed.match),
    });

    if (failed) {
      return { error: (failed as any).payload.error };
    }

    return { data: (succeeded as any).payload.data };
  }

  function* runMutation(
    name: PropertyKey,
    args: unknown,
  ): SagaGen<{ data: unknown } | { error: unknown }> {
    const instance = mutationInstances[name as string];
    if (!instance) {
      throw new Error(
        `[redux-workflow] mutation "${String(name)}" not found in api "${reducerPath}"`,
      );
    }

    yield* put(instance.trigger(args as any));
    return yield* waitForMutationResolution(instance);
  }

  function* runSelect<TResult>(selector: (state: any) => TResult): SagaGen<TResult> {
    return yield* select(selector);
  }

  function* runPut(action: Action): SagaGen<void> {
    yield* put(action);
  }

  return {
    query: runQuery as ExecuteContext['query'],
    mutate: runMutation as ExecuteContext['mutate'],
    getCache: runGetCache as ExecuteContext['getCache'],
    patchCache: runPatchCache as ExecuteContext['patchCache'],
    select: runSelect,
    put: runPut,
  };
}

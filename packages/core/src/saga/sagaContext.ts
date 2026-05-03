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
  function selectCacheEntry(
    state: any,
    instanceReducerPath: string,
    cacheKey: string,
  ): CacheEntry | undefined {
    return state[instanceReducerPath]?.queries?.[cacheKey];
  }

  function* waitForQueryResolution(
    instance: QueryInstance,
    cacheKey: string,
  ): SagaGen<{ data: unknown } | { error: unknown }> {
    const { fulfilled, rejected } = yield* race({
      fulfilled: take(
        (action: any) => instance.matchFulfilled(action) && action.payload.cacheKey === cacheKey,
      ),
      rejected: take(
        (action: any) => instance.matchRejected(action) && action.payload.cacheKey === cacheKey,
      ),
    });

    if (rejected) {
      return { error: (rejected as any).payload.error };
    }

    return { data: (fulfilled as any).payload.data };
  }

  function lookupQuery(name: PropertyKey): QueryInstance {
    const instance = queryInstances[name as string];
    if (!instance) {
      throw new Error(`[redux-workflow] query "${String(name)}" not found in api "${reducerPath}"`);
    }
    return instance;
  }

  // Resolve either a name (own api lookup) or a passed instance (any api).
  function resolveQuery(nameOrInstance: PropertyKey | QueryInstance): QueryInstance {
    if (
      typeof nameOrInstance === 'string' ||
      typeof nameOrInstance === 'number' ||
      typeof nameOrInstance === 'symbol'
    ) {
      return lookupQuery(nameOrInstance);
    }
    return nameOrInstance;
  }

  function* runQuery(
    nameOrInstance: PropertyKey | QueryInstance,
    args: unknown,
  ): SagaGen<{ data: unknown } | { error: unknown }> {
    const instance = resolveQuery(nameOrInstance);
    const cacheKey = buildCacheKey(instance._key, args);

    const entry = yield* select((state: any) =>
      selectCacheEntry(state, instance._reducerPath, cacheKey),
    );

    if (entry?.status === 'fulfilled' && !isCacheStale(entry, instance._def.cache)) {
      return { data: entry.data };
    }

    if (entry?.status === 'pending') {
      return yield* waitForQueryResolution(instance, cacheKey);
    }

    yield* put(instance.trigger(args as any));
    return yield* waitForQueryResolution(instance, cacheKey);
  }

  function* runGetCache(nameOrInstance: PropertyKey | QueryInstance, args: unknown): SagaGen {
    const instance = resolveQuery(nameOrInstance);
    const cacheKey = buildCacheKey(instance._key, args);
    const entry = yield* select((state: any) =>
      selectCacheEntry(state, instance._reducerPath, cacheKey),
    );
    return entry?.data ?? null;
  }

  function* runPatchCache(
    nameOrInstance: PropertyKey | QueryInstance,
    args: unknown,
    data: unknown,
  ): SagaGen<void> {
    const instance = resolveQuery(nameOrInstance);
    const cacheKey = buildCacheKey(instance._key, args);

    let nextData: unknown = data;
    if (typeof data === 'function') {
      const entry = yield* select((state: any) =>
        selectCacheEntry(state, instance._reducerPath, cacheKey),
      );
      nextData = (data as (previous: unknown) => unknown)(entry?.data ?? null);
    }

    // For cross-api patches, the patchCache action is for THIS api's
    // cache slice. Use the instance's own cross-api dispatch path: we
    // need to dispatch to the correct slice. For now, the patchCache
    // action only has cacheKey + data; the slice that handles it is
    // the one whose reducerPath matches the instance.
    if (instance._reducerPath === reducerPath) {
      yield* put(patchCacheAction({ cacheKey, data: nextData }));
    } else {
      // Cross-api patch — dispatch a patch action keyed at the foreign
      // api's slice. We synthesize the action type the foreign slice
      // listens for: `${foreignApiName}/patchCache`.
      yield* put({
        type: `${instance._reducerPath}/patchCache`,
        payload: { cacheKey, data: nextData },
      });
    }
  }

  function* waitForMutationResolution(
    instance: MutationInstance,
  ): SagaGen<{ data: unknown } | { error: unknown }> {
    const { fulfilled, rejected } = yield* race({
      fulfilled: take(instance.matchFulfilled),
      rejected: take(instance.matchRejected),
    });

    if (rejected) {
      return { error: (rejected as any).payload.error };
    }

    return { data: (fulfilled as any).payload.data };
  }

  function resolveMutation(nameOrInstance: PropertyKey | MutationInstance): MutationInstance {
    if (
      typeof nameOrInstance === 'string' ||
      typeof nameOrInstance === 'number' ||
      typeof nameOrInstance === 'symbol'
    ) {
      const instance = mutationInstances[nameOrInstance as string];
      if (!instance) {
        throw new Error(
          `[redux-workflow] mutation "${String(nameOrInstance)}" not found in api "${reducerPath}"`,
        );
      }
      return instance;
    }
    return nameOrInstance;
  }

  function* runMutation(
    nameOrInstance: PropertyKey | MutationInstance,
    args: unknown,
  ): SagaGen<{ data: unknown } | { error: unknown }> {
    const instance = resolveMutation(nameOrInstance);
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

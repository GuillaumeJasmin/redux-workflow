/* eslint-disable @typescript-eslint/no-explicit-any */

import { call, put, select, takeEvery, all } from 'typed-redux-saga';
import type { Action, ActionCreatorWithPayload, PayloadAction } from '@reduxjs/toolkit';
import {
  buildExecuteCallContext,
  getActionTypes,
  isErrorResult,
  toArray,
  toErrorMessage,
} from './actionHelpers';
import { createSagaContext } from './sagaContext';
import type { MutationInstance, QueryInstance, SagaGen } from '../createApi/types';
import type { CacheState } from '../store/cacheSlice';
import { cacheKeyPrefix } from '../utils/cacheKey';

const ROLLBACK_SENTINEL = Symbol('redux-workflow/no-rollback');

function createMutationSaga(
  reducerPath: string,
  instance: MutationInstance,
  queryInstances: Record<string, QueryInstance>,
  invalidateCache: ActionCreatorWithPayload<{ cacheKey: string }>,
  patchCache: ActionCreatorWithPayload<{ cacheKey: string; data: unknown }>,
  mutationInstances: Record<string, MutationInstance>,
): (action: PayloadAction<any>) => SagaGen<void> {
  const { _def: def, _key: mutationKey } = instance;
  const ctx = createSagaContext(reducerPath, queryInstances, mutationInstances, patchCache);

  return function* onTrigger(action: PayloadAction<any>): SagaGen<void> {
    const args = action.payload;

    yield* put(instance.on.pending({ args, mutationKey } as any));

    let rollback: unknown = ROLLBACK_SENTINEL;

    try {
      if (def.onStart) {
        rollback = yield* call(def.onStart as any, args, ctx);
      }

      const executeCtx = yield* buildExecuteCallContext();
      const result: any = yield* call(def.execute as any, args, executeCtx as any);

      if (isErrorResult(result)) {
        yield* handleError(result.error, args, rollback, 'passthrough');
        return;
      }

      yield* put(
        instance.on.succeeded({
          args,
          mutationKey,
          data: result?.data,
        } as any),
      );

      if (def.invalidates && def.invalidates.length > 0) {
        const cacheEntries = yield* select(
          (state: any) => (state[reducerPath]?.queries ?? {}) as CacheState,
        );

        for (const queryName of def.invalidates) {
          const target = queryInstances[queryName];
          if (!target) continue;

          const prefix = cacheKeyPrefix(target._key);

          for (const cacheKey of Object.keys(cacheEntries)) {
            if (cacheKey.startsWith(prefix)) {
              yield* put(invalidateCache({ cacheKey }));
            }
          }
        }
      }
    } catch (error) {
      yield* handleError(error, args, rollback, 'stringify');
    }
  };

  function* handleError(
    error: unknown,
    args: unknown,
    rollback: unknown,
    mode: 'passthrough' | 'stringify',
  ): SagaGen<void> {
    const payloadError = mode === 'stringify' ? toErrorMessage(error) : error;

    if (def.onError && rollback !== ROLLBACK_SENTINEL) {
      try {
        yield* call(def.onError as any, rollback, args, ctx);
      } catch (rollbackError) {
        console.error('[redux-workflow] onError rollback threw:', rollbackError);
      }
    }

    yield* put(instance.on.failed({ args, mutationKey, error: payloadError } as any));
  }
}

export function createWatchMutationTriggers(
  reducerPath: string,
  mutationInstances: Record<string, MutationInstance>,
  queryInstances: Record<string, QueryInstance>,
  invalidateCache: ActionCreatorWithPayload<{ cacheKey: string }>,
  patchCache: ActionCreatorWithPayload<{ cacheKey: string; data: unknown }>,
) {
  return function* watchMutationTriggers(): SagaGen<void> {
    const watchers = Object.values(mutationInstances).map((instance) => {
      const saga = createMutationSaga(
        reducerPath,
        instance,
        queryInstances,
        invalidateCache,
        patchCache,
        mutationInstances,
      );
      const listenTypes = getActionTypes(toArray(instance._def.listen));
      const acceptedTypes = [instance.trigger.type, ...listenTypes];
      return call(function* () {
        yield* takeEvery((action: Action) => acceptedTypes.includes(action.type), saga);
      });
    });

    yield* all(watchers);
  };
}

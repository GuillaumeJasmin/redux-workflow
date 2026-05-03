/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'vitest';
import {
  combineReducers,
  configureStore,
  type Action,
  type Reducer,
  type Slice,
  type Store,
} from '@reduxjs/toolkit';
import createSagaMiddleware, { type Task } from 'redux-saga';
import { buildCacheKey } from '../utils/cacheKey';
import type {
  ApiInstance,
  MutationInstance,
  QueryInstance,
  WorkflowInstance,
} from '../createApi/types';
import { MutationAssertion, QueryAssertion, SliceAssertion, WorkflowAssertion } from './assertions';
import { runInterceptorSaga, type MockSpec } from './mockApi';

/**
 * Accepted shapes for `hasDispatchedAction` / `hasNoDispatchedAction`:
 *  - A predicate `(action) => boolean` — e.g. `instance.matchFulfilled`.
 *  - An action creator with `.match` (RTK) — `.match` is used as the predicate.
 *  - A dispatched action object (`{ type, payload }`) — type + payload deep-equality.
 */
type Predicate = (action: Action) => boolean;
type ActionCreatorLike = ((...args: any[]) => any) & { match: Predicate };
type ActionMatcher = Action | Predicate | ActionCreatorLike;

function toPredicate(value: Predicate | ActionCreatorLike): Predicate {
  return 'match' in value && typeof value.match === 'function' ? value.match : value;
}

type SliceLike = {
  name: string;
  reducer: Reducer;
};

type SliceState<TSlice> =
  TSlice extends Slice<infer S> ? S : TSlice extends { reducer: Reducer<infer S> } ? S : never;

export interface SetupApiTestOptions<TSlice extends SliceLike | undefined> {
  api: ApiInstance<any, any, any>;
  slice?: TSlice;
  /**
   * Apis the primary one depends on, with mocked query/mutation
   * runtimes. Each mock api's reducer is mounted normally; its rootSaga
   * is replaced by an interceptor that emits the supplied results
   * instead of running the real `execute` functions.
   */
  mocks?: MockSpec[];
}

export interface ApiTestThen<TSlice extends SliceLike | undefined> {
  query<TResult, TArgs>(
    instance: QueryInstance<TResult, TArgs>,
    args: TArgs,
  ): QueryAssertion<TResult>;
  mutation<TResult, TArgs>(instance: MutationInstance<TResult, TArgs>): MutationAssertion<TResult>;
  workflow<TResult, TArgs>(instance: WorkflowInstance<TResult, TArgs>): WorkflowAssertion<TResult>;
  slice: TSlice extends SliceLike ? () => SliceAssertion<SliceState<TSlice>> : never;
  /**
   * Assert that an action was dispatched. Accepts:
   *  - A predicate — e.g. `api.mutations.x.matchFulfilled`.
   *  - An action creator — its `.match` is used as the predicate.
   *  - An action object — type + payload deep-equality.
   */
  hasDispatchedAction(matcher: ActionMatcher): void;
  /** Inverse of `hasDispatchedAction`. */
  hasNoDispatchedAction(matcher: ActionMatcher): void;
}

export interface SetupApiTestResult<TSlice extends SliceLike | undefined> {
  dispatch: (action: Action) => Action;
  getState: () => any;
  flush: () => Promise<void>;
  reset: () => void;
  getDispatchedActions: () => Action[];
  then: ApiTestThen<TSlice>;
}

export function setupApiTest<TSlice extends SliceLike | undefined = undefined>(
  options: SetupApiTestOptions<TSlice>,
): SetupApiTestResult<TSlice> {
  const { api, slice, mocks } = options;

  let store: Store | null = null;
  let sagaTasks: Task[] = [];
  let dispatchedActions: Action[] = [];

  function reset() {
    for (const task of sagaTasks) {
      task.cancel();
    }
    sagaTasks = [];
    dispatchedActions = [];

    const captureMiddleware = () => (next: (action: unknown) => unknown) => (action: unknown) => {
      dispatchedActions.push(action as Action);
      return next(action);
    };

    const sagaMiddleware = createSagaMiddleware();

    const reducerMap: Record<string, Reducer> = {
      [api.reducerPath]: api.reducer,
    };
    if (slice) {
      reducerMap[slice.name] = slice.reducer;
    }
    // Mount each mocked api's reducer at its own reducerPath. Cache state
    // for mocked queries lands in the right subtree, exactly as in
    // production.
    for (const mock of mocks ?? []) {
      reducerMap[mock.api.reducerPath] = mock.api.reducer;
    }

    const newStore = configureStore({
      reducer: combineReducers(reducerMap),
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false })
          .concat(captureMiddleware as any)
          .concat(sagaMiddleware),
    });
    store = newStore;

    sagaMiddleware.setContext({ getState: () => newStore.getState() });

    // Primary api runs its real rootSaga.
    sagaTasks.push(sagaMiddleware.run(api.rootSaga));

    // Each mocked api runs the interceptor instead of its real rootSaga.
    for (const mock of mocks ?? []) {
      const spec = mock;
      sagaTasks.push(
        sagaMiddleware.run(function* () {
          yield* runInterceptorSaga(spec);
        }),
      );
    }
  }

  reset();

  function requireStore(): Store {
    if (!store) {
      throw new Error('[redux-workflow/testing] store is not initialized — call reset() first');
    }
    return store;
  }

  const dispatch: SetupApiTestResult<TSlice>['dispatch'] = (action) =>
    requireStore().dispatch(action);

  const getState = () => requireStore().getState();

  const flush = () =>
    new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

  const getDispatchedActions = () => [...dispatchedActions];

  const then = {
    query<TResult, TArgs>(instance: QueryInstance<TResult, TArgs>, args: TArgs) {
      const state = getState();
      const cacheKey = buildCacheKey(instance._key, args);
      const entry = state[instance._reducerPath]?.queries?.[cacheKey];
      return new QueryAssertion<TResult>(entry);
    },
    mutation<TResult, TArgs>(instance: MutationInstance<TResult, TArgs>) {
      const state = getState();
      const entry = state[instance._reducerPath]?.mutations?.[instance._key];
      return new MutationAssertion<TResult>(entry);
    },
    workflow<TResult, TArgs>(instance: WorkflowInstance<TResult, TArgs>) {
      const state = getState();
      const entry = state[instance._reducerPath]?.workflows?.[instance._key];
      return new WorkflowAssertion<TResult>(entry);
    },
    slice: (slice
      ? () => {
          const state = getState();
          return new SliceAssertion(state[slice.name]);
        }
      : undefined) as ApiTestThen<TSlice>['slice'],
    hasDispatchedAction(matcher: ActionMatcher) {
      if (typeof matcher === 'function') {
        const predicate = toPredicate(matcher);
        expect(dispatchedActions.some(predicate)).toBe(true);
      } else {
        expect(dispatchedActions).toContainEqual(matcher);
      }
    },
    hasNoDispatchedAction(matcher: ActionMatcher) {
      if (typeof matcher === 'function') {
        const predicate = toPredicate(matcher);
        expect(dispatchedActions.some(predicate)).toBe(false);
      } else {
        expect(dispatchedActions).not.toContainEqual(matcher);
      }
    },
  } as ApiTestThen<TSlice>;

  return {
    dispatch,
    getState,
    flush,
    reset,
    getDispatchedActions,
    then,
  };
}

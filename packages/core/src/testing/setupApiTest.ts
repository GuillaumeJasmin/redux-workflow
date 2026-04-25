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

/**
 * Accepted shapes for `hasDispatchedAction` / `hasNoDispatchedAction`:
 *  - An action creator (function with a static `.type`) — matches any
 *    dispatched action of that type, regardless of payload.
 *  - A dispatched action object (`{ type, payload }`) — matches on type
 *    AND payload deep-equality.
 */
type ActionCreatorLike = ((...args: any[]) => Action) & { type: string };
type ActionMatcher = Action | ActionCreatorLike;

function isActionCreator(value: ActionMatcher): value is ActionCreatorLike {
  return typeof value === 'function';
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
   * Assert that an action was dispatched.
   *  - `hasDispatchedAction(myAction)` — any action of that type.
   *  - `hasDispatchedAction(myAction({ foo: 'bar' }))` — exact match on
   *    type + payload.
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
  const { api, slice } = options;

  let store: Store | null = null;
  let sagaTask: Task | null = null;
  let dispatchedActions: Action[] = [];

  function reset() {
    if (sagaTask) {
      sagaTask.cancel();
      sagaTask = null;
    }
    dispatchedActions = [];

    const captureMiddleware = () => (next: (action: unknown) => unknown) => (action: unknown) => {
      dispatchedActions.push(action as Action);
      return next(action);
    };

    const sagaMiddleware = createSagaMiddleware();

    const reducer = slice
      ? combineReducers({
          [api.reducerPath]: api.reducer,
          [slice.name]: slice.reducer,
        })
      : combineReducers({
          [api.reducerPath]: api.reducer,
        });

    const newStore = configureStore({
      reducer,
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false })
          .concat(captureMiddleware as any)
          .concat(sagaMiddleware),
    });
    store = newStore;

    sagaMiddleware.setContext({ getState: () => newStore.getState() });
    sagaTask = sagaMiddleware.run(api.rootSaga);
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
      if (isActionCreator(matcher)) {
        expect(dispatchedActions).toContainEqual(expect.objectContaining({ type: matcher.type }));
      } else {
        expect(dispatchedActions).toContainEqual(matcher);
      }
    },
    hasNoDispatchedAction(matcher: ActionMatcher) {
      if (isActionCreator(matcher)) {
        expect(dispatchedActions).not.toContainEqual(
          expect.objectContaining({ type: matcher.type }),
        );
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

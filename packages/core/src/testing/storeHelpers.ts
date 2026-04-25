/* eslint-disable @typescript-eslint/no-explicit-any */

import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import type { ApiInstance } from '../createApi/types';
import type { CacheEntry } from '../store/cacheSlice';
import type { MutationEntry } from '../store/mutationSlice';
import type { WorkflowEntry } from '../store/workflowSlice';

export function setupStore(api: ApiInstance<any, any, any>) {
  const dispatchedActions: { type: string }[] = [];
  const captureMiddleware = () => (next: (action: unknown) => unknown) => (action: unknown) => {
    dispatchedActions.push(action as { type: string });
    return next(action);
  };

  const sagaMiddleware = createSagaMiddleware();

  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, thunk: false })
        .concat(captureMiddleware as any)
        .concat(sagaMiddleware),
  });

  sagaMiddleware.setContext({ getState: () => store.getState() });
  sagaMiddleware.run(api.rootSaga);

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  return { store, flush, dispatchedActions };
}

export function getCache(
  store: ReturnType<typeof setupStore>['store'],
  reducerPath: string,
  cacheKey: string,
): CacheEntry | undefined {
  return (store.getState() as any)[reducerPath]?.queries?.[cacheKey];
}

export function getMutation(
  store: ReturnType<typeof setupStore>['store'],
  reducerPath: string,
  mutationKey: string,
): MutationEntry | undefined {
  return (store.getState() as any)[reducerPath]?.mutations?.[mutationKey];
}

export function getWorkflow(
  store: ReturnType<typeof setupStore>['store'],
  reducerPath: string,
  workflowKey: string,
): WorkflowEntry | undefined {
  return (store.getState() as any)[reducerPath]?.workflows?.[workflowKey];
}

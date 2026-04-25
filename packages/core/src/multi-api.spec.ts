/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-yield */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { createApi, buildCacheKey } from './index';

describe('redux-workflow — multiple APIs coexist', () => {
  it('each api has its own reducerPath and does not leak state', async () => {
    const apiA = createApi({
      name: 'apiA',
      queries: (query) => ({
        thing: query({
          *execute() {
            return { data: 'A' };
          },
        }),
      }),
    });

    const apiB = createApi({
      name: 'apiB',
      queries: (query) => ({
        thing: query({
          *execute() {
            return { data: 'B' };
          },
        }),
      }),
    });

    const sagaMiddleware = createSagaMiddleware();

    const store = configureStore({
      reducer: {
        [apiA.reducerPath]: apiA.reducer,
        [apiB.reducerPath]: apiB.reducer,
      },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(sagaMiddleware),
    });

    sagaMiddleware.setContext({ getState: store.getState });
    sagaMiddleware.run(apiA.rootSaga);
    sagaMiddleware.run(apiB.rootSaga);

    const flush = () => new Promise((r) => setImmediate(r));

    store.dispatch(apiA.queries.thing.trigger(undefined as any));
    store.dispatch(apiB.queries.thing.trigger(undefined as any));
    await flush();

    const stateA = (store.getState() as any).apiA.queries;
    const stateB = (store.getState() as any).apiB.queries;

    expect(stateA[buildCacheKey(apiA.queries.thing._key, undefined)]).toMatchObject({
      status: 'fulfilled',
      data: 'A',
    });
    expect(stateB[buildCacheKey(apiB.queries.thing._key, undefined)]).toMatchObject({
      status: 'fulfilled',
      data: 'B',
    });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-yield */

import { describe, it, expect } from 'vitest';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
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

  it("workflow can run another api's query by passing its instance", async () => {
    const authApi = createApi({
      name: 'auth',
      queries: (query) => ({
        getCurrentUser: query({
          async execute(_args: void) {
            return { data: { id: '1', role: 'admin' as const } };
          },
        }),
      }),
    });

    let observed: { id: string; role: 'admin' | 'user' } | undefined;

    const billingApi = createApi({
      name: 'billing',
      workflows: (workflow) => ({
        sync: workflow({
          *execute(_args: void, { query }) {
            const result = yield* query(authApi.queries.getCurrentUser, undefined);
            if ('data' in result) {
              observed = result.data;
            }
          },
        }),
      }),
    });

    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: combineReducers({
        [authApi.reducerPath]: authApi.reducer,
        [billingApi.reducerPath]: billingApi.reducer,
      }),
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(sagaMiddleware),
    });

    sagaMiddleware.setContext({ getState: store.getState });
    sagaMiddleware.run(authApi.rootSaga);
    sagaMiddleware.run(billingApi.rootSaga);

    const flush = () => new Promise((r) => setImmediate(r));
    store.dispatch(billingApi.workflows.sync.trigger());
    await flush();

    expect(observed).toEqual({ id: '1', role: 'admin' });

    // The cache entry lands in auth's subtree.
    const authCache = (store.getState() as any).auth.queries;
    expect(authCache[buildCacheKey(authApi.queries.getCurrentUser._key, undefined)]).toMatchObject({
      status: 'fulfilled',
      data: { id: '1', role: 'admin' },
    });
  });

  it("workflow can run another api's mutation by passing its instance", async () => {
    const authApi = createApi({
      name: 'auth',
      mutations: (mutation) => ({
        refreshToken: mutation({
          async execute(_args: void) {
            return { data: { token: 'new-token' } };
          },
        }),
      }),
    });

    let observed: string | undefined;

    const billingApi = createApi({
      name: 'billing',
      workflows: (workflow) => ({
        renew: workflow({
          *execute(_args: void, { mutate }) {
            const result = yield* mutate(authApi.mutations.refreshToken, undefined);
            if ('data' in result && result.data) {
              observed = result.data.token;
            }
          },
        }),
      }),
    });

    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: combineReducers({
        [authApi.reducerPath]: authApi.reducer,
        [billingApi.reducerPath]: billingApi.reducer,
      }),
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(sagaMiddleware),
    });

    sagaMiddleware.setContext({ getState: store.getState });
    sagaMiddleware.run(authApi.rootSaga);
    sagaMiddleware.run(billingApi.rootSaga);

    const flush = () => new Promise((r) => setImmediate(r));
    store.dispatch(billingApi.workflows.renew.trigger());
    await flush();

    expect(observed).toBe('new-token');
  });

  it("getCache reads from another api's cache subtree", async () => {
    const authApi = createApi({
      name: 'auth',
      queries: (query) => ({
        getCurrentUser: query({
          async execute(_args: void) {
            return { data: { id: '1', role: 'admin' as const } };
          },
        }),
      }),
    });

    let observed: { id: string; role: 'admin' | 'user' } | null | undefined;

    const billingApi = createApi({
      name: 'billing',
      workflows: (workflow) => ({
        peek: workflow({
          *execute(_args: void, { getCache }) {
            observed = yield* getCache(authApi.queries.getCurrentUser, undefined);
          },
        }),
      }),
    });

    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: combineReducers({
        [authApi.reducerPath]: authApi.reducer,
        [billingApi.reducerPath]: billingApi.reducer,
      }),
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(sagaMiddleware),
    });

    sagaMiddleware.setContext({ getState: store.getState });
    sagaMiddleware.run(authApi.rootSaga);
    sagaMiddleware.run(billingApi.rootSaga);

    const flush = () => new Promise((r) => setImmediate(r));

    // Prime auth's cache by triggering its query.
    store.dispatch(authApi.queries.getCurrentUser.trigger());
    await flush();

    // Now billing peeks at auth's cache.
    store.dispatch(billingApi.workflows.peek.trigger());
    await flush();

    expect(observed).toEqual({ id: '1', role: 'admin' });
  });
});

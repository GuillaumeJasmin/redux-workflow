/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { createApi, buildCacheKey } from './index';
import { setupStore, getCache, getMutation } from './testing';

describe('redux-workflow async/await bodies', () => {
  it('accepts an async function as a query.execute', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          async execute(args: { id: string }) {
            return { data: { id: args.id, name: 'Alice' } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'fulfilled',
      data: { id: '1', name: 'Alice' },
    });
  });

  it('accepts an async function as a mutation.execute', async () => {
    const api = createApi({
      name: 'test',
      mutations: (mutation) => ({
        rename: mutation({
          async execute(args: { id: string; name: string }) {
            return { data: args };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.mutations.rename.trigger({ id: '1', name: 'new' }));
    await flush();

    expect(getMutation(store, api.reducerPath, api.mutations.rename._key)).toMatchObject({
      status: 'fulfilled',
      data: { id: '1', name: 'new' },
    });
  });

  it('surfaces `{ error }` returned from an async body', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          async execute(_args: { id: string }) {
            return { error: 'NOT_FOUND' };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'rejected',
      error: 'NOT_FOUND',
    });
  });

  it('getState in async body reflects the latest store state (live)', async () => {
    const api = createApi({
      name: 'liveApi',
      mutations: (mutation) => ({
        readCounter: mutation({
          async execute(_args: void, { getState }) {
            const state = getState();
            return { data: { counter: state.counter.value } };
          },
        }),
      }),
    });

    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: {
        [api.reducerPath]: api.reducer,
        counter: (state = { value: 0 }, action: any) =>
          action.type === 'counter/set' ? { value: action.payload } : state,
      } as any,
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(sagaMiddleware),
    });
    sagaMiddleware.setContext({ getState: store.getState });
    sagaMiddleware.run(api.rootSaga);
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    store.dispatch({ type: 'counter/set', payload: 42 } as any);
    store.dispatch(api.mutations.readCounter.trigger());
    await flush();

    expect(getMutation(store, api.reducerPath, api.mutations.readCounter._key)).toMatchObject({
      status: 'fulfilled',
      data: { counter: 42 },
    });
  });

  it('treats an async body that throws as rejected', async () => {
    const api = createApi({
      name: 'test',
      mutations: (mutation) => ({
        rename: mutation({
          async execute(_args: { id: string }) {
            throw new Error('boom');
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.mutations.rename.trigger({ id: '1' }));
    await flush();

    expect(getMutation(store, api.reducerPath, api.mutations.rename._key)).toMatchObject({
      status: 'rejected',
      error: 'boom',
    });
  });

  it('rootSaga fails fast when getState is missing from saga context', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        thing: query({
          async execute() {
            return { data: 'x' };
          },
        }),
      }),
    });

    const capturedErrors: Error[] = [];
    const sagaMiddleware = createSagaMiddleware({
      onError: (error) => {
        capturedErrors.push(error);
      },
    });

    configureStore({
      reducer: { [api.reducerPath]: api.reducer },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(sagaMiddleware),
    });

    // No `setContext({ getState })` — the rootSaga assertion should fire.
    const task = sagaMiddleware.run(api.rootSaga);

    await expect(task.toPromise()).rejects.toThrow(/getState.*missing.*saga middleware context/);
    expect(capturedErrors[0]?.message).toMatch(/getState.*missing.*saga middleware context/);
  });
});

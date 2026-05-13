/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-yield */

import { describe, it, expect, vi } from 'vitest';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { call, take } from 'typed-redux-saga';
import { createApi, combineApis, buildCacheKey, createRootSaga } from './index';

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('combineApis', () => {
  it('single api: wires reducer + saga so a query trigger fulfills', async () => {
    const api = createApi({
      name: 'usersApi',
      queries: (query) => ({
        getUser: query({
          async execute({ id }: { id: string }) {
            return { data: { id, name: 'Alice' } };
          },
        }),
      }),
    });

    const combined = combineApis([api]);

    const store = configureStore({
      reducer: { ...combined.reducers },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(combined.middleware),
    });

    combined.runMiddleware();

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });
    expect((store.getState() as any)[api.reducerPath].queries[cacheKey]).toMatchObject({
      status: 'fulfilled',
      data: { id: '1', name: 'Alice' },
    });
  });

  it('multiple apis: triggers are routed to the right slice and saga', async () => {
    const usersApi = createApi({
      name: 'usersApi',
      queries: (query) => ({
        getUser: query({
          async execute({ id }: { id: string }) {
            return { data: { id, kind: 'user' } };
          },
        }),
      }),
    });

    const ordersApi = createApi({
      name: 'ordersApi',
      queries: (query) => ({
        getOrder: query({
          async execute({ id }: { id: string }) {
            return { data: { id, kind: 'order' } };
          },
        }),
      }),
    });

    const combined = combineApis([usersApi, ordersApi]);

    const store = configureStore({
      reducer: { ...combined.reducers },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(combined.middleware),
    });

    combined.runMiddleware();

    store.dispatch(usersApi.queries.getUser.trigger({ id: 'u1' }));
    await flush();

    const userCacheKey = buildCacheKey(usersApi.queries.getUser._key, { id: 'u1' });
    const orderCacheKey = buildCacheKey(ordersApi.queries.getOrder._key, { id: 'u1' });

    expect((store.getState() as any)[usersApi.reducerPath].queries[userCacheKey]).toMatchObject({
      status: 'fulfilled',
      data: { id: 'u1', kind: 'user' },
    });
    expect((store.getState() as any)[ordersApi.reducerPath].queries[orderCacheKey]).toBeUndefined();
  });

  it('wires `getState` so async ctx.getState() reads live store state', async () => {
    const counterSlice = createSlice({
      name: 'counter',
      initialState: { value: 0 },
      reducers: {
        set: (state, action: { payload: number }) => {
          state.value = action.payload;
        },
      },
    });

    const api = createApi({
      name: 'usersApi',
      mutations: (mutation) => ({
        readCounter: mutation({
          async execute(_args: void, { getState }) {
            const root = getState() as { counter: { value: number } };
            return { data: { counter: root.counter.value } };
          },
        }),
      }),
    });

    const combined = combineApis([api]);

    const store = configureStore({
      reducer: {
        ...combined.reducers,
        counter: counterSlice.reducer,
      },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(combined.middleware),
    });

    combined.runMiddleware();

    store.dispatch(counterSlice.actions.set(7));
    store.dispatch(api.mutations.readCounter.trigger());
    await flush();

    expect(
      (store.getState() as any)[api.reducerPath].mutations[api.mutations.readCounter._key],
    ).toMatchObject({
      status: 'fulfilled',
      data: { counter: 7 },
    });
  });

  it('forwards uncaught saga errors to the onError handler', async () => {
    const api = createApi({
      name: 'usersApi',
      queries: (query) => ({
        ping: query({
          async execute() {
            return { data: 'ok' };
          },
        }),
      }),
    });

    // Replace the rootSaga with one that throws immediately, so an uncaught
    // failure bubbles through the saga middleware to onError.
    (api as any).rootSaga = function* () {
      throw new Error('synthetic root saga failure');
    };

    const onError = vi.fn();
    const combined = combineApis([api], { onError });

    configureStore({
      reducer: { ...combined.reducers },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(combined.middleware),
    });

    combined.runMiddleware();

    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    const [error, info] = onError.mock.calls[0]!;
    expect((error as Error).message).toBe('synthetic root saga failure');
    expect((info as { sagaStack: string }).sagaStack).toEqual(expect.any(String));
  });

  it('passes onError into the rootSaga as a run-arg (end-to-end)', async () => {
    const api = createApi({
      name: 'usersApi',
      queries: (query) => ({
        ping: query({
          async execute() {
            return { data: 'ok' };
          },
        }),
      }),
    });

    let crashCount = 0;
    // Replace rootSaga with one built via createRootSaga where a saga throws
    // once. The spawn-restart wrapper catches it and reruns; the catch calls
    // onError directly with the original Error instance.
    (api as any).rootSaga = function* (onError?: (e: Error) => void): Generator {
      yield* call(
        createRootSaga(
          [
            function* flake() {
              crashCount += 1;
              if (crashCount === 1) throw new Error('flake');
            },
          ],
          onError,
        ),
      );
    };

    const onError = vi.fn();
    const combined = combineApis([api], { onError });

    configureStore({
      reducer: { ...combined.reducers },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(combined.middleware),
    });

    combined.runMiddleware();

    await flush();
    await flush();

    expect(crashCount).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    const [err, info] = onError.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('flake'); // original message, not "Error: flake"
    expect((info as { sagaStack: string }).sagaStack).toEqual(expect.any(String));
  });

  it('coexists with a separate, unrelated saga middleware in the same store', async () => {
    const seenActions: string[] = [];

    // A pre-existing saga middleware (think: legacy app being migrated).
    const legacySagaMiddleware = createSagaMiddleware();
    function* legacyRootSaga(): Generator {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const action = yield* take('*');
        seenActions.push(action.type);
      }
    }

    const api = createApi({
      name: 'usersApi',
      queries: (query) => ({
        ping: query({
          async execute() {
            return { data: 'ok' };
          },
        }),
      }),
    });

    const combined = combineApis([api]);

    const store = configureStore({
      reducer: { ...combined.reducers },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false })
          .concat(legacySagaMiddleware as any)
          .concat(combined.middleware),
    });

    legacySagaMiddleware.run(legacyRootSaga);
    combined.runMiddleware();

    store.dispatch(api.queries.ping.trigger(undefined as any));
    await flush();
    await flush();

    // Legacy saga saw redux-workflow lifecycle actions...
    expect(seenActions.some((t) => t.includes('ping'))).toBe(true);
    // ...and the api still fulfilled normally.
    const cacheKey = buildCacheKey(api.queries.ping._key, undefined);
    expect((store.getState() as any)[api.reducerPath].queries[cacheKey]).toMatchObject({
      status: 'fulfilled',
      data: 'ok',
    });
  });

  it('throws if runMiddleware is called twice', () => {
    const api = createApi({
      name: 'usersApi',
      queries: (query) => ({
        getUser: query({
          async execute() {
            return { data: null };
          },
        }),
      }),
    });

    const combined = combineApis([api]);

    configureStore({
      reducer: { ...combined.reducers },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(combined.middleware),
    });

    combined.runMiddleware();
    expect(() => {
      combined.runMiddleware();
    }).toThrow(/runMiddleware called twice/);
  });

  it('runMiddleware works without any options bag', async () => {
    const api = createApi({
      name: 'usersApi',
      queries: (query) => ({
        getUser: query({
          async execute({ id }: { id: string }) {
            return { data: { id } };
          },
        }),
      }),
    });

    const combined = combineApis([api]);

    const store = configureStore({
      reducer: { ...combined.reducers },
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, thunk: false }).concat(combined.middleware),
    });

    combined.runMiddleware();

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });
    expect((store.getState() as any)[api.reducerPath].queries[cacheKey]).toMatchObject({
      status: 'fulfilled',
    });
  });
});

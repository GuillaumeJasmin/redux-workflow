/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-yield */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAction } from '@reduxjs/toolkit';
import { call } from 'typed-redux-saga';
import { createApi, buildCacheKey } from './index';
import { setupStore, getCache, getWorkflow } from './testing';

describe('redux-workflow queries', () => {
  it('dispatches pending then fulfilled with data when triggered', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id, name: 'Alice' } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'fulfilled',
      data: { id: '1', name: 'Alice' },
      error: null,
    });
  });

  it('runner always fetches on trigger (guard lives in useQuery/ctx.query)', async () => {
    const fetchSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            fetchSpy(args);
            return { data: { id: args.id, name: 'Alice' } };
          },
          cache: 60,
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('ctx.query reads cache directly when fresh, avoiding duplicate fetch', async () => {
    const fetchSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            fetchSpy(args);
            return { data: { id: args.id, name: 'Alice' } };
          },
          cache: 60,
        }),
      }),
      workflows: (workflow) => ({
        loadUser: workflow({
          *execute(args: { id: string }, { query }) {
            const first = yield* query('getUser', args);
            const second = yield* query('getUser', args);
            return { first, second };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(api.workflows.loadUser.trigger({ id: '1' }));
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getWorkflow(store, api.reducerPath, api.workflows.loadUser._key)).toMatchObject({
      status: 'fulfilled',
      data: {
        first: { data: { id: '1', name: 'Alice' } },
        second: { data: { id: '1', name: 'Alice' } },
      },
    });
  });

  it('marks entry rejected and records error when fetch throws', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(_args: { id: string }) {
            throw new Error('boom');
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'rejected',
      error: 'boom',
    });
  });

  it('marks entry rejected when fetch returns { error }', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(_args: { id: string }) {
            return { error: 'NOT_FOUND' };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'rejected',
      error: 'NOT_FOUND',
    });
  });

  it('auto-triggers when a listen action fires, using the action payload as args', async () => {
    const pageEntered = createAction<{ id: string }>('page/entered');
    const fetchSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          listen: pageEntered,
          *execute(args: { id: string }) {
            fetchSpy(args);
            return { data: { id: args.id, name: 'Alice' } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(pageEntered({ id: '42' }));
    await flush();

    expect(fetchSpy).toHaveBeenCalledWith({ id: '42' });
    expect(
      getCache(store, api.reducerPath, buildCacheKey(api.queries.getUser._key, { id: '42' })),
    ).toMatchObject({ status: 'fulfilled' });
  });
});

describe('redux-workflow query concurrency', () => {
  it('runs fetches for different args in parallel without cancelling each other', async () => {
    let resolveFirst: (v: { id: string; name: string }) => void = () => {
      /* noop */
    };
    let resolveSecond: (v: { id: string; name: string }) => void = () => {
      /* noop */
    };
    const firstPromise = new Promise<{ id: string; name: string }>((r) => {
      resolveFirst = r;
    });
    const secondPromise = new Promise<{ id: string; name: string }>((r) => {
      resolveSecond = r;
    });

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            if (args.id === '1') {
              const data = yield* call(() => firstPromise);
              return { data };
            }
            const data = yield* call(() => secondPromise);
            return { data };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const key1 = buildCacheKey(api.queries.getUser._key, { id: '1' });
    const key2 = buildCacheKey(api.queries.getUser._key, { id: '2' });

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    store.dispatch(api.queries.getUser.trigger({ id: '2' }));
    await flush();

    expect(getCache(store, api.reducerPath, key1)).toMatchObject({
      status: 'pending',
    });
    expect(getCache(store, api.reducerPath, key2)).toMatchObject({
      status: 'pending',
    });

    resolveFirst({ id: '1', name: 'Alice' });
    await flush();
    expect(getCache(store, api.reducerPath, key1)).toMatchObject({
      status: 'fulfilled',
      data: { id: '1', name: 'Alice' },
    });
    expect(getCache(store, api.reducerPath, key2)).toMatchObject({
      status: 'pending',
    });

    resolveSecond({ id: '2', name: 'Bob' });
    await flush();
    expect(getCache(store, api.reducerPath, key2)).toMatchObject({
      status: 'fulfilled',
      data: { id: '2', name: 'Bob' },
    });
  });

  it('dedups concurrent same-args triggers — only one fetch, one on.pending', async () => {
    const resolvers: ((v: { id: string; name: string }) => void)[] = [];

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(_args: { id: string }) {
            const data = yield* call(
              () =>
                new Promise<{ id: string; name: string }>((r) => {
                  resolvers.push(r);
                }),
            );
            return { data };
          },
        }),
      }),
    });

    const { store, flush, dispatchedActions } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    expect(resolvers).toHaveLength(1);

    const pendingCount = dispatchedActions.filter(
      (a) => a.type === api.queries.getUser.on.pending.type,
    ).length;
    expect(pendingCount).toBe(1);

    resolvers[0]!({ id: '1', name: 'Alice' });
    await flush();
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'fulfilled',
      data: { id: '1', name: 'Alice' },
    });
  });

  it('allows re-trigger after fulfillment (not deduped once settled)', async () => {
    const fetchSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            fetchSpy(args);
            return { data: { id: args.id, name: 'Alice' } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('redux-workflow polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-fetches at the poll interval', async () => {
    const fetchSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getAlerts: query({
          *execute() {
            fetchSpy();
            return { data: [] };
          },
          poll: 10,
        }),
      }),
    });

    const { store } = setupStore(api);

    store.dispatch(api.queries.getAlerts.trigger(undefined as any));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

/* eslint-disable require-yield */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApi, buildCacheKey } from './index';
import { setupStore, getCache } from './testing';

describe('redux-workflow gc', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes entry after keepUnusedDataFor when the last subscriber unsubscribes', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id } };
          },
          keepUnusedDataFor: 30,
        }),
      }),
    });

    const { store } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey }));
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'fulfilled',
    });

    store.dispatch(api.queries.getUser._unsubscribe({ args: { id: '1' }, cacheKey }));
    await vi.advanceTimersByTimeAsync(0);
    expect(getCache(store, api.reducerPath, cacheKey)).toBeDefined();

    await vi.advanceTimersByTimeAsync(29_000);
    expect(getCache(store, api.reducerPath, cacheKey)).toBeDefined();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(getCache(store, api.reducerPath, cacheKey)).toBeUndefined();
  });

  it('cancels pending gc when a new subscriber arrives in the keepUnusedDataFor window', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id } };
          },
          keepUnusedDataFor: 30,
        }),
      }),
    });

    const { store } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey }));
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await vi.advanceTimersByTimeAsync(0);

    store.dispatch(api.queries.getUser._unsubscribe({ args: { id: '1' }, cacheKey }));
    await vi.advanceTimersByTimeAsync(10_000);

    store.dispatch(api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey }));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'fulfilled',
    });
  });

  it('keeps the entry while at least one subscriber remains', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id } };
          },
          keepUnusedDataFor: 30,
        }),
      }),
    });

    const { store } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey }));
    store.dispatch(api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey }));
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await vi.advanceTimersByTimeAsync(0);

    store.dispatch(api.queries.getUser._unsubscribe({ args: { id: '1' }, cacheKey }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getCache(store, api.reducerPath, cacheKey)).toBeDefined();

    store.dispatch(api.queries.getUser._unsubscribe({ args: { id: '1' }, cacheKey }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getCache(store, api.reducerPath, cacheKey)).toBeUndefined();
  });

  it('keepUnusedDataFor: Infinity never removes the entry', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id } };
          },
          keepUnusedDataFor: Infinity,
        }),
      }),
    });

    const { store } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey }));
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await vi.advanceTimersByTimeAsync(0);

    store.dispatch(api.queries.getUser._unsubscribe({ args: { id: '1' }, cacheKey }));
    await vi.advanceTimersByTimeAsync(3_600_000);

    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'fulfilled',
    });
  });

  it('keepUnusedDataFor: 0 removes the entry immediately on last unsubscribe', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id } };
          },
          keepUnusedDataFor: 0,
        }),
      }),
    });

    const { store } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey }));
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(getCache(store, api.reducerPath, cacheKey)).toBeDefined();

    store.dispatch(api.queries.getUser._unsubscribe({ args: { id: '1' }, cacheKey }));
    await vi.advanceTimersByTimeAsync(0);
    expect(getCache(store, api.reducerPath, cacheKey)).toBeUndefined();
  });
});

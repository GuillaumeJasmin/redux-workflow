/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-yield */

import { describe, it, expect, vi } from 'vitest';
import { createApi, buildCacheKey } from './index';
import { setupStore, getCache } from './testing';

describe('redux-workflow invalidation', () => {
  it('re-fetches after api.invalidateCache', async () => {
    const fetchSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            fetchSpy();
            return { data: { id: args.id, name: 'Alice' } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    store.dispatch(api.invalidateCache({ cacheKey }));
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'fulfilled',
    });
  });

  it('mutation.invalidates refetches cache entries matching the target query prefix', async () => {
    const fetchSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        list: query({
          *execute() {
            fetchSpy();
            return { data: ['a', 'b'] };
          },
        }),
      }),
      mutations: (mutation) => ({
        add: mutation({
          *execute(_args: { name: string }) {
            return { data: null };
          },
          invalidates: ['list'],
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    const listCacheKey = buildCacheKey(api.queries.list._key, undefined);

    store.dispatch(api.queries.list.trigger(undefined as any));
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    store.dispatch(api.mutations.add.trigger({ name: 'c' }));
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(getCache(store, api.reducerPath, listCacheKey)).toMatchObject({
      status: 'fulfilled',
    });
  });
});

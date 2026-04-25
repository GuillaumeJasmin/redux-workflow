/* eslint-disable require-yield */

import { describe, it, expect, vi } from 'vitest';
import { createAction } from '@reduxjs/toolkit';
import { createApi, buildCacheKey } from './index';
import { setupStore, getCache, getMutation } from './testing';

describe('redux-workflow mutations', () => {
  it('transitions mutation entry to fulfilled with returned data', async () => {
    const api = createApi({
      name: 'test',
      mutations: (mutation) => ({
        save: mutation({
          *execute(args: { value: string }) {
            return { data: { savedId: args.value } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(api.mutations.save.trigger({ value: 'x' }));
    await flush();

    expect(getMutation(store, api.reducerPath, api.mutations.save._key)).toMatchObject({
      status: 'fulfilled',
      data: { savedId: 'x' },
      error: null,
    });
  });

  it('auto-runs on listen action', async () => {
    const alertAcknowledged = createAction<{ alertId: string }>('alerts/acknowledged');
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      mutations: (mutation) => ({
        acknowledge: mutation({
          listen: alertAcknowledged,
          *execute(args: { alertId: string }) {
            executeSpy(args);
            return { data: null };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(alertAcknowledged({ alertId: 'a1' }));
    await flush();

    expect(executeSpy).toHaveBeenCalledWith({ alertId: 'a1' });
    expect(getMutation(store, api.reducerPath, api.mutations.acknowledge._key)).toMatchObject({
      status: 'fulfilled',
    });
  });

  it('marks entry rejected when execute throws', async () => {
    const api = createApi({
      name: 'test',
      mutations: (mutation) => ({
        save: mutation({
          *execute(_args: { value: string }) {
            throw new Error('oops');
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(api.mutations.save.trigger({ value: 'x' }));
    await flush();

    expect(getMutation(store, api.reducerPath, api.mutations.save._key)).toMatchObject({
      status: 'rejected',
      error: 'oops',
    });
  });

  it('marks entry rejected when execute returns { error }', async () => {
    const api = createApi({
      name: 'test',
      mutations: (mutation) => ({
        save: mutation({
          *execute(_args: { value: string }) {
            return { error: 'VALIDATION_FAILED' };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(api.mutations.save.trigger({ value: 'x' }));
    await flush();

    expect(getMutation(store, api.reducerPath, api.mutations.save._key)).toMatchObject({
      status: 'rejected',
      error: 'VALIDATION_FAILED',
    });
  });
});

describe('redux-workflow mutations — onStart / onError', () => {
  it('patches cache optimistically via onStart and keeps the patch on success', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getPost: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id, liked: false } };
          },
        }),
      }),
      mutations: (mutation) => ({
        like: mutation({
          *execute(_args: { id: string }) {
            return { data: { ok: true } };
          },
          *onStart({ id }, { getCache, patchCache }) {
            const previous = yield* getCache('getPost', { id });
            yield* patchCache(
              'getPost',
              { id },
              {
                id,
                liked: true,
              },
            );
            return previous;
          },
          *onError(previous, { id }, { patchCache }) {
            if (previous) {
              yield* patchCache('getPost', { id }, previous);
            }
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getPost._key, { id: '1' });

    store.dispatch(api.queries.getPost.trigger({ id: '1' }));
    await flush();
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      data: { id: '1', liked: false },
    });

    store.dispatch(api.mutations.like.trigger({ id: '1' }));
    await flush();
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      data: { id: '1', liked: true },
    });
  });

  it('rolls back via onError when execute throws', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getPost: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id, liked: false } };
          },
        }),
      }),
      mutations: (mutation) => ({
        like: mutation({
          *execute(_args: { id: string }) {
            throw new Error('server failed');
          },
          *onStart({ id }, { getCache, patchCache }) {
            const previous = yield* getCache('getPost', { id });
            yield* patchCache('getPost', { id }, { id, liked: true });
            return previous;
          },
          *onError(previous, { id }, { patchCache }) {
            if (previous) yield* patchCache('getPost', { id }, previous);
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getPost._key, { id: '1' });

    store.dispatch(api.queries.getPost.trigger({ id: '1' }));
    await flush();

    store.dispatch(api.mutations.like.trigger({ id: '1' }));
    await flush();

    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      data: { id: '1', liked: false },
    });
    expect(getMutation(store, api.reducerPath, api.mutations.like._key)).toMatchObject({
      status: 'rejected',
      error: 'server failed',
    });
  });
});

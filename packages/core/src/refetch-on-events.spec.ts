/* eslint-disable require-yield */

import { describe, it, expect, vi } from 'vitest';
import { buildCacheKey, createApi, setupListeners } from './index';
import { focusEvent, onlineEvent } from './events';
import { setupStore, getCache } from './testing';

describe('redux-workflow — refetchOnFocus', () => {
  it('refetches subscribed entries when focusEvent fires', async () => {
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          refetchOnFocus: true,
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    // Simulate a mounted useQuery: subscribe + trigger.
    store.dispatch(
      api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey, refetchOnFocus: true }),
    );
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(1);

    // Focus event fires — entry is subscribed, should refetch.
    store.dispatch(focusEvent());
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });

  it('does NOT refetch when no subscriber resolves refetchOnFocus to true', async () => {
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          // refetchOnFocus omitted — default is false
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey }));
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(1);

    store.dispatch(focusEvent());
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT refetch unsubscribed entries even with refetchOnFocus', async () => {
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          refetchOnFocus: true,
          // Keep the entry alive past unsubscribe so we can observe it.
          keepUnusedDataFor: Infinity,
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(
      api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey, refetchOnFocus: true }),
    );
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(1);

    // Unsubscribe — entry persists (gc=Infinity) but has no subscribers.
    store.dispatch(
      api.queries.getUser._unsubscribe({ args: { id: '1' }, cacheKey, refetchOnFocus: true }),
    );
    await flush();
    expect(getCache(store, api.reducerPath, cacheKey)).toBeDefined();

    store.dispatch(focusEvent());
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches every subscribed args combination independently', async () => {
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          refetchOnFocus: true,
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    for (const id of ['1', '2', '3']) {
      const cacheKey = buildCacheKey(api.queries.getUser._key, { id });
      store.dispatch(
        api.queries.getUser._subscribe({ args: { id }, cacheKey, refetchOnFocus: true }),
      );
      store.dispatch(api.queries.getUser.trigger({ id }));
    }
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(3);

    executeSpy.mockClear();
    store.dispatch(focusEvent());
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(3);
    expect(executeSpy.mock.calls.map((c) => c[0].id).sort()).toEqual(['1', '2', '3']);
  });
});

describe('redux-workflow — refetchOnFocus per-hook override', () => {
  it('refetches when a subscriber opts in even though the endpoint default is off', async () => {
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          // No endpoint default; the subscriber opts in explicitly.
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(
      api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey, refetchOnFocus: true }),
    );
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    executeSpy.mockClear();

    store.dispatch(focusEvent());
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT refetch when every subscriber opts out, even if the endpoint default is on', async () => {
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          refetchOnFocus: true,
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    // Hook resolves refetchOnFocus to false (override) and dispatches accordingly.
    store.dispatch(
      api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey, refetchOnFocus: false }),
    );
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    executeSpy.mockClear();

    store.dispatch(focusEvent());
    await flush();
    expect(executeSpy).not.toHaveBeenCalled();
  });
});

describe('redux-workflow — refetchOnReconnect', () => {
  it('refetches on onlineEvent when flag is set', async () => {
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          refetchOnReconnect: true,
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(
      api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey, refetchOnReconnect: true }),
    );
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(1);

    store.dispatch(onlineEvent());
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });

  it('focus and reconnect flags are independent (focus-only does not refetch on reconnect)', async () => {
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          refetchOnFocus: true,
          // refetchOnReconnect omitted
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(
      api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey, refetchOnFocus: true }),
    );
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    executeSpy.mockClear();

    store.dispatch(onlineEvent());
    await flush();
    expect(executeSpy).not.toHaveBeenCalled();

    store.dispatch(focusEvent());
    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('setupListeners', () => {
  it('custom platform wiring receives dispatching handlers and returns a cleanup', () => {
    const dispatch = vi.fn();
    const cleanupSpy = vi.fn();

    type Handlers = {
      onFocus: () => void;
      onFocusLost: () => void;
      onOnline: () => void;
      onOffline: () => void;
    };
    const capturedHandlers: { current: Handlers | null } = { current: null };

    const cleanup = setupListeners(dispatch, (_dispatch, handlers) => {
      capturedHandlers.current = handlers;
      return cleanupSpy;
    });

    expect(capturedHandlers.current).not.toBeNull();
    const handlers = capturedHandlers.current!;

    // Calling the handlers dispatches the matching global events.
    handlers.onFocus();
    expect(dispatch).toHaveBeenLastCalledWith(focusEvent());
    handlers.onOnline();
    expect(dispatch).toHaveBeenLastCalledWith(onlineEvent());

    cleanup();
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it('end-to-end: platform-driven focus refetches the subscribed entry', async () => {
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          refetchOnFocus: true,
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    store.dispatch(
      api.queries.getUser._subscribe({ args: { id: '1' }, cacheKey, refetchOnFocus: true }),
    );
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();
    executeSpy.mockClear();

    // Simulate a platform bridge calling `onFocus()`.
    setupListeners(store.dispatch, (_dispatch, { onFocus }) => {
      onFocus();
      return () => {
        /* noop */
      };
    });

    await flush();
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});

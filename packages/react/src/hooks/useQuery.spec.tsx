/* eslint-disable require-yield */

import { StrictMode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createApi, buildCacheKey, focusEvent } from '@redux-workflow/core';
import { setupStore } from '@redux-workflow/core/testing';
import { useQuery, type UseQueryOptions } from './useQuery';

function makeApi(executeSpy: (args: { id: string }) => void) {
  return createApi({
    name: 'test',
    queries: (query) => ({
      getUser: query({
        *execute(args: { id: string }) {
          executeSpy(args);
          return { data: { id: args.id, name: 'Alice' } };
        },
        cache: 60,
      }),
    }),
  });
}

type Api = ReturnType<typeof makeApi>;

function Harness({
  api,
  args,
  options,
}: {
  api: Api;
  args: { id: string };
  options?: UseQueryOptions;
}) {
  useQuery(api.queries.getUser, args, options);
  return null;
}

async function flushAll(promise: Promise<unknown>) {
  await act(async () => {
    await promise;
    // The gc-runner debounces subscribe/unsubscribe via `delay(0)`
    // (a setTimeout(0)). The store helper's flush waits on setImmediate,
    // which sits in a different phase of the event loop. Let one
    // setTimeout(0) tick fire so the debounced firstSubscribe / lastUnsubscribe
    // are dispatched before the test inspects state.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useQuery — refetchOnMountOrArgChange', () => {
  it('default (false): reuses fresh cache, does not refetch on remount', async () => {
    const executeSpy = vi.fn();
    const api = makeApi(executeSpy);
    const { store, flush } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    // First mount → triggers fetch.
    const { unmount } = render(
      <Provider store={store}>
        <Harness api={api} args={{ id: '1' }} />
      </Provider>,
    );
    await flushAll(flush());
    expect(executeSpy).toHaveBeenCalledTimes(1);

    unmount();
    cleanup();

    // Second mount within the cache window → no refetch.
    render(
      <Provider store={store}>
        <Harness api={api} args={{ id: '1' }} />
      </Provider>,
    );
    await flushAll(flush());
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(store.getState()[api.reducerPath].queries[cacheKey]).toMatchObject({
      status: 'fulfilled',
    });
  });

  it('true: forces a refetch on mount even when cache is fresh', async () => {
    const executeSpy = vi.fn();
    const api = makeApi(executeSpy);
    const { store, flush } = setupStore(api);

    const { unmount } = render(
      <Provider store={store}>
        <Harness api={api} args={{ id: '1' }} />
      </Provider>,
    );
    await flushAll(flush());
    expect(executeSpy).toHaveBeenCalledTimes(1);

    unmount();
    cleanup();

    render(
      <Provider store={store}>
        <Harness api={api} args={{ id: '1' }} options={{ refetchOnMountOrArgChange: true }} />
      </Provider>,
    );
    await flushAll(flush());
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });

  it('number: refetches only when cached data is older than N seconds', async () => {
    const executeSpy = vi.fn();
    const api = makeApi(executeSpy);
    const { store, flush } = setupStore(api);
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(0);
    const { unmount } = render(
      <Provider store={store}>
        <Harness api={api} args={{ id: '1' }} />
      </Provider>,
    );
    await flushAll(flush());
    expect(executeSpy).toHaveBeenCalledTimes(1);

    unmount();
    cleanup();

    // Threshold is well above the entry age — no refetch.
    nowSpy.mockReturnValue(30_000);
    render(
      <Provider store={store}>
        <Harness api={api} args={{ id: '1' }} options={{ refetchOnMountOrArgChange: 60 }} />
      </Provider>,
    );
    await flushAll(flush());
    expect(executeSpy).toHaveBeenCalledTimes(1);
    cleanup();

    // Now the entry is older than the threshold → refetch.
    nowSpy.mockReturnValue(120_000);
    render(
      <Provider store={store}>
        <Harness api={api} args={{ id: '1' }} options={{ refetchOnMountOrArgChange: 60 }} />
      </Provider>,
    );
    await flushAll(flush());
    expect(executeSpy).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });
});

describe('useQuery — refetchOnFocus per-hook override', () => {
  function makeFocusApi(executeSpy: (args: { id: string }) => void, endpointDefault: boolean) {
    return createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          refetchOnFocus: endpointDefault,
          *execute(args: { id: string }) {
            executeSpy(args);
            return { data: { id: args.id } };
          },
        }),
      }),
    });
  }

  it('hook option `true` opts in even when endpoint default is off', async () => {
    const executeSpy = vi.fn();
    const api = makeFocusApi(executeSpy, false);
    const { store, flush } = setupStore(api);

    render(
      <Provider store={store}>
        <Harness
          api={api as unknown as Api}
          args={{ id: '1' }}
          options={{ refetchOnFocus: true }}
        />
      </Provider>,
    );
    await flushAll(flush());
    executeSpy.mockClear();

    store.dispatch(focusEvent());
    await flushAll(flush());
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('hook option `false` opts out even when endpoint default is on', async () => {
    const executeSpy = vi.fn();
    const api = makeFocusApi(executeSpy, true);
    const { store, flush } = setupStore(api);

    render(
      <Provider store={store}>
        <Harness
          api={api as unknown as Api}
          args={{ id: '1' }}
          options={{ refetchOnFocus: false }}
        />
      </Provider>,
    );
    await flushAll(flush());
    executeSpy.mockClear();

    store.dispatch(focusEvent());
    await flushAll(flush());
    expect(executeSpy).not.toHaveBeenCalled();
  });
});

describe('useQuery — single mount fires lifecycle once (strict-mode safe)', () => {
  it('a single <StrictMode> mount dispatches each lifecycle action once', async () => {
    const executeSpy = vi.fn();
    const api = makeApi(executeSpy);
    const { store, flush, dispatchedActions } = setupStore(api);

    render(
      <Provider store={store}>
        <StrictMode>
          <Harness api={api} args={{ id: '1' }} />
        </StrictMode>
      </Provider>,
    );
    await flushAll(flush());

    const counts = {
      trigger: dispatchedActions.filter((a) => a.type === api.queries.getUser.trigger.type).length,
      pending: dispatchedActions.filter((a) => a.type === api.queries.getUser.on.pending.type)
        .length,
      succeeded: dispatchedActions.filter((a) => a.type === api.queries.getUser.on.succeeded.type)
        .length,
      firstSubscribe: dispatchedActions.filter(
        (a) => a.type === api.queries.getUser.firstSubscribe.type,
      ).length,
      lastUnsubscribe: dispatchedActions.filter(
        (a) => a.type === api.queries.getUser.lastUnsubscribe.type,
      ).length,
    };

    expect(counts).toEqual({
      trigger: 1,
      pending: 1,
      succeeded: 1,
      firstSubscribe: 1,
      lastUnsubscribe: 0,
    });
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});

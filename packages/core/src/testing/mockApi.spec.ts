/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { createApi } from '../createApi';
import { setupApiTest } from './setupApiTest';
import { mockApi } from './mockApi';

// A "shared" auth-like api that other apis depend on.
function makeAuthApi() {
  return createApi({
    name: 'auth',
    queries: (query) => ({
      getCurrentUser: query({
        async execute(_args: void) {
          // Real implementation would call /me. Tests intercept this.
          throw new Error('real execute should not run in tests');
        },
      }),
    }),
    mutations: (mutation) => ({
      refreshToken: mutation({
        async execute(_args: void) {
          throw new Error('real execute should not run in tests');
        },
      }),
    }),
  });
}

describe('mockApi — intercepts queries/mutations of a dependent api', () => {
  it('routes a workflow query to the mock function', async () => {
    const authApi = makeAuthApi();
    let observed: { id: string; role: 'admin' | 'user' } | undefined;

    const billingApi = createApi({
      name: 'billing',
      workflows: (workflow) => ({
        sync: workflow({
          *execute(_args: void, { query }) {
            const result = yield* query(authApi.queries.getCurrentUser, undefined);
            if ('data' in result) {
              observed = result.data as { id: string; role: 'admin' | 'user' };
            }
          },
        }),
      }),
    });

    const harness = setupApiTest({
      api: billingApi,
      mocks: [
        mockApi(authApi, {
          queries: {
            getCurrentUser: () => ({ data: { id: '1', role: 'admin' as const } }),
          },
        }),
      ],
    });

    harness.dispatch(billingApi.workflows.sync.trigger());
    await harness.flush();

    expect(observed).toEqual({ id: '1', role: 'admin' });
    harness.then.workflow(billingApi.workflows.sync).isFulfilled();
  });

  it('mock function receives the args the workflow passed', async () => {
    const authApi = createApi({
      name: 'auth',
      queries: (query) => ({
        getUser: query({
          async execute(_args: { id: string }) {
            throw new Error('real execute should not run');
          },
        }),
      }),
    });

    let observed: string | undefined;

    const billingApi = createApi({
      name: 'billing',
      workflows: (workflow) => ({
        load: workflow({
          *execute(args: { id: string }, { query }) {
            const result = yield* query(authApi.queries.getUser, args);
            if ('data' in result) {
              observed = (result.data as { name: string }).name;
            }
          },
        }),
      }),
    });

    const harness = setupApiTest({
      api: billingApi,
      mocks: [
        mockApi(authApi, {
          queries: {
            // Args-aware mock — receives the trigger payload.
            getUser: (args: { id: string }) => ({ data: { name: `user-${args.id}` } }),
          },
        }),
      ],
    });

    harness.dispatch(billingApi.workflows.load.trigger({ id: '42' }));
    await harness.flush();

    expect(observed).toBe('user-42');
  });

  it('error result propagates as { error } to the workflow', async () => {
    const authApi = makeAuthApi();
    let outcome: 'ok' | 'failed' | undefined;

    const billingApi = createApi({
      name: 'billing',
      workflows: (workflow) => ({
        sync: workflow({
          *execute(_args: void, { query }) {
            const result = yield* query(authApi.queries.getCurrentUser, undefined);
            outcome = 'data' in result ? 'ok' : 'failed';
          },
        }),
      }),
    });

    const harness = setupApiTest({
      api: billingApi,
      mocks: [
        mockApi(authApi, {
          queries: {
            getCurrentUser: () => ({ error: 'NETWORK' }),
          },
        }),
      ],
    });

    harness.dispatch(billingApi.workflows.sync.trigger());
    await harness.flush();

    expect(outcome).toBe('failed');
  });

  it('promise-returning mock is awaited', async () => {
    const authApi = makeAuthApi();
    let observed: string | undefined;

    const billingApi = createApi({
      name: 'billing',
      workflows: (workflow) => ({
        renew: workflow({
          *execute(_args: void, { mutate }) {
            const result = yield* mutate(authApi.mutations.refreshToken, undefined);
            if ('data' in result) {
              observed = (result.data as { token: string }).token;
            }
          },
        }),
      }),
    });

    const harness = setupApiTest({
      api: billingApi,
      mocks: [
        mockApi(authApi, {
          mutations: {
            refreshToken: async () => {
              await new Promise((r) => setTimeout(r, 1));
              return { data: { token: 'async-token' } };
            },
          },
        }),
      ],
    });

    harness.dispatch(billingApi.workflows.renew.trigger());
    await harness.flush();
    // Need a second flush for the async mock + downstream actions.
    await new Promise((r) => setTimeout(r, 5));
    await harness.flush();

    expect(observed).toBe('async-token');
  });

  it('mocked api still has its reducer mounted — cache state lands correctly', async () => {
    const authApi = makeAuthApi();

    const billingApi = createApi({
      name: 'billing',
      workflows: (workflow) => ({
        sync: workflow({
          *execute(_args: void, { query }) {
            yield* query(authApi.queries.getCurrentUser, undefined);
          },
        }),
      }),
    });

    const harness = setupApiTest({
      api: billingApi,
      mocks: [
        mockApi(authApi, {
          queries: {
            getCurrentUser: () => ({ data: { id: '7', role: 'user' as const } }),
          },
        }),
      ],
    });

    harness.dispatch(billingApi.workflows.sync.trigger());
    await harness.flush();

    // Auth's cache subtree should have the entry, exactly as in production.
    harness.then
      .query(authApi.queries.getCurrentUser, undefined)
      .isFulfilled()
      .hasData({ id: '7', role: 'user' });
  });

  it('throws at mockApi() call site if a mocked name does not exist', () => {
    const authApi = makeAuthApi();

    expect(() =>
      mockApi(authApi, {
        queries: {
          // typo — not on authApi
          nonExistent: () => ({ data: null }),
        } as any,
      }),
    ).toThrow(/query "nonExistent" not found on api "auth"/);
  });
});

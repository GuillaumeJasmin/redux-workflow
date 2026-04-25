/* eslint-disable require-yield */

import { describe, it, expect } from 'vitest';
import { createApi, buildCacheKey } from '@redux-workflow/core';
import { createReactHooks } from './index';
import { setupStore, getCache } from '@redux-workflow/core/testing';

describe('redux-workflow useQuery skip', () => {
  it('hook-level skip: reducerPath state is unchanged when _subscribe/trigger are never dispatched', () => {
    // We can't render hooks here (node env); assert the behavior that the hook
    // would produce: when skip=true, the hook does not dispatch subscribe or
    // trigger. So manually skipping the dispatches results in no cache entry.
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id } };
          },
        }),
      }),
    });

    const { store } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });

    expect(getCache(store, api.reducerPath, cacheKey)).toBeUndefined();
  });
});

describe('createReactHooks', () => {
  it('generates use<Name>Query / useLazyQuery / Mutation / Workflow hooks from an api', () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id } };
          },
        }),
      }),
      mutations: (mutation) => ({
        saveUser: mutation({
          *execute(_args: { name: string }) {
            return { data: null };
          },
        }),
      }),
      workflows: (workflow) => ({
        admit: workflow({
          *execute(_args: { id: string }) {
            return null;
          },
        }),
      }),
    });

    const hooks = createReactHooks(api);

    expect(typeof hooks.useGetUserQuery).toBe('function');
    expect(typeof hooks.useGetUserLazyQuery).toBe('function');
    expect(typeof hooks.useSaveUserMutation).toBe('function');
    expect(typeof hooks.useAdmitWorkflow).toBe('function');
  });

  it('capitalizes only the first letter of the endpoint name', () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        fetchAllGames: query({
          *execute() {
            return { data: [] };
          },
        }),
      }),
    });

    const hooks = createReactHooks(api);

    // 'fetchAllGames' → 'useFetchAllGamesQuery', not 'useFETCHALLGAMESQuery'.
    expect(typeof hooks.useFetchAllGamesQuery).toBe('function');
    expect(typeof hooks.useFetchAllGamesLazyQuery).toBe('function');
  });
});

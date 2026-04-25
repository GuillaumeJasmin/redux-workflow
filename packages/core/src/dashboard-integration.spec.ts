/* eslint-disable require-yield */

import { describe, it, expect, vi } from 'vitest';
import { createAction } from '@reduxjs/toolkit';
import { createApi, buildCacheKey } from './index';
import { setupStore, getCache } from './testing';

describe('redux-workflow — dashboard scenario', () => {
  it('orchestrates listen → workflow → ctx.mutate → invalidate → refetch', async () => {
    const pageEntered = createAction<{ patientId: string }>('dash/pageEntered');

    const fetchAlertsSpy = vi.fn();

    const api = createApi({
      name: 'dashboard',
      queries: (query) => ({
        getAlerts: query({
          *execute(args: { patientId: string }) {
            fetchAlertsSpy(args);
            return { data: [{ id: 'a1', patientId: args.patientId }] };
          },
          cache: 60,
        }),
      }),
      mutations: (mutation) => ({
        acknowledge: mutation({
          *execute(_args: { alertId: string; patientId: string }) {
            return { data: null };
          },
          invalidates: ['getAlerts'],
        }),
      }),
      workflows: (workflow) => ({
        onEnter: workflow({
          listen: pageEntered,
          *execute(args: { patientId: string }, { query }) {
            const result = yield* query('getAlerts', {
              patientId: args.patientId,
            });
            if ('error' in result) throw new Error('alerts failed');
            return result.data;
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    const alertsCacheKey = buildCacheKey(api.queries.getAlerts._key, {
      patientId: 'p1',
    });

    // 1. User enters the page — workflow auto-runs and fetches alerts.
    store.dispatch(pageEntered({ patientId: 'p1' }));
    await flush();
    expect(fetchAlertsSpy).toHaveBeenCalledTimes(1);
    expect(getCache(store, api.reducerPath, alertsCacheKey)).toMatchObject({
      status: 'fulfilled',
    });

    // 2. User enters again — cache is fresh, ctx.query reads from cache.
    store.dispatch(pageEntered({ patientId: 'p1' }));
    await flush();
    expect(fetchAlertsSpy).toHaveBeenCalledTimes(1);

    // 3. Ack mutation invalidates getAlerts — cache refetches.
    store.dispatch(
      api.mutations.acknowledge.trigger({
        alertId: 'a1',
        patientId: 'p1',
      }),
    );
    await flush();
    expect(fetchAlertsSpy).toHaveBeenCalledTimes(2);
  });
});

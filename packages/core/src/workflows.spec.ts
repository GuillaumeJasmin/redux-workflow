/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-yield */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAction } from '@reduxjs/toolkit';
import { delay } from 'typed-redux-saga';
import { createApi, buildCacheKey } from './index';
import { setupStore, getCache, getWorkflow } from './testing';

describe('redux-workflow workflows', () => {
  it('runs execute on manual trigger and transitions to fulfilled', async () => {
    const api = createApi({
      name: 'test',
      workflows: (workflow) => ({
        run: workflow({
          *execute(args: { n: number }) {
            return args.n * 2;
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(api.workflows.run.trigger({ n: 21 }));
    await flush();

    expect(getWorkflow(store, api.reducerPath, api.workflows.run._key)).toMatchObject({
      status: 'fulfilled',
      data: 42,
    });
  });

  it('auto-runs on listen action and forwards payload as args', async () => {
    const pageEntered = createAction<{ patientId: string }>('page/entered');
    const executeSpy = vi.fn();

    const api = createApi({
      name: 'test',
      workflows: (workflow) => ({
        load: workflow({
          listen: pageEntered.match,
          *execute(args: { patientId: string }) {
            executeSpy(args);
            return args.patientId;
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(pageEntered({ patientId: 'p1' }));
    await flush();

    expect(executeSpy).toHaveBeenCalledWith({ patientId: 'p1' });
    expect(getWorkflow(store, api.reducerPath, api.workflows.load._key)).toMatchObject({
      status: 'fulfilled',
      data: 'p1',
    });
  });

  it('cancels the execute saga when a dismiss action fires', async () => {
    vi.useFakeTimers();

    const pageLeft = createAction('page/left');
    const finallyRan = vi.fn();

    const api = createApi({
      name: 'test',
      workflows: (workflow) => ({
        watch: workflow({
          dismiss: pageLeft.match,
          *execute() {
            try {
              yield* delay(60_000);
              return 'done';
            } finally {
              finallyRan();
            }
          },
        }),
      }),
    });

    const { store } = setupStore(api);

    store.dispatch(api.workflows.watch.trigger(undefined as any));
    await vi.advanceTimersByTimeAsync(0);

    expect(getWorkflow(store, api.reducerPath, api.workflows.watch._key)).toMatchObject({
      status: 'pending',
    });

    store.dispatch(pageLeft());
    await vi.advanceTimersByTimeAsync(0);

    expect(finallyRan).toHaveBeenCalledTimes(1);
    expect(getWorkflow(store, api.reducerPath, api.workflows.watch._key)).toMatchObject({
      status: 'rejected',
      error: 'cancelled',
    });

    vi.useRealTimers();
  });

  it('cancels on the internal cancel action (cancelOnUnmount path)', async () => {
    vi.useFakeTimers();

    const api = createApi({
      name: 'test',
      workflows: (workflow) => ({
        watch: workflow({
          *execute() {
            yield* delay(60_000);
            return 'done';
          },
        }),
      }),
    });

    const { store } = setupStore(api);

    store.dispatch(api.workflows.watch.trigger(undefined as any));
    await vi.advanceTimersByTimeAsync(0);
    expect(getWorkflow(store, api.reducerPath, api.workflows.watch._key)).toMatchObject({
      status: 'pending',
    });

    store.dispatch(api.workflows.watch.cancel());
    await vi.advanceTimersByTimeAsync(0);

    expect(getWorkflow(store, api.reducerPath, api.workflows.watch._key)).toMatchObject({
      status: 'rejected',
      error: 'cancelled',
    });

    vi.useRealTimers();
  });

  it('composes queries and mutations via ctx and returns typed data', async () => {
    const patientAdmitted = createAction<{ id: string }>('patient/admitted');

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getPatient: query({
          *execute(args: { id: string }) {
            return { data: { id: args.id, active: true } };
          },
          cache: 60,
        }),
      }),
      mutations: (mutation) => ({
        notify: mutation({
          *execute(_args: { id: string }) {
            return { data: { ok: true } };
          },
        }),
      }),
      workflows: (workflow) => ({
        admit: workflow({
          *execute(args: { id: string }, { query, mutate, put }) {
            const patientResult = yield* query('getPatient', { id: args.id });
            if ('error' in patientResult) throw new Error('patient failed');
            if (!patientResult.data.active) throw new Error('inactive');
            const res = yield* mutate('notify', { id: args.id });
            yield* put(patientAdmitted({ id: args.id }));
            return { patient: patientResult.data, res };
          },
        }),
      }),
    });

    const { store, flush, dispatchedActions } = setupStore(api);

    store.dispatch(api.workflows.admit.trigger({ id: 'p1' }));
    await flush();

    expect(dispatchedActions.map((a) => a.type)).toContain('patient/admitted');
    const entry = getWorkflow(store, api.reducerPath, api.workflows.admit._key);
    expect(entry).toMatchObject({ status: 'fulfilled' });
    expect((entry?.data as any).patient).toEqual({
      id: 'p1',
      active: true,
    });
  });

  it('ctx.query returns { error } when the underlying fetch fails', async () => {
    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getThing: query({
          *execute() {
            throw new Error('fetch failed');
          },
        }),
      }),
      workflows: (workflow) => ({
        run: workflow({
          *execute(_args: undefined, { query }) {
            const result = yield* query('getThing', undefined);
            if ('error' in result) {
              return { handledError: result.error };
            }
            return { handledError: null };
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(api.workflows.run.trigger(undefined as any));
    await flush();

    expect(getWorkflow(store, api.reducerPath, api.workflows.run._key)).toMatchObject({
      status: 'fulfilled',
      data: { handledError: 'fetch failed' },
    });
  });

  it('reset clears the workflow entry', async () => {
    const api = createApi({
      name: 'test',
      workflows: (workflow) => ({
        run: workflow({
          *execute() {
            return 'ok';
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    store.dispatch(api.workflows.run.trigger(undefined as any));
    await flush();
    expect(getWorkflow(store, api.reducerPath, api.workflows.run._key)).toBeDefined();

    store.dispatch(api.workflows.run._reset({ workflowKey: api.workflows.run._key }));
    expect(getWorkflow(store, api.reducerPath, api.workflows.run._key)).toBeUndefined();
  });
});

describe('redux-workflow workflows — streaming pattern', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a stream on first subscribe, patches cache on push, closes on last unsubscribe', async () => {
    const opened: string[] = [];
    const closed: string[] = [];

    const api = createApi({
      name: 'chat',
      queries: (query) => ({
        messages: query({
          *execute(args: { roomId: string }) {
            return { data: [{ id: 'initial', roomId: args.roomId }] };
          },
          keepUnusedDataFor: Infinity,
        }),
      }),
      workflows: (workflow, { queries }) => ({
        streamMessages: workflow({
          listen: queries.messages.firstSubscribe.match,
          dismiss: queries.messages.lastUnsubscribe.match,
          *execute(payload: { args: { roomId: string }; cacheKey: string }, { patchCache }) {
            opened.push(payload.args.roomId);
            try {
              for (let i = 0; i < 3; i++) {
                yield* delay(1_000);
                yield* patchCache('messages', { roomId: payload.args.roomId }, (previous) => [
                  ...(previous ?? []),
                  { id: `msg-${i}`, roomId: payload.args.roomId },
                ]);
              }
            } finally {
              closed.push(payload.args.roomId);
            }
          },
        }),
      }),
    });

    const { store } = setupStore(api);
    const cacheKey = buildCacheKey(api.queries.messages._key, {
      roomId: 'r1',
    });

    store.dispatch(api.queries.messages._subscribe({ args: { roomId: 'r1' }, cacheKey }));
    store.dispatch(api.queries.messages.trigger({ roomId: 'r1' }));
    await vi.advanceTimersByTimeAsync(0);

    expect(opened).toEqual(['r1']);
    expect(getCache(store, api.reducerPath, cacheKey)?.data).toEqual([
      { id: 'initial', roomId: 'r1' },
    ]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(getCache(store, api.reducerPath, cacheKey)?.data).toEqual([
      { id: 'initial', roomId: 'r1' },
      { id: 'msg-0', roomId: 'r1' },
    ]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(getCache(store, api.reducerPath, cacheKey)?.data).toHaveLength(3);

    store.dispatch(
      api.queries.messages._unsubscribe({
        args: { roomId: 'r1' },
        cacheKey,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(closed).toEqual(['r1']);
  });
});

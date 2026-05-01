/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { createAction, type PayloadAction } from '@reduxjs/toolkit';
import { createApi } from './index';
import { setupStore } from './testing';

describe('redux-workflow api slice', () => {
  it('exposes bound selectors that read from state[reducerPath].slice', () => {
    const api = createApi({
      name: 'newsletter',
      slice: (slice) =>
        slice({
          initialState: { isOpen: false, count: 0 },
          selectors: {
            selectIsOpen: (local) => local.isOpen,
            selectCount: (local) => local.count,
          },
        }),
    });

    const { store } = setupStore(api);

    expect(api.selectors.selectIsOpen(store.getState())).toBe(false);
    expect(api.selectors.selectCount(store.getState())).toBe(0);
  });

  it('selectors receive both local slice state and root state', () => {
    const externalUserChanged = createAction<{ canOpen: boolean }>('user/changed');

    const api = createApi({
      name: 'newsletter',
      slice: (slice) =>
        slice({
          initialState: { isOpen: true },
          selectors: {
            selectComposite: (local, root: any) => local.isOpen && root != null,
          },
        }),
    });

    const { store } = setupStore(api);

    expect(api.selectors.selectComposite(store.getState())).toBe(true);
    store.dispatch(externalUserChanged({ canOpen: true }));
    expect(api.selectors.selectComposite(store.getState())).toBe(true);
  });

  it('does not expose action creators on the public api', () => {
    const api = createApi({
      name: 'x',
      slice: (slice) => slice({ initialState: { count: 0 } }),
    });

    expect((api as any).actions).toBeUndefined();
  });

  it('workflows mutate slice state by dispatching actions the slice listens to', async () => {
    const opened = createAction('newsletter/opened');

    const api = createApi({
      name: 'newsletter',
      workflows: (workflow) => ({
        open: workflow({
          *execute(_args: void, { put }) {
            yield* put(opened());
          },
        }),
      }),
      slice: (slice) =>
        slice({
          initialState: { isOpen: false },
          extraReducers: (builder) => {
            builder.addCase(opened, (state) => {
              state.isOpen = true;
            });
          },
          selectors: {
            selectIsOpen: (local) => local.isOpen,
          },
        }),
    });

    const { store, flush } = setupStore(api);

    expect(api.selectors.selectIsOpen(store.getState())).toBe(false);
    store.dispatch(api.workflows.open.trigger());
    await flush();
    expect(api.selectors.selectIsOpen(store.getState())).toBe(true);
  });

  it('extraReducers reacts to external domain actions', () => {
    const userLoggedOut = createAction('user/loggedOut');

    const api = createApi({
      name: 'newsletter',
      slice: (slice) =>
        slice({
          initialState: { isOpen: true },
          extraReducers: (builder) => {
            builder.addCase(userLoggedOut, (state) => {
              state.isOpen = false;
            });
          },
          selectors: {
            selectIsOpen: (local) => local.isOpen,
          },
        }),
    });

    const { store } = setupStore(api);

    expect(api.selectors.selectIsOpen(store.getState())).toBe(true);
    store.dispatch(userLoggedOut());
    expect(api.selectors.selectIsOpen(store.getState())).toBe(false);
  });

  it('slice ctx exposes mutations.x.on.succeeded.match for direct extraReducers access', async () => {
    const api = createApi({
      name: 'newsletter',
      mutations: (mutation) => ({
        subscribe: mutation({
          async execute(_args: { email: string }) {
            return { data: null };
          },
        }),
      }),
      slice: (slice, { mutations }) =>
        slice({
          initialState: { subscribed: false },
          extraReducers: (builder) => {
            builder.addMatcher(mutations.subscribe.on.succeeded.match, (state) => {
              state.subscribed = true;
            });
          },
          selectors: {
            selectSubscribed: (local) => local.subscribed,
          },
        }),
    });

    const { store, flush } = setupStore(api);
    expect(api.selectors.selectSubscribed(store.getState())).toBe(false);
    store.dispatch(api.mutations.subscribe.trigger({ email: 'a@b.com' }));
    await flush();
    expect(api.selectors.selectSubscribed(store.getState())).toBe(true);
  });

  it('workflow ctx exposes slice selectors for reading slice state', async () => {
    let observed: number | undefined;

    const bumped = createAction('counter/bumped');

    const api = createApi({
      name: 'counter',
      slice: (slice) =>
        slice({
          initialState: { count: 0 },
          extraReducers: (builder) => {
            builder.addCase(bumped, (state) => {
              state.count += 1;
            });
          },
          selectors: {
            selectCount: (local) => local.count,
          },
        }),
      // Workflow ctx now has `selectors` — bound api selectors, no need
      // for api self-reference inside *execute.
      workflows: (workflow, { selectors }) => ({
        bumpAndRead: workflow({
          *execute(_args: void, { put, select }) {
            yield* put(bumped());
            yield* put(bumped());
            observed = yield* select(selectors.selectCount);
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.workflows.bumpAndRead.trigger());
    await flush();
    expect(observed).toBe(2);
  });

  it('apis without a slice expose an empty selectors object', () => {
    const api = createApi({
      name: 'no-slice',
      queries: () => ({}),
    });

    expect(api.selectors).toEqual({});
  });

  it('slice.reducers exposes typed action creators on the workflow ctx', async () => {
    const api = createApi({
      name: 'newsletter',
      slice: (slice) =>
        slice({
          initialState: { isOpen: false, email: '' },
          reducers: {
            // No-payload reducers declare `_action: PayloadAction<void>`
            // explicitly — same convention as createSlice.
            open: (state, _action: PayloadAction) => {
              state.isOpen = true;
            },
            close: (state, _action: PayloadAction) => {
              state.isOpen = false;
            },
            setEmail: (state, action: PayloadAction<string>) => {
              state.email = action.payload;
            },
          },
          selectors: {
            selectIsOpen: (local) => local.isOpen,
            selectEmail: (local) => local.email,
          },
        }),
      workflows: (workflow, { actions }) => ({
        showAndDraft: workflow({
          *execute(args: { email: string }, { put }) {
            yield* put(actions.open());
            yield* put(actions.setEmail(args.email));
          },
        }),
        hide: workflow({
          *execute(_args: void, { put }) {
            yield* put(actions.close());
          },
        }),
      }),
    });

    const { store, flush } = setupStore(api);

    expect(api.selectors.selectIsOpen(store.getState())).toBe(false);

    store.dispatch(api.workflows.showAndDraft.trigger({ email: 'a@b.com' }));
    await flush();
    expect(api.selectors.selectIsOpen(store.getState())).toBe(true);
    expect(api.selectors.selectEmail(store.getState())).toBe('a@b.com');

    store.dispatch(api.workflows.hide.trigger());
    await flush();
    expect(api.selectors.selectIsOpen(store.getState())).toBe(false);
  });

  it('slice.reducers actions are not exposed on the public api', () => {
    const api = createApi({
      name: 'x',
      slice: (slice) =>
        slice({
          initialState: { count: 0 },
          reducers: {
            inc: (state, _action: PayloadAction) => {
              state.count += 1;
            },
          },
        }),
    });

    // Privacy: action creators are reachable from the workflow ctx,
    // never from the public api surface.
    expect((api as any).actions).toBeUndefined();
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSlice, createAction, type PayloadAction } from '@reduxjs/toolkit';
import { call } from 'typed-redux-saga';
import { createApi } from '../createApi';
import { setupApiTest } from './setupApiTest';

type Game = { id: string; name: string };

function buildApi(fetchGameImpl: (id: string) => Promise<Game>) {
  const enteredDashboard = createAction<{ id: string }>('dashboard/entered');

  const api = createApi({
    name: 'gameApi',
    queries: (query) => ({
      fetchGame: query({
        listen: enteredDashboard.match,
        *execute({ id }: { id: string }) {
          try {
            const data = yield* call(() => fetchGameImpl(id));
            return { data };
          } catch (error) {
            return { error: (error as Error).message };
          }
        },
      }),
    }),
    mutations: (mutation) => ({
      renameGame: mutation({
        *execute(args: { id: string; name: string }) {
          const data = yield* call(() => Promise.resolve(args));
          return { data };
        },
        invalidates: ['fetchGame'],
      }),
    }),
  });

  const slice = createSlice({
    name: 'game',
    initialState: { game: null as Game | null },
    reducers: {},
    extraReducers: (builder) => {
      builder.addMatcher(
        api.queries.fetchGame.matchFulfilled,
        (state, action: PayloadAction<any>) => {
          state.game = action.payload.data;
        },
      );
    },
  });

  return { api, slice, enteredDashboard };
}

describe('setupApiTest — BDD dashboard scenario', () => {
  const game: Game = { id: 'abc', name: 'Adventure' };
  const fetchGameMock = vi.fn();
  const { api, slice, enteredDashboard } = buildApi((id) => fetchGameMock(id));
  const { dispatch, flush, then, reset } = setupApiTest({ api, slice });

  beforeEach(() => {
    reset();
    fetchGameMock.mockReset();
  });

  it('fetches the game when the user enters the dashboard', async () => {
    fetchGameMock.mockResolvedValue(game);

    dispatch(enteredDashboard({ id: game.id }));
    await flush();

    then.query(api.queries.fetchGame, { id: game.id }).isFulfilled().hasData(game);

    then.slice().matches({ game });
  });

  it('marks the query as rejected when the gateway fails', async () => {
    fetchGameMock.mockRejectedValue(new Error('GAME_NOT_FOUND'));

    dispatch(enteredDashboard({ id: game.id }));
    await flush();

    then.query(api.queries.fetchGame, { id: game.id }).isRejected().hasError('GAME_NOT_FOUND');
  });

  it('resets the store between tests (no bleed from the previous case)', () => {
    // Previous test left a cache entry; reset() should have cleared it.
    then.query(api.queries.fetchGame, { id: game.id }).isUninitialized();
    then.slice().matches({ game: null });
  });
});

describe('setupApiTest — mutation + partial match', () => {
  const fetchGameMock = vi.fn().mockResolvedValue({
    id: 'abc',
    name: 'Adventure',
  });
  const { api } = buildApi((id) => fetchGameMock(id));
  const { dispatch, flush, then, reset, getDispatchedActions } = setupApiTest({
    api,
  });

  beforeEach(() => {
    reset();
  });

  it('transitions the mutation to fulfilled and matches a partial shape', async () => {
    dispatch(api.mutations.renameGame.trigger({ id: 'abc', name: 'New name' }));
    await flush();

    then.mutation(api.mutations.renameGame).isFulfilled().hasPartialData({ id: 'abc' });
  });

  it('hasDispatchedAction matches by action creator (any payload)', async () => {
    dispatch(api.mutations.renameGame.trigger({ id: 'abc', name: 'x' }));
    await flush();

    then.hasDispatchedAction(api.mutations.renameGame.trigger);
    then.hasDispatchedAction(api.mutations.renameGame.matchFulfilled);
  });

  it('hasDispatchedAction matches by action object (type + payload)', async () => {
    dispatch(api.mutations.renameGame.trigger({ id: 'abc', name: 'New' }));
    await flush();

    then.hasDispatchedAction(api.mutations.renameGame.trigger({ id: 'abc', name: 'New' }));
  });

  it('hasNoDispatchedAction asserts absence of a type', async () => {
    dispatch(api.mutations.renameGame.trigger({ id: 'abc', name: 'x' }));
    await flush();

    // A query was never triggered in this scenario.
    then.hasNoDispatchedAction(api.queries.fetchGame.trigger);
  });

  it('getDispatchedActions still exposes the raw log', async () => {
    dispatch(api.mutations.renameGame.trigger({ id: 'abc', name: 'x' }));
    await flush();

    expect(getDispatchedActions().length).toBeGreaterThan(0);
  });
});

describe('setupApiTest — then.slice() without a slice', () => {
  const { api } = buildApi(() => Promise.resolve({ id: 'x', name: 'x' }));
  const harness = setupApiTest({ api });

  it('is not available when no slice was passed', () => {
    expect(harness.then.slice).toBeUndefined();
  });
});

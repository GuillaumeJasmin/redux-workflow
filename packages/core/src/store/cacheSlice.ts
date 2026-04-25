import {
  createSlice,
  isAnyOf,
  PayloadAction,
  type ActionCreatorWithPayload,
  type ActionCreatorWithoutPayload,
} from '@reduxjs/toolkit';
import type { QueryStatus, QueryInstance } from '../createApi/types';

export type CacheEntry<TData = unknown, TArgs = unknown> = {
  status: QueryStatus;
  data: TData | null;
  error: unknown | null;
  updatedAt: number | null;
  args: TArgs | null;
  /**
   * Number of active `useQuery` subscribers for this cacheKey. Maintained
   * by the cache slice via the `subscribe` / `unsubscribe` actions.
   */
  subscribers: number;
  /**
   * Subset of `subscribers` whose effective `refetchOnFocus` resolves to true
   * (hook option overrides endpoint default). The refetch runner only fires
   * for entries with `focusSubscribers > 0`.
   */
  focusSubscribers: number;
  /**
   * Subset of `subscribers` whose effective `refetchOnReconnect` resolves
   * to true.
   */
  reconnectSubscribers: number;
};

export type CacheState = Record<string, CacheEntry>;

const initialState: CacheState = {};

function getOrCreateEntry(state: CacheState, cacheKey: string): CacheEntry {
  state[cacheKey] ??= {
    status: 'uninitialized',
    data: null,
    error: null,
    updatedAt: null,
    args: null,
    subscribers: 0,
    focusSubscribers: 0,
    reconnectSubscribers: 0,
  };
  return state[cacheKey];
}

export function createCacheSlice(
  apiName: string,
  queryInstances: Record<string, QueryInstance>,
  invalidateCache: ActionCreatorWithPayload<{ cacheKey: string }>,
  resetCache: ActionCreatorWithoutPayload,
  removeFromCache: ActionCreatorWithPayload<{ cacheKey: string }>,
  patchCache: ActionCreatorWithPayload<{ cacheKey: string; data: unknown }>,
  subscribe: ActionCreatorWithPayload<{
    args: unknown;
    cacheKey: string;
    refetchOnFocus?: boolean;
    refetchOnReconnect?: boolean;
  }>,
  unsubscribe: ActionCreatorWithPayload<{
    args: unknown;
    cacheKey: string;
    refetchOnFocus?: boolean;
    refetchOnReconnect?: boolean;
  }>,
) {
  const instances = Object.values(queryInstances);
  const pendingCreators = instances.map((i) => i.on.pending);
  const succeededCreators = instances.map((i) => i.on.succeeded);
  const failedCreators = instances.map((i) => i.on.failed);

  return createSlice({
    name: `${apiName}/queryCache`,
    initialState,
    reducers: {},
    extraReducers: (builder) => {
      builder
        .addCase(invalidateCache, (state, action: PayloadAction<{ cacheKey: string }>) => {
          const entry = state[action.payload.cacheKey];
          if (entry) {
            entry.status = 'uninitialized';
            entry.updatedAt = null;
          }
        })
        .addCase(removeFromCache, (state, action: PayloadAction<{ cacheKey: string }>) => {
          delete state[action.payload.cacheKey];
        })
        .addCase(
          patchCache,
          (state, action: PayloadAction<{ cacheKey: string; data: unknown }>) => {
            const entry = getOrCreateEntry(state, action.payload.cacheKey);
            entry.status = 'fulfilled';
            entry.data = action.payload.data;
            entry.error = null;
            entry.updatedAt = Date.now();
          },
        )
        .addCase(resetCache, () => ({}))
        .addCase(
          subscribe,
          (
            state,
            action: PayloadAction<{
              cacheKey: string;
              refetchOnFocus?: boolean;
              refetchOnReconnect?: boolean;
            }>,
          ) => {
            const entry = getOrCreateEntry(state, action.payload.cacheKey);
            entry.subscribers += 1;
            if (action.payload.refetchOnFocus) entry.focusSubscribers += 1;
            if (action.payload.refetchOnReconnect) entry.reconnectSubscribers += 1;
          },
        )
        .addCase(
          unsubscribe,
          (
            state,
            action: PayloadAction<{
              cacheKey: string;
              refetchOnFocus?: boolean;
              refetchOnReconnect?: boolean;
            }>,
          ) => {
            const entry = state[action.payload.cacheKey];
            if (entry) {
              entry.subscribers = Math.max(entry.subscribers - 1, 0);
              if (action.payload.refetchOnFocus) {
                entry.focusSubscribers = Math.max(entry.focusSubscribers - 1, 0);
              }
              if (action.payload.refetchOnReconnect) {
                entry.reconnectSubscribers = Math.max(entry.reconnectSubscribers - 1, 0);
              }
            }
          },
        );

      if (pendingCreators.length === 0) return;

      builder
        .addMatcher(
          isAnyOf(...pendingCreators),
          (state, action: PayloadAction<{ cacheKey: string; args: unknown }>) => {
            const entry = getOrCreateEntry(state, action.payload.cacheKey);
            entry.status = 'pending';
            entry.error = null;
            entry.args = action.payload.args ?? null;
          },
        )
        .addMatcher(
          isAnyOf(...succeededCreators),
          (state, action: PayloadAction<{ cacheKey: string; data: unknown }>) => {
            const entry = getOrCreateEntry(state, action.payload.cacheKey);
            entry.status = 'fulfilled';
            entry.data = action.payload.data;
            entry.error = null;
            entry.updatedAt = Date.now();
          },
        )
        .addMatcher(
          isAnyOf(...failedCreators),
          (state, action: PayloadAction<{ cacheKey: string; error: unknown }>) => {
            const entry = getOrCreateEntry(state, action.payload.cacheKey);
            entry.status = 'rejected';
            entry.error = action.payload.error;
            entry.updatedAt = Date.now();
          },
        );
    },
  });
}

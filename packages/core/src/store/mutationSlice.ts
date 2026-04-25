import {
  createSlice,
  isAnyOf,
  PayloadAction,
  type ActionCreatorWithPayload,
} from '@reduxjs/toolkit';
import type { WorkflowStatus, MutationInstance } from '../createApi/types';

export type MutationEntry<TData = unknown> = {
  status: WorkflowStatus;
  data: TData | null;
  error: unknown | null;
  startedAt: number | null;
};

export type MutationState = Record<string, MutationEntry>;

const initialState: MutationState = {};

function getOrCreateEntry(state: MutationState, mutationKey: string): MutationEntry {
  state[mutationKey] ??= {
    status: 'idle',
    data: null,
    error: null,
    startedAt: null,
  };
  return state[mutationKey];
}

export function createMutationSlice(
  apiName: string,
  mutationInstances: Record<string, MutationInstance>,
  resetMutation: ActionCreatorWithPayload<{ mutationKey: string }>,
) {
  const instances = Object.values(mutationInstances);
  const pendingCreators = instances.map((i) => i.on.pending);
  const succeededCreators = instances.map((i) => i.on.succeeded);
  const failedCreators = instances.map((i) => i.on.failed);

  return createSlice({
    name: `${apiName}/mutationState`,
    initialState,
    reducers: {},
    extraReducers: (builder) => {
      builder.addCase(resetMutation, (state, action) => {
        delete state[action.payload.mutationKey];
      });

      if (pendingCreators.length === 0) return;

      builder
        .addMatcher(
          isAnyOf(...pendingCreators),
          (state, action: PayloadAction<{ mutationKey: string }>) => {
            const entry = getOrCreateEntry(state, action.payload.mutationKey);
            entry.status = 'pending';
            entry.error = null;
            entry.startedAt = Date.now();
          },
        )
        .addMatcher(
          isAnyOf(...succeededCreators),
          (state, action: PayloadAction<{ mutationKey: string; data: unknown }>) => {
            const entry = getOrCreateEntry(state, action.payload.mutationKey);
            entry.status = 'fulfilled';
            entry.data = action.payload.data;
            entry.error = null;
          },
        )
        .addMatcher(
          isAnyOf(...failedCreators),
          (state, action: PayloadAction<{ mutationKey: string; error: unknown }>) => {
            const entry = getOrCreateEntry(state, action.payload.mutationKey);
            entry.status = 'rejected';
            entry.error = action.payload.error;
          },
        );
    },
  });
}

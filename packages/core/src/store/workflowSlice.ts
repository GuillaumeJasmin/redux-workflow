import {
  createSlice,
  isAnyOf,
  PayloadAction,
  type ActionCreatorWithPayload,
} from '@reduxjs/toolkit';
import type { WorkflowStatus, WorkflowInstance } from '../createApi/types';

export type WorkflowEntry<TData = unknown> = {
  status: WorkflowStatus;
  data: TData | null;
  error: unknown | null;
  startedAt: number | null;
};

export type WorkflowState = Record<string, WorkflowEntry>;

const initialState: WorkflowState = {};

function getOrCreateEntry(state: WorkflowState, workflowKey: string): WorkflowEntry {
  state[workflowKey] ??= {
    status: 'idle',
    data: null,
    error: null,
    startedAt: null,
  };
  return state[workflowKey];
}

export function createWorkflowSlice(
  apiName: string,
  workflowInstances: Record<string, WorkflowInstance>,
  resetWorkflow: ActionCreatorWithPayload<{ workflowKey: string }>,
) {
  const instances = Object.values(workflowInstances);
  const pendingCreators = instances.map((i) => i.on.pending);
  const succeededCreators = instances.map((i) => i.on.succeeded);
  const failedCreators = instances.map((i) => i.on.failed);

  return createSlice({
    name: `${apiName}/workflowState`,
    initialState,
    reducers: {},
    extraReducers: (builder) => {
      builder.addCase(resetWorkflow, (state, action) => {
        delete state[action.payload.workflowKey];
      });

      if (pendingCreators.length === 0) return;

      builder
        .addMatcher(
          isAnyOf(...pendingCreators),
          (state, action: PayloadAction<{ workflowKey: string }>) => {
            const entry = getOrCreateEntry(state, action.payload.workflowKey);
            entry.status = 'pending';
            entry.error = null;
            entry.startedAt = Date.now();
          },
        )
        .addMatcher(
          isAnyOf(...succeededCreators),
          (state, action: PayloadAction<{ workflowKey: string; data: unknown }>) => {
            const entry = getOrCreateEntry(state, action.payload.workflowKey);
            entry.status = 'fulfilled';
            entry.data = action.payload.data;
            entry.error = null;
          },
        )
        .addMatcher(
          isAnyOf(...failedCreators),
          (state, action: PayloadAction<{ workflowKey: string; error: unknown }>) => {
            const entry = getOrCreateEntry(state, action.payload.workflowKey);
            entry.status = 'rejected';
            entry.error = action.payload.error;
          },
        );
    },
  });
}

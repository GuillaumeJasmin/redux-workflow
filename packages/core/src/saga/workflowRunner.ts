/* eslint-disable @typescript-eslint/no-explicit-any */

import { call, put, take, fork, join, cancel, cancelled, race, all } from 'typed-redux-saga';
import type { Action, ActionCreatorWithPayload, PayloadAction } from '@reduxjs/toolkit';
import { createSagaContext } from './sagaContext';
import { getActionTypes, toArray, toErrorMessage } from './actionHelpers';
import type {
  MutationInstance,
  QueryInstance,
  SagaGen,
  WorkflowInstance,
} from '../createApi/types';

function createWorkflowSaga(
  reducerPath: string,
  instance: WorkflowInstance,
  queryInstances: Record<string, QueryInstance>,
  mutationInstances: Record<string, MutationInstance>,
  patchCache: ActionCreatorWithPayload<{ cacheKey: string; data: unknown }>,
): (args: unknown) => SagaGen<void> {
  const { _def: def, _key: workflowKey } = instance;
  const ctx = createSagaContext(reducerPath, queryInstances, mutationInstances, patchCache);

  return function* runWorkflow(args: unknown): SagaGen<void> {
    yield* put(instance.on.pending({ args, workflowKey } as any));

    try {
      const data: unknown = yield* call(def.execute as any, args as any, ctx);

      yield* put(instance.on.succeeded({ args, workflowKey, data } as any));
    } catch (error) {
      yield* put(instance.on.failed({ args, workflowKey, error: toErrorMessage(error) } as any));
    } finally {
      if (yield* cancelled()) {
        const message = 'cancelled';
        yield* put(instance.on.failed({ args, workflowKey, error: message } as any));
      }
    }
  };
}

export function createWatchWorkflowTriggers(
  reducerPath: string,
  workflowInstances: Record<string, WorkflowInstance>,
  queryInstances: Record<string, QueryInstance>,
  mutationInstances: Record<string, MutationInstance>,
  patchCache: ActionCreatorWithPayload<{ cacheKey: string; data: unknown }>,
) {
  return function* watchWorkflowTriggers(): SagaGen<void> {
    const watchers = Object.values(workflowInstances).map((instance) =>
      call(watchInstance, {
        reducerPath,
        instance,
        queryInstances,
        mutationInstances,
        patchCache,
      }),
    );

    yield* all(watchers);
  };
}

type WatchInstanceParams = {
  reducerPath: string;
  instance: WorkflowInstance;
  queryInstances: Record<string, QueryInstance>;
  mutationInstances: Record<string, MutationInstance>;
  patchCache: ActionCreatorWithPayload<{ cacheKey: string; data: unknown }>;
};

function* watchInstance({
  reducerPath,
  instance,
  queryInstances,
  mutationInstances,
  patchCache,
}: WatchInstanceParams): SagaGen<void> {
  const runWorkflow = createWorkflowSaga(
    reducerPath,
    instance,
    queryInstances,
    mutationInstances,
    patchCache,
  );

  const listenTypes = getActionTypes(toArray(instance._def.listen));
  const dismissTypes = [...getActionTypes(toArray(instance._def.dismiss)), instance.cancel.type];

  const triggerType = instance.trigger.type;

  while (true) {
    const action = yield* take(
      (candidate: Action) => candidate.type === triggerType || listenTypes.includes(candidate.type),
    );

    const args = (action as PayloadAction<unknown>).payload;

    yield* fork(runWithDismiss, {
      runWorkflow,
      args,
      dismissTypes,
    });
  }
}

type RunWithDismissParams = {
  runWorkflow: (args: unknown) => SagaGen<void>;
  args: unknown;
  dismissTypes: string[];
};

function* runWithDismiss({ runWorkflow, args, dismissTypes }: RunWithDismissParams): SagaGen<void> {
  if (dismissTypes.length === 0) {
    yield* call(runWorkflow, args);
    return;
  }

  const workflowTask = yield* fork(runWorkflow, args);

  const { dismissed } = yield* race({
    completed: call(function* () {
      yield* join(workflowTask);
    }),
    dismissed: take((action: Action) => dismissTypes.includes(action.type)),
  });

  if (dismissed) {
    yield* cancel(workflowTask);
  }
}

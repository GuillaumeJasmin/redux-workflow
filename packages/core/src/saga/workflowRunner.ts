/* eslint-disable @typescript-eslint/no-explicit-any */

import { call, put, take, fork, join, cancel, cancelled, race, all } from 'typed-redux-saga';
import type { Action, ActionCreatorWithPayload, PayloadAction } from '@reduxjs/toolkit';
import { createSagaContext } from './sagaContext';
import { toArray, toErrorMessage } from './actionHelpers';
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
    yield* put(instance._pendingAction({ args, workflowKey } as any));

    try {
      const data: unknown = yield* call(def.execute as any, args as any, ctx);

      yield* put(instance._fulfilledAction({ args, workflowKey, data } as any));
    } catch (error) {
      yield* put(
        instance._rejectedAction({ args, workflowKey, error: toErrorMessage(error) } as any),
      );
    } finally {
      if (yield* cancelled()) {
        const message = 'cancelled';
        yield* put(instance._rejectedAction({ args, workflowKey, error: message } as any));
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

  const listenPredicates = toArray(instance._def.listen);
  const dismissPredicates = [
    ...toArray(instance._def.dismiss),
    (action: Action) => instance.cancel.match(action),
  ];

  const triggerType = instance.trigger.type;

  while (true) {
    const action = yield* take(
      (candidate: Action) =>
        candidate.type === triggerType || listenPredicates.some((p) => p(candidate)),
    );

    const args = (action as PayloadAction<unknown>).payload;

    yield* fork(runWithDismiss, {
      runWorkflow,
      args,
      dismissPredicates,
    });
  }
}

type RunWithDismissParams = {
  runWorkflow: (args: unknown) => SagaGen<void>;
  args: unknown;
  dismissPredicates: ((action: Action) => boolean)[];
};

function* runWithDismiss({
  runWorkflow,
  args,
  dismissPredicates,
}: RunWithDismissParams): SagaGen<void> {
  if (dismissPredicates.length === 0) {
    yield* call(runWorkflow, args);
    return;
  }

  const workflowTask = yield* fork(runWorkflow, args);

  const { dismissed } = yield* race({
    completed: call(function* () {
      yield* join(workflowTask);
    }),
    dismissed: take((action: Action) => dismissPredicates.some((p) => p(action))),
  });

  if (dismissed) {
    yield* cancel(workflowTask);
  }
}

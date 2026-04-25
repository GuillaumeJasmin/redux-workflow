/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAction, combineReducers } from '@reduxjs/toolkit';
import { all, call } from 'typed-redux-saga';
import { createInstanceAction } from './instanceActions';
import type {
  ApiInstance,
  CreateApiOptions,
  MutationBuilder,
  MutationDefinition,
  MutationInstance,
  MutationsFromDefs,
  QueriesFromDefs,
  QueryBuilder,
  QueryDefinition,
  QueryInstance,
  QueryLifecyclePayload,
  SagaGen,
  WorkflowBuilder,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowsFromDefs,
} from './types';
import { createCacheSlice, createMutationSlice, createWorkflowSlice } from '../store';
import { createWatchQueryTriggers } from '../saga/queryRunner';
import { createWatchMutationTriggers } from '../saga/mutationRunner';
import { createWatchWorkflowTriggers } from '../saga/workflowRunner';
import { createWatchGarbageCollector } from '../saga/garbageCollectorRunner';
import { createWatchRefetchEvents } from '../saga/refetchRunner';
import { assertGetStateInContext } from '../saga/actionHelpers';

// Empty object type with no index signature — `keyof EmptyDefs` is `never`,
// so `Record<string, never>` (which has a string index signature) can't be
// used as a default here; it would propagate to `createReactHooks` and make
// every `use<Anything>Workflow` key accepted.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type EmptyDefs = {};

const identityQueryBuilder: QueryBuilder = (def) => def;

function makeMutationBuilder<QDefs>(): MutationBuilder<QDefs> {
  return (def) => def;
}

function makeWorkflowBuilder<QDefs, MDefs>(): WorkflowBuilder<QDefs, MDefs> {
  return (def) => def;
}

export function createApi<
  QDefs extends Record<string, QueryDefinition<any, any>> = EmptyDefs,
  MDefs extends Record<string, MutationDefinition<any, any, QDefs>> = EmptyDefs,
  WDefs extends Record<string, WorkflowDefinition<any, any, QDefs, MDefs>> = EmptyDefs,
>(
  options: CreateApiOptions<QDefs, MDefs, WDefs>,
): ApiInstance<QueriesFromDefs<QDefs>, MutationsFromDefs<MDefs>, WorkflowsFromDefs<WDefs>> {
  const { name } = options;
  const reducerPath = name;

  const invalidateCache = createAction<{ cacheKey: string }>(`${reducerPath}/invalidateCache`);
  const resetCache = createAction(`${reducerPath}/resetCache`);
  const removeFromCache = createAction<{ cacheKey: string }>(`${reducerPath}/removeFromCache`);
  const patchCache = createAction<{ cacheKey: string; data: unknown }>(`${reducerPath}/patchCache`);
  const subscribe = createAction<{
    args: unknown;
    cacheKey: string;
    refetchOnFocus?: boolean;
    refetchOnReconnect?: boolean;
  }>(`${reducerPath}/subscribe`);
  const unsubscribe = createAction<{
    args: unknown;
    cacheKey: string;
    refetchOnFocus?: boolean;
    refetchOnReconnect?: boolean;
  }>(`${reducerPath}/unsubscribe`);
  const resetMutation = createAction<{ mutationKey: string }>(`${reducerPath}/resetMutation`);
  const resetWorkflow = createAction<{ workflowKey: string }>(`${reducerPath}/resetWorkflow`);

  // Phase 1: queries — defs → instances
  const queryDefs = options.queries ? options.queries(identityQueryBuilder) : ({} as QDefs);

  const queryInstances = buildQueryInstances(
    name,
    reducerPath,
    queryDefs,
    invalidateCache,
    subscribe,
    unsubscribe,
  );

  // Phase 2: mutations — defs → instances, with queryInstances available
  const mutationDefs = options.mutations
    ? options.mutations(makeMutationBuilder<QDefs>(), {
        queries: queryInstances as QueriesFromDefs<QDefs>,
      })
    : ({} as MDefs);

  const mutationInstances = buildMutationInstances(name, reducerPath, mutationDefs, resetMutation);

  // Phase 3: workflows — both earlier phases available
  const workflowDefs = options.workflows
    ? options.workflows(makeWorkflowBuilder<QDefs, MDefs>(), {
        queries: queryInstances as QueriesFromDefs<QDefs>,
        mutations: mutationInstances as MutationsFromDefs<MDefs>,
      })
    : ({} as WDefs);

  const workflowInstances = buildWorkflowInstances(name, reducerPath, workflowDefs, resetWorkflow);

  const cacheSlice = createCacheSlice(
    name,
    queryInstances,
    invalidateCache,
    resetCache,
    removeFromCache,
    patchCache,
    subscribe,
    unsubscribe,
  );
  const mutationSlice = createMutationSlice(name, mutationInstances, resetMutation);
  const workflowSlice = createWorkflowSlice(name, workflowInstances, resetWorkflow);

  const reducer = combineReducers({
    queries: cacheSlice.reducer,
    mutations: mutationSlice.reducer,
    workflows: workflowSlice.reducer,
  });

  const watchQueries = createWatchQueryTriggers(reducerPath, queryInstances, invalidateCache);
  const watchMutations = createWatchMutationTriggers(
    reducerPath,
    mutationInstances,
    queryInstances,
    invalidateCache,
    patchCache,
  );
  const watchWorkflows = createWatchWorkflowTriggers(
    reducerPath,
    workflowInstances,
    queryInstances,
    mutationInstances,
    patchCache,
  );
  const watchGarbageCollector = createWatchGarbageCollector(
    reducerPath,
    queryInstances,
    subscribe,
    unsubscribe,
    removeFromCache,
  );
  const watchRefetchEvents = createWatchRefetchEvents(reducerPath, queryInstances);

  function* rootSaga(): SagaGen<void> {
    yield* call(assertGetStateInContext);
    yield* all([
      call(watchQueries),
      call(watchMutations),
      call(watchWorkflows),
      call(watchGarbageCollector),
      call(watchRefetchEvents),
    ]);
  }

  return {
    name,
    reducerPath,
    reducer,
    rootSaga,
    queries: queryInstances as QueriesFromDefs<QDefs>,
    mutations: mutationInstances as MutationsFromDefs<MDefs>,
    workflows: workflowInstances as WorkflowsFromDefs<WDefs>,
    invalidateCache,
    resetCache: () => resetCache(),
  };
}

function buildQueryInstances(
  apiName: string,
  reducerPath: string,
  defs: Record<string, QueryDefinition<any, any>>,
  invalidate: QueryInstance['_invalidate'],
  subscribe: QueryInstance['_subscribe'],
  unsubscribe: QueryInstance['_unsubscribe'],
): Record<string, QueryInstance> {
  const result: Record<string, QueryInstance> = {};

  for (const [queryName, def] of Object.entries(defs)) {
    const key = `${apiName}/queries/${queryName}`;

    result[queryName] = {
      _key: key,
      _name: queryName,
      _type: 'query',
      _def: def,
      _reducerPath: reducerPath,
      _invalidate: invalidate,
      _subscribe: subscribe,
      _unsubscribe: unsubscribe,
      trigger: createAction<any>(`${key}/trigger`),
      firstSubscribe: createAction<QueryLifecyclePayload<any>>(`${key}/firstSubscribe`),
      lastUnsubscribe: createAction<QueryLifecyclePayload<any>>(`${key}/lastUnsubscribe`),
      on: {
        pending: createInstanceAction(`${key}/pending`, 'query', 'pending'),
        succeeded: createInstanceAction(`${key}/succeeded`, 'query', 'succeeded'),
        failed: createInstanceAction(`${key}/failed`, 'query', 'failed'),
      },
    };
  }

  return result;
}

function buildMutationInstances(
  apiName: string,
  reducerPath: string,
  defs: Record<string, MutationDefinition<any, any>>,
  reset: MutationInstance['_reset'],
): Record<string, MutationInstance> {
  const result: Record<string, MutationInstance> = {};

  for (const [mutationName, def] of Object.entries(defs)) {
    const key = `${apiName}/mutations/${mutationName}`;

    result[mutationName] = {
      _key: key,
      _name: mutationName,
      _type: 'mutation',
      _def: def,
      _reducerPath: reducerPath,
      _reset: reset,
      trigger: createAction<any>(`${key}/trigger`),
      on: {
        pending: createInstanceAction(`${key}/pending`, 'mutation', 'pending'),
        succeeded: createInstanceAction(`${key}/succeeded`, 'mutation', 'succeeded'),
        failed: createInstanceAction(`${key}/failed`, 'mutation', 'failed'),
      },
    };
  }

  return result;
}

function buildWorkflowInstances(
  apiName: string,
  reducerPath: string,
  defs: Record<string, WorkflowDefinition<any, any>>,
  reset: WorkflowInstance['_reset'],
): Record<string, WorkflowInstance> {
  const result: Record<string, WorkflowInstance> = {};

  for (const [workflowName, def] of Object.entries(defs)) {
    const key = `${apiName}/workflows/${workflowName}`;

    result[workflowName] = {
      _key: key,
      _name: workflowName,
      _type: 'workflow',
      _def: def,
      _reducerPath: reducerPath,
      _reset: reset,
      trigger: createAction<any>(`${key}/trigger`),
      cancel: createAction(`${key}/cancel`),
      on: {
        pending: createInstanceAction(`${key}/pending`, 'workflow', 'pending'),
        succeeded: createInstanceAction(`${key}/succeeded`, 'workflow', 'succeeded'),
        failed: createInstanceAction(`${key}/failed`, 'workflow', 'failed'),
      },
    };
  }

  return result;
}

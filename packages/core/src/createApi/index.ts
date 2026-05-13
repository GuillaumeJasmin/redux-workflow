/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */

import { createAction, combineReducers, createSlice, type Reducer } from '@reduxjs/toolkit';
import { call } from 'typed-redux-saga';
import { createInstanceAction } from './instanceActions';
import type {
  ActionsFromSliceReturn,
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
  SelectorsFromSliceReturn,
  SliceBuilder,
  SliceConfig,
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
import { createRootSaga } from '../saga/createRootSaga';

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
  TSliceReturn = SliceConfig<EmptyDefs, EmptyDefs, EmptyDefs>,
  WDefs extends Record<string, WorkflowDefinition<any, any, QDefs, MDefs>> = EmptyDefs,
>(
  options: CreateApiOptions<QDefs, MDefs, TSliceReturn, WDefs>,
): ApiInstance<
  QueriesFromDefs<QDefs>,
  MutationsFromDefs<MDefs>,
  WorkflowsFromDefs<WDefs>,
  SelectorsFromSliceReturn<TSliceReturn>
> {
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

  // Phase 3: slice — queries + mutations available. Identity at runtime;
  // the `slice` builder unlocks per-call TS inference of TInitial /
  // TReducers / TSelectors.
  const identitySliceBuilder: SliceBuilder = (config) => config;
  const sliceConfig = options.slice
    ? (options.slice as (s: SliceBuilder, ctx: unknown) => InternalSliceConfig)(
        identitySliceBuilder,
        {
          queries: queryInstances,
          mutations: mutationInstances,
        },
      )
    : null;
  const domainSlice = sliceConfig ? buildDomainSlice(name, sliceConfig) : null;
  const apiSelectors: Record<string, (rootState: any) => unknown> = sliceConfig
    ? bindSelectors(reducerPath, sliceConfig.selectors ?? {})
    : {};
  // The slice's action creators — exposed only on the workflow ctx,
  // never on `api.actions`.
  const sliceActions: Record<string, (...args: unknown[]) => unknown> = domainSlice?.actions ?? {};

  // Phase 4: workflows — queries + mutations + slice selectors + slice actions.
  const workflowDefs = options.workflows
    ? options.workflows(makeWorkflowBuilder<QDefs, MDefs>(), {
        queries: queryInstances as QueriesFromDefs<QDefs>,
        mutations: mutationInstances as MutationsFromDefs<MDefs>,
        selectors: apiSelectors as SelectorsFromSliceReturn<TSliceReturn>,
        actions: sliceActions as ActionsFromSliceReturn<TSliceReturn>,
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
    ...(domainSlice ? { slice: domainSlice.reducer } : {}),
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

  function* rootSaga(onError?: (error: Error) => void): SagaGen<void> {
    yield* call(assertGetStateInContext);
    yield* call(
      createRootSaga(
        [watchQueries, watchMutations, watchWorkflows, watchGarbageCollector, watchRefetchEvents],
        onError,
      ),
    );
  }

  return {
    name,
    reducerPath,
    reducer,
    rootSaga,
    queries: queryInstances as QueriesFromDefs<QDefs>,
    mutations: mutationInstances as MutationsFromDefs<MDefs>,
    workflows: workflowInstances as WorkflowsFromDefs<WDefs>,
    selectors: apiSelectors as SelectorsFromSliceReturn<TSliceReturn>,
    invalidateCache,
    resetCache: () => resetCache(),
  };
}

// Internal-only erased shapes. Public types carry the real inference;
// these are just runtime-friendly erasures so we can build the slice
// without fighting generic constraints.
type InternalSliceConfig = SliceConfig<unknown, Record<string, never>, Record<string, never>>;
type InternalSelectorRecord = Record<string, (local: unknown, root: unknown) => unknown>;

function buildDomainSlice(
  apiName: string,
  config: InternalSliceConfig,
): {
  reducer: Reducer;
  actions: Record<string, (...args: unknown[]) => unknown>;
} {
  const slice = createSlice({
    name: `${apiName}/slice`,
    initialState: config.initialState,
    reducers: config.reducers ?? {},
    extraReducers: config.extraReducers,
  });
  return {
    reducer: slice.reducer,
    actions: slice.actions,
  };
}

function bindSelectors(
  reducerPath: string,
  selectors: InternalSelectorRecord,
): Record<string, (rootState: any) => unknown> {
  const bound: Record<string, (rootState: any) => unknown> = {};
  for (const [key, fn] of Object.entries(selectors)) {
    bound[key] = (rootState: any) => {
      const sub = (rootState as Record<string, unknown> | undefined)?.[reducerPath] as
        | { slice?: unknown }
        | undefined;
      return fn(sub?.slice, rootState);
    };
  }
  return bound;
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

    const pendingAction = createInstanceAction<any>(`${key}/pending`, 'query', 'pending');
    const fulfilledAction = createInstanceAction<any>(`${key}/fulfilled`, 'query', 'fulfilled');
    const rejectedAction = createInstanceAction<any>(`${key}/rejected`, 'query', 'rejected');
    const firstSubscribeAction = createAction<QueryLifecyclePayload<any>>(`${key}/firstSubscribe`);
    const lastUnsubscribeAction = createAction<QueryLifecyclePayload<any>>(
      `${key}/lastUnsubscribe`,
    );

    result[queryName] = {
      _key: key,
      _name: queryName,
      _type: 'query',
      _def: def,
      _reducerPath: reducerPath,
      _invalidate: invalidate,
      _subscribe: subscribe,
      _unsubscribe: unsubscribe,
      _pendingAction: pendingAction,
      _fulfilledAction: fulfilledAction,
      _rejectedAction: rejectedAction,
      _firstSubscribe: firstSubscribeAction,
      _lastUnsubscribe: lastUnsubscribeAction,
      trigger: createAction<any>(`${key}/trigger`),
      matchPending: pendingAction.match,
      matchFulfilled: fulfilledAction.match,
      matchRejected: rejectedAction.match,
      matchFirstSubscribe: firstSubscribeAction.match,
      matchLastUnsubscribe: lastUnsubscribeAction.match,
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

    const pendingAction = createInstanceAction<any>(`${key}/pending`, 'mutation', 'pending');
    const fulfilledAction = createInstanceAction<any>(`${key}/fulfilled`, 'mutation', 'fulfilled');
    const rejectedAction = createInstanceAction<any>(`${key}/rejected`, 'mutation', 'rejected');

    result[mutationName] = {
      _key: key,
      _name: mutationName,
      _type: 'mutation',
      _def: def,
      _reducerPath: reducerPath,
      _reset: reset,
      _pendingAction: pendingAction,
      _fulfilledAction: fulfilledAction,
      _rejectedAction: rejectedAction,
      trigger: createAction<any>(`${key}/trigger`),
      matchPending: pendingAction.match,
      matchFulfilled: fulfilledAction.match,
      matchRejected: rejectedAction.match,
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

    const pendingAction = createInstanceAction<any>(`${key}/pending`, 'workflow', 'pending');
    const fulfilledAction = createInstanceAction<any>(`${key}/fulfilled`, 'workflow', 'fulfilled');
    const rejectedAction = createInstanceAction<any>(`${key}/rejected`, 'workflow', 'rejected');

    result[workflowName] = {
      _key: key,
      _name: workflowName,
      _type: 'workflow',
      _def: def,
      _reducerPath: reducerPath,
      _reset: reset,
      _pendingAction: pendingAction,
      _fulfilledAction: fulfilledAction,
      _rejectedAction: rejectedAction,
      trigger: createAction<any>(`${key}/trigger`),
      cancel: createAction(`${key}/cancel`),
      matchPending: pendingAction.match,
      matchFulfilled: fulfilledAction.match,
      matchRejected: rejectedAction.match,
    };
  }

  return result;
}

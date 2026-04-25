/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Action, ActionCreatorWithPayload, Reducer } from '@reduxjs/toolkit';

export type QueryStatus = 'uninitialized' | 'pending' | 'fulfilled' | 'rejected';

export type WorkflowStatus = 'idle' | 'pending' | 'fulfilled' | 'rejected';

export type SagaGen<TResult = unknown> = Generator<any, TResult>;

/**
 * Return shape for `execute` bodies (queries, mutations, workflows).
 * Authors can write either:
 *   - a generator (`function*`) — full saga power (`yield* select`, `call`, …)
 *   - an async function — simpler bodies that just await gateway calls.
 * At runtime both are handled transparently by redux-saga's `call` effect.
 */
type SagaOrPromise<TResult> = SagaGen<TResult> | Promise<TResult>;

export type AnyActionCreator =
  | ActionCreatorWithPayload<any>
  | { type: string; match: (action: any) => boolean };

/**
 * Return shape for queries and mutations, following RTK Query's pattern.
 * Use `{ data }` on success and `{ error }` on failure. Throwing from an
 * `execute` generator is also supported and treated as `{ error }`, but
 * explicit returns are preferred.
 */
export type QueryResultShape<TResult> =
  | { data: TResult; error?: undefined }
  | { data?: undefined; error: unknown };

// ---------------- Type helpers to extract args/result from def records ------

type QueryArgs<QDefs, K extends keyof QDefs> =
  QDefs[K] extends QueryDefinition<any, infer A> ? A : never;

type QueryResult<QDefs, K extends keyof QDefs> =
  QDefs[K] extends QueryDefinition<infer R, any> ? R : never;

type MutationArgs<MDefs, K extends keyof MDefs> =
  MDefs[K] extends MutationDefinition<any, infer A> ? A : never;

type MutationResult<MDefs, K extends keyof MDefs> =
  MDefs[K] extends MutationDefinition<infer R, any> ? R : never;

// ---------------- Execute context (passed to mutations + workflows) --------

type CacheUpdater<TResult> = TResult | ((previous: TResult | null) => TResult);

export type ExecuteContext<QDefs = any, MDefs = any> = {
  query: <K extends keyof QDefs>(
    name: K,
    args: QueryArgs<QDefs, K>,
  ) => SagaGen<QueryResultShape<QueryResult<QDefs, K>>>;
  mutate: <K extends keyof MDefs>(
    name: K,
    args: MutationArgs<MDefs, K>,
  ) => SagaGen<QueryResultShape<MutationResult<MDefs, K>>>;
  getCache: <K extends keyof QDefs>(
    name: K,
    args: QueryArgs<QDefs, K>,
  ) => SagaGen<QueryResult<QDefs, K> | null>;
  patchCache: <K extends keyof QDefs>(
    name: K,
    args: QueryArgs<QDefs, K>,
    data: CacheUpdater<QueryResult<QDefs, K>>,
  ) => SagaGen<void>;
  select: <TResult>(selector: (state: any) => TResult) => SagaGen<TResult>;
  put: (action: Action) => SagaGen<void>;
};

// ---------------- Definitions (what the user writes) ----------------

/**
 * Minimal context handed to query.execute / mutation.execute. Useful when
 * the body is an `async` function and can't yield `select` effects.
 *
 * `getState` is a live reference to the store's `getState`. The host saga
 * middleware must be configured with
 * `sagaMiddleware.setContext({ getState: store.getState })` before the
 * root saga runs — the root saga asserts this at startup.
 */
export type ExecuteCallContext = {
  getState: () => any;
};

export type QueryDefinition<TResult = unknown, TArgs = void> = {
  execute: (args: TArgs, ctx: ExecuteCallContext) => SagaOrPromise<QueryResultShape<TResult>>;
  cache?: number;
  poll?: number;
  /**
   * Seconds to keep a cache entry after the last subscriber unmounts.
   * Defaults to 60s. Use `Infinity` to disable garbage collection.
   *
   * Matches RTK Query's `keepUnusedDataFor` option name and semantics.
   */
  keepUnusedDataFor?: number;
  listen?: AnyActionCreator | AnyActionCreator[];
  /**
   * Refetch every currently-subscribed cache entry of this query when the
   * app regains focus. Wire the platform focus signal with `setupListeners`.
   */
  refetchOnFocus?: boolean;
  /**
   * Refetch every currently-subscribed cache entry of this query when the
   * network transitions from offline to online. Wire the platform online
   * signal with `setupListeners`.
   */
  refetchOnReconnect?: boolean;
};

export type MutationDefinition<TResult = unknown, TArgs = void, QDefs = any> = {
  execute: (args: TArgs, ctx: ExecuteCallContext) => SagaOrPromise<QueryResultShape<TResult>>;
  invalidates?: Extract<keyof QDefs, string>[];
  listen?: AnyActionCreator | AnyActionCreator[];
  /**
   * Runs before `execute`. Its return value is handed to `onError` for rollback.
   * Typical use: optimistic update via `ctx.patchCache(...)`.
   *
   * Rollback typing between onStart/onError is intentionally loose (`any`) to
   * keep TS inference of TArgs/TResult working across the whole def. If you
   * need a typed rollback value, annotate it explicitly in onError.
   */
  onStart?: (args: TArgs, ctx: ExecuteContext<QDefs>) => SagaGen<any>;
  onError?: (rollback: any, args: TArgs, ctx: ExecuteContext<QDefs>) => SagaGen<void>;
};

export type WorkflowDefinition<TResult = unknown, TArgs = void, QDefs = any, MDefs = any> = {
  execute: (args: TArgs, ctx: ExecuteContext<QDefs, MDefs>) => SagaGen<TResult>;
  listen?: AnyActionCreator | AnyActionCreator[];
  dismiss?: AnyActionCreator | AnyActionCreator[];
};

// ---------------- Builder function types (callback params) ------------------

export type QueryBuilder = <TResult, TArgs>(
  def: QueryDefinition<TResult, TArgs>,
) => QueryDefinition<TResult, TArgs>;

export type MutationBuilder<QDefs> = <TResult, TArgs>(
  def: MutationDefinition<TResult, TArgs, QDefs>,
) => MutationDefinition<TResult, TArgs, QDefs>;

export type WorkflowBuilder<QDefs, MDefs> = <TResult, TArgs>(
  def: WorkflowDefinition<TResult, TArgs, QDefs, MDefs>,
) => WorkflowDefinition<TResult, TArgs, QDefs, MDefs>;

// ---------------- Instances (what createApi returns) ----------------

type QueryPendingPayload<TArgs> = { args: TArgs; cacheKey: string };
type QuerySucceededPayload<TResult, TArgs> = {
  args: TArgs;
  cacheKey: string;
  data: TResult;
};
type QueryFailedPayload<TArgs> = {
  args: TArgs;
  cacheKey: string;
  error: string;
};

export type QueryLifecyclePayload<TArgs> = {
  args: TArgs;
  cacheKey: string;
};

export type QueryInstance<TResult = any, TArgs = any> = {
  _key: string;
  _name: string;
  _type: 'query';
  _def: QueryDefinition<TResult, TArgs>;
  _reducerPath: string;
  _invalidate: ActionCreatorWithPayload<{ cacheKey: string }>;
  _subscribe: ActionCreatorWithPayload<{
    args: TArgs;
    cacheKey: string;
    refetchOnFocus?: boolean;
    refetchOnReconnect?: boolean;
  }>;
  _unsubscribe: ActionCreatorWithPayload<{
    args: TArgs;
    cacheKey: string;
    refetchOnFocus?: boolean;
    refetchOnReconnect?: boolean;
  }>;
  trigger: ActionCreatorWithPayload<TArgs>;
  /**
   * Dispatched when the subscriber count transitions from 0 to 1 for a given
   * cacheKey — i.e. the first mount subscribes. Useful as a workflow trigger
   * for things like opening a websocket tied to this query entry.
   */
  firstSubscribe: ActionCreatorWithPayload<QueryLifecyclePayload<TArgs>>;
  /**
   * Dispatched when the subscriber count transitions from 1 to 0 — i.e. the
   * last mount unsubscribes. Fires before the gc timer starts.
   */
  lastUnsubscribe: ActionCreatorWithPayload<QueryLifecyclePayload<TArgs>>;
  on: {
    pending: ActionCreatorWithPayload<QueryPendingPayload<TArgs>>;
    succeeded: ActionCreatorWithPayload<QuerySucceededPayload<TResult, TArgs>>;
    failed: ActionCreatorWithPayload<QueryFailedPayload<TArgs>>;
  };
};

type MutationPendingPayload<TArgs> = {
  args: TArgs;
  mutationKey: string;
};
type MutationSucceededPayload<TResult, TArgs> = {
  args: TArgs;
  mutationKey: string;
  data: TResult;
};
type MutationFailedPayload<TArgs> = {
  args: TArgs;
  mutationKey: string;
  error: string;
};

type WorkflowPendingPayload<TArgs> = {
  args: TArgs;
  workflowKey: string;
};
type WorkflowSucceededPayload<TResult, TArgs> = {
  args: TArgs;
  workflowKey: string;
  data: TResult;
};
type WorkflowFailedPayload<TArgs> = {
  args: TArgs;
  workflowKey: string;
  error: string;
};

export type MutationInstance<TResult = any, TArgs = any> = {
  _key: string;
  _name: string;
  _type: 'mutation';
  _def: MutationDefinition<TResult, TArgs>;
  _reducerPath: string;
  _reset: ActionCreatorWithPayload<{ mutationKey: string }>;
  trigger: ActionCreatorWithPayload<TArgs>;
  on: {
    pending: ActionCreatorWithPayload<MutationPendingPayload<TArgs>>;
    succeeded: ActionCreatorWithPayload<MutationSucceededPayload<TResult, TArgs>>;
    failed: ActionCreatorWithPayload<MutationFailedPayload<TArgs>>;
  };
};

export type WorkflowInstance<TResult = any, TArgs = any> = {
  _key: string;
  _name: string;
  _type: 'workflow';
  _def: WorkflowDefinition<TResult, TArgs>;
  _reducerPath: string;
  _reset: ActionCreatorWithPayload<{ workflowKey: string }>;
  trigger: ActionCreatorWithPayload<TArgs>;
  cancel: ActionCreatorWithPayload<void>;
  on: {
    pending: ActionCreatorWithPayload<WorkflowPendingPayload<TArgs>>;
    succeeded: ActionCreatorWithPayload<WorkflowSucceededPayload<TResult, TArgs>>;
    failed: ActionCreatorWithPayload<WorkflowFailedPayload<TArgs>>;
  };
};

// ---------------- Mapping Defs -> Instances ----------------

export type QueriesFromDefs<QDefs extends Record<string, QueryDefinition<any, any>>> = {
  [K in keyof QDefs]: QDefs[K] extends QueryDefinition<infer R, infer A>
    ? QueryInstance<R, A>
    : never;
};

export type MutationsFromDefs<MDefs extends Record<string, MutationDefinition<any, any>>> = {
  [K in keyof MDefs]: MDefs[K] extends MutationDefinition<infer R, infer A>
    ? MutationInstance<R, A>
    : never;
};

export type WorkflowsFromDefs<WDefs extends Record<string, WorkflowDefinition<any, any>>> = {
  [K in keyof WDefs]: WDefs[K] extends WorkflowDefinition<infer R, infer A>
    ? WorkflowInstance<R, A>
    : never;
};

// ---------------- API ----------------

export type ApiInstance<
  Q extends Record<string, QueryInstance> = Record<string, QueryInstance>,
  M extends Record<string, MutationInstance> = Record<string, MutationInstance>,
  W extends Record<string, WorkflowInstance> = Record<string, WorkflowInstance>,
> = {
  name: string;
  reducerPath: string;
  reducer: Reducer;
  rootSaga: () => SagaGen<void>;
  queries: Q;
  mutations: M;
  workflows: W;
  invalidateCache: ActionCreatorWithPayload<{ cacheKey: string }>;
  resetCache: () => Action;
};

export type CreateApiOptions<
  QDefs extends Record<string, QueryDefinition<any, any>>,
  MDefs extends Record<string, MutationDefinition<any, any, QDefs>>,
  WDefs extends Record<string, WorkflowDefinition<any, any, QDefs, MDefs>>,
> = {
  name: string;
  queries?: (query: QueryBuilder) => QDefs;
  mutations?: (mutation: MutationBuilder<QDefs>, ctx: { queries: QueriesFromDefs<QDefs> }) => MDefs;
  workflows?: (
    workflow: WorkflowBuilder<QDefs, MDefs>,
    ctx: {
      queries: QueriesFromDefs<QDefs>;
      mutations: MutationsFromDefs<MDefs>;
    },
  ) => WDefs;
};

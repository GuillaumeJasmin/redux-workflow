/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  Action,
  ActionCreatorWithPayload,
  ActionReducerMapBuilder,
  PayloadAction,
  Reducer,
} from '@reduxjs/toolkit';

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

export type Predicate<T> = (arg: T) => boolean;

export type ActionPredicate = Predicate<Action>;

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

// ---------------- API-level slice ----------------------------------------

/**
 * Reducer signature for the api's `slice.reducers`. Single canonical
 * shape — `(state, action: PayloadAction<P>) => void` — keeps TInitial
 * contextually typed on `state`. For no-payload reducers, declare
 * `_action: PayloadAction<void>` explicitly:
 *
 * ```ts
 * reducers: {
 *   reset: (state, _action: PayloadAction<void>) => { state.x = 0; }
 * }
 * ```
 *
 * Same convention as RTK's `createSlice`. The action creator for
 * void-payload reducers is callable with no args: `actions.reset()`.
 */
export type SliceReducerOf<TInitial> = (state: TInitial, action: PayloadAction<any>) => void;
export type SliceReducerRecord<TInitial> = Record<string, SliceReducerOf<TInitial>>;

/**
 * Selector signature for the api's `slice.selectors`. Receives both the
 * slice's local state and the root state — composes with selectors from
 * other slices.
 */
export type SliceSelectorOf<TInitial> = (local: TInitial, root: any) => unknown;
export type SliceSelectorRecord<TInitial> = Record<string, SliceSelectorOf<TInitial>>;

/**
 * Slice configuration. State changes happen two ways:
 *
 * - `reducers`: private writers, dispatchable only from this api's
 *   workflows via `actions.x()` on the workflow ctx. Use for state
 *   mutations the workflow alone authors.
 * - `extraReducers`: react to actions defined elsewhere (this api's
 *   mutation/query lifecycle, internal `createAction` events, external
 *   domain actions). Use when something *outside* this slice causes the
 *   state change.
 */
export type SliceConfig<TInitial, TReducers, TSelectors> = {
  initialState: TInitial;
  reducers?: TReducers & SliceReducerRecord<TInitial>;
  extraReducers?: (builder: ActionReducerMapBuilder<TInitial>) => void;
  selectors?: TSelectors & SliceSelectorRecord<TInitial>;
};

type SlicePayloadOf<R> = R extends (state: any, action: PayloadAction<infer P>) => void ? P : never;

type RTKActionMethod<R> = [SlicePayloadOf<R>] extends [void]
  ? () => PayloadAction<undefined>
  : (payload: SlicePayloadOf<R>) => PayloadAction<SlicePayloadOf<R>>;

/**
 * Map a reducer record to typed action creators. Exposed on the workflow
 * ctx as `actions` — never on the public api.
 */
export type RTKActionsFromReducers<TReducers> = {
  [K in keyof TReducers]: RTKActionMethod<TReducers[K]>;
};

/**
 * Map a selector record to bound `(rootState) => R` selectors. Exposed on
 * `api.selectors`.
 */
export type BoundSelectors<TSelectors> = {
  [K in keyof TSelectors]: TSelectors[K] extends (local: any, root: any) => infer R
    ? (rootState: any) => R
    : never;
};

// ---------------- Execute context (passed to mutations + workflows) --------

type CacheUpdater<TResult> = TResult | ((previous: TResult | null) => TResult);

export type ExecuteContext<QDefs = any, MDefs = any> = {
  /**
   * Run a query and wait for its result. Two forms:
   *  - `query('name', args)` — own api's queries by name (typed via QDefs).
   *  - `query(instance, args)` — any api's query by instance reference
   *    (typed via the instance's own generics). Use this for queries
   *    that live on an external api you imported.
   */
  query: {
    <K extends keyof QDefs>(
      name: K,
      args: QueryArgs<QDefs, K>,
    ): SagaGen<QueryResultShape<QueryResult<QDefs, K>>>;
    <TResult, TArgs>(
      instance: QueryInstance<TResult, TArgs>,
      args: TArgs,
    ): SagaGen<QueryResultShape<TResult>>;
  };
  /**
   * Run a mutation and wait for its result. Same overload pattern as
   * `query`: pass a name (own api) or an instance (any api).
   */
  mutate: {
    <K extends keyof MDefs>(
      name: K,
      args: MutationArgs<MDefs, K>,
    ): SagaGen<QueryResultShape<MutationResult<MDefs, K>>>;
    <TResult, TArgs>(
      instance: MutationInstance<TResult, TArgs>,
      args: TArgs,
    ): SagaGen<QueryResultShape<TResult>>;
  };
  /** Read a cache entry. Accepts a name (own api) or a query instance (any api). */
  getCache: {
    <K extends keyof QDefs>(
      name: K,
      args: QueryArgs<QDefs, K>,
    ): SagaGen<QueryResult<QDefs, K> | null>;
    <TResult, TArgs>(instance: QueryInstance<TResult, TArgs>, args: TArgs): SagaGen<TResult | null>;
  };
  /** Patch a cache entry. Accepts a name (own api) or a query instance (any api). */
  patchCache: {
    <K extends keyof QDefs>(
      name: K,
      args: QueryArgs<QDefs, K>,
      data: CacheUpdater<QueryResult<QDefs, K>>,
    ): SagaGen<void>;
    <TResult, TArgs>(
      instance: QueryInstance<TResult, TArgs>,
      args: TArgs,
      data: CacheUpdater<TResult>,
    ): SagaGen<void>;
  };
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
  listen?: ActionPredicate | ActionPredicate[];
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
  listen?: ActionPredicate | ActionPredicate[];
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
  listen?: ActionPredicate | ActionPredicate[];
  dismiss?: ActionPredicate | ActionPredicate[];
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

/**
 * Typed predicate that narrows to a `PayloadAction<P>` — the same shape
 * RTK's `creator.match` produces. Used for `match*` lifecycle fields.
 */
type Matcher<P> = (action: Action) => action is PayloadAction<P>;

type QueryPendingPayload<TArgs> = { args: TArgs; cacheKey: string };
type QueryFulfilledPayload<TResult, TArgs> = {
  args: TArgs;
  cacheKey: string;
  data: TResult;
};
type QueryRejectedPayload<TArgs> = {
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
  /**
   * Internal — lifecycle action creators used by the saga runners to
   * dispatch `pending` / `fulfilled` / `rejected` transitions. Public
   * code should use the `match*` predicates instead.
   */
  _pendingAction: ActionCreatorWithPayload<QueryPendingPayload<TArgs>>;
  _fulfilledAction: ActionCreatorWithPayload<QueryFulfilledPayload<TResult, TArgs>>;
  _rejectedAction: ActionCreatorWithPayload<QueryRejectedPayload<TArgs>>;
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
  /**
   * RTK Query-style matcher predicates. Use directly with
   * `builder.addMatcher(...)` or as a `listen` target.
   */
  matchPending: Matcher<QueryPendingPayload<TArgs>>;
  matchFulfilled: Matcher<QueryFulfilledPayload<TResult, TArgs>>;
  matchRejected: Matcher<QueryRejectedPayload<TArgs>>;
};

type MutationPendingPayload<TArgs> = {
  args: TArgs;
  mutationKey: string;
};
type MutationFulfilledPayload<TResult, TArgs> = {
  args: TArgs;
  mutationKey: string;
  data: TResult;
};
type MutationRejectedPayload<TArgs> = {
  args: TArgs;
  mutationKey: string;
  error: string;
};

type WorkflowPendingPayload<TArgs> = {
  args: TArgs;
  workflowKey: string;
};
type WorkflowFulfilledPayload<TResult, TArgs> = {
  args: TArgs;
  workflowKey: string;
  data: TResult;
};
type WorkflowRejectedPayload<TArgs> = {
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
  _pendingAction: ActionCreatorWithPayload<MutationPendingPayload<TArgs>>;
  _fulfilledAction: ActionCreatorWithPayload<MutationFulfilledPayload<TResult, TArgs>>;
  _rejectedAction: ActionCreatorWithPayload<MutationRejectedPayload<TArgs>>;
  trigger: ActionCreatorWithPayload<TArgs>;
  matchPending: Matcher<MutationPendingPayload<TArgs>>;
  matchFulfilled: Matcher<MutationFulfilledPayload<TResult, TArgs>>;
  matchRejected: Matcher<MutationRejectedPayload<TArgs>>;
};

export type WorkflowInstance<TResult = any, TArgs = any> = {
  _key: string;
  _name: string;
  _type: 'workflow';
  _def: WorkflowDefinition<TResult, TArgs>;
  _reducerPath: string;
  _reset: ActionCreatorWithPayload<{ workflowKey: string }>;
  _pendingAction: ActionCreatorWithPayload<WorkflowPendingPayload<TArgs>>;
  _fulfilledAction: ActionCreatorWithPayload<WorkflowFulfilledPayload<TResult, TArgs>>;
  _rejectedAction: ActionCreatorWithPayload<WorkflowRejectedPayload<TArgs>>;
  trigger: ActionCreatorWithPayload<TArgs>;
  cancel: ActionCreatorWithPayload<void>;
  matchPending: Matcher<WorkflowPendingPayload<TArgs>>;
  matchFulfilled: Matcher<WorkflowFulfilledPayload<TResult, TArgs>>;
  matchRejected: Matcher<WorkflowRejectedPayload<TArgs>>;
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
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  S extends Record<string, (rootState: any) => any> = {},
> = {
  name: string;
  reducerPath: string;
  reducer: Reducer;
  rootSaga: () => SagaGen<void>;
  queries: Q;
  mutations: M;
  workflows: W;
  /**
   * Bound selectors from the api's `slice`. Each selector takes
   * `rootState` and returns its declared result. Empty object when no
   * slice is configured.
   */
  selectors: S;
  invalidateCache: ActionCreatorWithPayload<{ cacheKey: string }>;
  resetCache: () => Action;
};

/**
 * Builder passed to the slice callback. Identity at runtime; its job is
 * to capture the slice's TS generics at its own call site so they're
 * resolved independently of `createApi`'s outer inference.
 */
export type SliceBuilder = <
  TInitial,
  TReducers extends SliceReducerRecord<TInitial>,
  TSelectors extends SliceSelectorRecord<TInitial>,
>(
  config: SliceConfig<TInitial, TReducers, TSelectors>,
) => SliceConfig<TInitial, TReducers, TSelectors>;

/**
 * Ctx passed to the slice callback (second arg). Has typed access to the
 * api's queries and mutations — declared earlier in the options literal.
 *
 * Slice runs *before* workflows in the dependency chain so that workflows
 * can read slice state via their own ctx. To listen to a workflow's
 * lifecycle from a slice, reference `api.workflows.x.matchFulfilled`
 * via api self-reference, or use a domain-event bridge.
 */
export type SliceBuilderCtx<QDefs, MDefs> = {
  queries: QueriesFromDefs<
    QDefs extends Record<string, QueryDefinition<any, any>> ? QDefs : Record<string, never>
  >;
  mutations: MutationsFromDefs<
    MDefs extends Record<string, MutationDefinition<any, any>> ? MDefs : Record<string, never>
  >;
};

/** Extract the bound selectors shape from the slice callback's return. */
export type SelectorsFromSliceReturn<TSliceReturn> =
  TSliceReturn extends SliceConfig<any, any, infer TSelectors>
    ? BoundSelectors<TSelectors>
    : Record<string, never>;

/** Extract the typed action creators from the slice callback's return. */
export type ActionsFromSliceReturn<TSliceReturn> =
  TSliceReturn extends SliceConfig<any, infer TReducers, any>
    ? RTKActionsFromReducers<TReducers>
    : Record<string, never>;

export type CreateApiOptions<
  QDefs extends Record<string, QueryDefinition<any, any>>,
  MDefs extends Record<string, MutationDefinition<any, any, QDefs>>,
  TSliceReturn = SliceConfig<Record<string, never>, Record<string, never>, Record<string, never>>,
  WDefs extends Record<string, WorkflowDefinition<any, any, QDefs, MDefs>> = Record<
    string,
    WorkflowDefinition<any, any, QDefs, MDefs>
  >,
> = {
  name: string;
  queries?: (query: QueryBuilder) => QDefs;
  mutations?: (mutation: MutationBuilder<QDefs>, ctx: { queries: QueriesFromDefs<QDefs> }) => MDefs;
  /**
   * Slice builder callback. Receives a typed `slice` builder (call it
   * with the config to lock TInitial / TReducers / TSelectors locally)
   * and a ctx with typed `queries` / `mutations` for `extraReducers`
   * matchers.
   *
   * Runs *before* workflows in the dependency chain — workflows can
   * read slice state via their own ctx and dispatch the slice's private
   * actions.
   */
  slice?: (slice: SliceBuilder, ctx: SliceBuilderCtx<QDefs, MDefs>) => TSliceReturn;
  /**
   * Workflows builder callback. Receives the `workflow` builder and a
   * ctx with typed `queries`, `mutations`, `selectors` (bound slice
   * selectors), and `actions` (typed action creators from the slice's
   * `reducers` — private to this api's workflows).
   */
  workflows?: (
    workflow: WorkflowBuilder<QDefs, MDefs>,
    ctx: {
      queries: QueriesFromDefs<QDefs>;
      mutations: MutationsFromDefs<MDefs>;
      selectors: SelectorsFromSliceReturn<TSliceReturn>;
      actions: ActionsFromSliceReturn<TSliceReturn>;
    },
  ) => WDefs;
};

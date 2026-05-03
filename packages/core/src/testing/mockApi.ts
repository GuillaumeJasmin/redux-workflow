/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-type-arguments */

import { all, call, fork, put, take } from 'typed-redux-saga';
import type { ApiInstance, MutationInstance, QueryInstance, SagaGen } from '../createApi/types';
import { buildCacheKey } from '../utils/cacheKey';

// Result a mock function returns. Same shape as the real query/mutation
// `execute` contract — `{ data }` on success, `{ error }` on failure.
type MockResult<T> = { data: T } | { error: unknown };

type MockFn<TResult, TArgs> = (
  args: TArgs,
) => MockResult<TResult> | Promise<MockResult<TResult>> | SagaGen<MockResult<TResult>>;

export type Mocks = {
  queries?: Record<string, MockFn<any, any>>;
  mutations?: Record<string, MockFn<any, any>>;
};

export type MockSpec = {
  api: ApiInstance<any, any, any>;
  mocks: Mocks;
};

/**
 * Declare a fake runtime for an api in tests. The api's reducer and
 * action creators stay the real production ones — only the saga that
 * normally runs `execute` is replaced by an interceptor that returns
 * the supplied data instead.
 *
 * Pass an array of `mockApi(...)` results to `setupApiTest({ mocks })`.
 *
 * @example
 * import { authApi } from './auth-api';
 * import { setupApiTest, mockApi } from '@redux-workflow/core/testing';
 *
 * const harness = setupApiTest({
 *   api: billingApi,
 *   mocks: [
 *     mockApi(authApi, {
 *       queries: {
 *         getCurrentUser: () => ({ data: { id: '1', role: 'admin' } }),
 *       },
 *     }),
 *   ],
 * });
 */
export function mockApi(api: ApiInstance<any, any, any>, mocks: Mocks): MockSpec {
  // Validate eagerly so typos surface at the call site, not when the
  // interceptor saga first runs.
  for (const name of Object.keys(mocks.queries ?? {})) {
    if (!api.queries[name]) {
      throw new Error(
        `[mockApi] query "${name}" not found on api "${api.name}". ` +
          `Available: ${Object.keys(api.queries).join(', ') || '(none)'}`,
      );
    }
  }
  for (const name of Object.keys(mocks.mutations ?? {})) {
    if (!api.mutations[name]) {
      throw new Error(
        `[mockApi] mutation "${name}" not found on api "${api.name}". ` +
          `Available: ${Object.keys(api.mutations).join(', ') || '(none)'}`,
      );
    }
  }
  return { api, mocks };
}

/**
 * Run the interceptor saga for a single mocked api. Replaces
 * `api.rootSaga` in the test store. Watches each mocked query/mutation's
 * trigger action and emits the corresponding lifecycle actions with the
 * mocked result.
 */
export function* runInterceptorSaga(spec: MockSpec): SagaGen<void> {
  const { api, mocks } = spec;

  const tasks = [];

  for (const [name, mockFn] of Object.entries(mocks.queries ?? {})) {
    const instance = api.queries[name];
    if (!instance) {
      throw new Error(
        `[mockApi] query "${name}" not found on api "${api.name}". ` +
          `Available: ${Object.keys(api.queries).join(', ') || '(none)'}`,
      );
    }
    tasks.push(call(watchQuery, instance, mockFn));
  }

  for (const [name, mockFn] of Object.entries(mocks.mutations ?? {})) {
    const instance = api.mutations[name];
    if (!instance) {
      throw new Error(
        `[mockApi] mutation "${name}" not found on api "${api.name}". ` +
          `Available: ${Object.keys(api.mutations).join(', ') || '(none)'}`,
      );
    }
    tasks.push(call(watchMutation, instance, mockFn));
  }

  if (tasks.length === 0) return;
  yield* all(tasks);
}

function* watchQuery(instance: QueryInstance, mockFn: MockFn<unknown, unknown>): SagaGen<void> {
  while (true) {
    const action = yield* take(instance.trigger.match);
    // Fork per trigger so concurrent fetches with different args don't
    // serialize behind each other.
    yield* fork(runOneQuery, instance, mockFn, (action as { payload: unknown }).payload);
  }
}

function* runOneQuery(
  instance: QueryInstance,
  mockFn: MockFn<unknown, unknown>,
  args: unknown,
): SagaGen<void> {
  const cacheKey = buildCacheKey(instance._key, args);

  yield* put(instance._pendingAction({ args, cacheKey } as any));

  const result = yield* resolveMock(mockFn, args);

  if ('data' in result) {
    yield* put(instance._fulfilledAction({ args, cacheKey, data: result.data } as any));
  } else {
    yield* put(
      instance._rejectedAction({ args, cacheKey, error: toErrorMessage(result.error) } as any),
    );
  }
}

function* watchMutation(
  instance: MutationInstance,
  mockFn: MockFn<unknown, unknown>,
): SagaGen<void> {
  while (true) {
    const action = yield* take(instance.trigger.match);
    yield* fork(runOneMutation, instance, mockFn, (action as { payload: unknown }).payload);
  }
}

function* runOneMutation(
  instance: MutationInstance,
  mockFn: MockFn<unknown, unknown>,
  args: unknown,
): SagaGen<void> {
  const mutationKey = instance._key;

  yield* put(instance._pendingAction({ args, mutationKey } as any));

  const result = yield* resolveMock(mockFn, args);

  if ('data' in result) {
    yield* put(instance._fulfilledAction({ args, mutationKey, data: result.data } as any));
  } else {
    yield* put(
      instance._rejectedAction({ args, mutationKey, error: toErrorMessage(result.error) } as any),
    );
  }
}

function* resolveMock(
  mockFn: MockFn<unknown, unknown>,
  args: unknown,
): SagaGen<MockResult<unknown>> {
  try {
    const raw = mockFn(args);
    if (isGenerator(raw)) {
      return yield* raw as SagaGen<MockResult<unknown>>;
    }
    if (raw instanceof Promise) {
      return yield* call(() => raw);
    }
    return raw as MockResult<unknown>;
  } catch (err) {
    return { error: err };
  }
}

function isGenerator(value: unknown): value is SagaGen<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { next?: unknown }).next === 'function'
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

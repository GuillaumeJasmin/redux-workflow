/* eslint-disable @typescript-eslint/no-explicit-any */

import { getContext } from 'typed-redux-saga';
import type { AnyActionCreator, ExecuteCallContext, SagaGen } from '../createApi/types';

export function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function getActionTypes(creators: AnyActionCreator[]): string[] {
  return creators.map((creator) => creator.type);
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error == null) return 'unknown';
  if (typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return '[unserializable error]';
    }
  }
  // After the narrowing above `error` is number | boolean | bigint | symbol |
  // function — all safe to stringify with no `[object Object]` risk.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(error);
}

export function isErrorResult(result: any): result is { error: unknown } {
  return result != null && typeof result === 'object' && 'error' in result;
}

/**
 * Verify the host saga middleware was wired with `getState` in its
 * context. Called once at rootSaga startup — we fail loudly there
 * rather than letting every `execute` body silently get a broken
 * `ctx.getState`.
 */
export function* assertGetStateInContext(): SagaGen<void> {
  const getState = yield* getContext<() => any>('getState');
  if (typeof getState !== 'function') {
    throw new Error(
      '[redux-workflow] `getState` is missing from the saga middleware context. ' +
        'After configureStore, call `sagaMiddleware.setContext({ getState: store.getState })` ' +
        'before running the root saga.',
    );
  }
}

/**
 * Build the `ctx` object passed as second arg to `execute`.
 * Assumes `assertGetStateInContext` already ran at startup.
 */
export function* buildExecuteCallContext(): SagaGen<ExecuteCallContext> {
  const getState = yield* getContext<() => any>('getState');
  return { getState: getState as () => any };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

import createSagaMiddleware from 'redux-saga';
import type { Middleware, Reducer } from '@reduxjs/toolkit';
import type { ApiInstance } from './createApi/types';

type SagaErrorInfo = { sagaStack: string };
type ErrorHandler = (error: Error, errorInfo: SagaErrorInfo) => void;

export type CombineApisOptions = {
  /**
   * Receives every uncaught saga error — both errors caught by
   * `createRootSaga`'s spawn-restart wrapper (the default for every api's
   * rootSaga) and errors that bypass it via the saga middleware's native
   * `onError` channel.
   */
  onError?: ErrorHandler;
};

export type CombineApisResult = {
  /**
   * Reducer map keyed by each api's `reducerPath`. Spread into
   * `configureStore({ reducer: { ...result.reducers, ...yourOwn } })`.
   */
  reducers: Record<string, Reducer>;
  /**
   * Saga middleware to add to the store. Wires `setContext({ getState })`
   * automatically the first time redux applies it, so async `execute`
   * bodies can call `ctx.getState()` against live store state.
   *
   * It is safe to compose this alongside other saga middlewares — each
   * `createSagaMiddleware()` instance is independent. To migrate a legacy
   * app gradually, append both middlewares:
   *   `getDefault().concat(legacySagaMiddleware, apis.middleware)`
   */
  middleware: Middleware;
  /**
   * Run every api's root saga. Call after `configureStore`.
   * Throws if called twice.
   */
  runMiddleware(): void;
};

export function combineApis(
  apis: ApiInstance<any, any, any>[],
  options: CombineApisOptions = {},
): CombineApisResult {
  const { onError } = options;

  const sagaMiddleware = createSagaMiddleware({
    // Backup channel: errors that bypass createRootSaga's wrapper land here.
    onError: (error, errorInfo) => {
      onError?.(error, errorInfo);
    },
  });

  const middleware: Middleware = (storeApi) => {
    // redux-saga's setContext value type is `any`; forwarding a typed
    // getState() arrow trips no-unsafe-return on its inferred return.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    sagaMiddleware.setContext({ getState: () => storeApi.getState() });
    return sagaMiddleware(storeApi);
  };

  const reducers: Record<string, Reducer> = Object.fromEntries(
    apis.map((api) => [api.reducerPath, api.reducer]),
  );

  // Adapter: createRootSaga's catch passes a bare `Error`, but combineApis's
  // public onError exposes the saga-middleware-style `(error, info)` shape.
  const rootSagaOnError = onError
    ? (error: Error) => {
        onError(error, { sagaStack: error.stack ?? '' });
      }
    : undefined;

  let started = false;

  function runMiddleware(): void {
    if (started) {
      throw new Error('[redux-workflow] combineApis().runMiddleware called twice');
    }
    started = true;
    for (const api of apis) {
      sagaMiddleware.run(api.rootSaga, rootSagaOnError);
    }
  }

  return { reducers, middleware, runMiddleware };
}

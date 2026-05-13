/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Saga } from 'redux-saga';
import { all, call, spawn, put } from 'typed-redux-saga';
import type { SagaGen } from '../createApi/types';

export const SAGA_ERROR = '@redux-workflow/sagaError';

export type SagaErrorAction = {
  type: typeof SAGA_ERROR;
  error: string;
};

type RootSagaErrorHandler = (error: Error) => void;

/**
 * Wrap a list of sagas with `spawn` + `while-true try/catch` so:
 *   - one watcher crashing doesn't take down its siblings (`spawn` detaches)
 *   - a crashed watcher is restarted automatically
 *   - every catch dispatches a `SAGA_ERROR` action (observable via the store)
 *     and invokes the optional `onError` callback
 *
 * `combineApis` builds an api's rootSaga as `function*(onError) { … }`,
 * forwards the onError handler from its `options.onError`, and runs it via
 * `sagaMiddleware.run(api.rootSaga, onError)`.
 */
export function createRootSaga(sagas: Saga[], onError?: RootSagaErrorHandler) {
  return function* rootSaga(): SagaGen<void> {
    yield* all(
      sagas.map((saga) =>
        spawn(function* (): SagaGen<void> {
          while (true) {
            try {
              yield* call(saga);
              break;
            } catch (error) {
              if (onError && error instanceof Error) {
                onError(error);
              }
              yield* put({
                type: SAGA_ERROR,
                error:
                  typeof (error as any)?.toString === 'function'
                    ? (error as any).toString()
                    : String(error),
              } as SagaErrorAction);
            }
          }
        }),
      ),
    );
  };
}

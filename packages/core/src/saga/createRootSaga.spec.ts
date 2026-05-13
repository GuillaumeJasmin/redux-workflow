/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-yield */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import type { Saga } from 'redux-saga';
import { createRootSaga, SAGA_ERROR } from './createRootSaga';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setupStoreWithSagas(rootSaga: Saga) {
  const dispatched: { type: string; error?: string }[] = [];
  const captureMiddleware = () => (next: (action: unknown) => unknown) => (action: unknown) => {
    dispatched.push(action as { type: string });
    return next(action);
  };
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: (state: object = {}) => state,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, thunk: false })
        .concat(captureMiddleware as any)
        .concat(sagaMiddleware),
  });
  sagaMiddleware.run(rootSaga);
  return { store, dispatched };
}

describe('createRootSaga', () => {
  it('isolates sibling sagas: one crashing does not stop the others', async () => {
    let aCalls = 0;
    let bRan = false;

    function* sagaA(): Generator {
      aCalls += 1;
      // Crash on the first attempt; succeed on the second so we don't loop forever.
      if (aCalls === 1) throw new Error('A boom');
    }

    function* sagaB(): Generator {
      bRan = true;
    }

    setupStoreWithSagas(createRootSaga([sagaA, sagaB]));
    await flush();
    await flush();

    expect(aCalls).toBe(2);
    expect(bRan).toBe(true);
  });

  it('auto-restarts a saga that throws — second invocation runs the success path', async () => {
    let calls = 0;

    function* flaky(): Generator {
      calls += 1;
      if (calls === 1) throw new Error('first attempt fails');
      // Second call: returns normally so the while-loop breaks.
    }

    setupStoreWithSagas(createRootSaga([flaky]));
    await flush();
    await flush();

    expect(calls).toBe(2);
  });

  it('dispatches a SAGA_ERROR action carrying the error toString', async () => {
    let calls = 0;

    function* boomer(): Generator {
      calls += 1;
      if (calls === 1) throw new Error('boomer');
    }

    const { dispatched } = setupStoreWithSagas(createRootSaga([boomer]));
    await flush();
    await flush();

    const errors = dispatched.filter((a) => a.type === SAGA_ERROR);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).toBe('Error: boomer');
  });

  it('invokes the optional onError callback for Error throws', async () => {
    let calls = 0;
    const onError = vi.fn();

    function* boom(): Generator {
      calls += 1;
      if (calls === 1) throw new Error('observed');
    }

    setupStoreWithSagas(createRootSaga([boom], onError));
    await flush();
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe('observed');
  });

  it('skips onError when the throw is not an Error instance, but still dispatches SAGA_ERROR', async () => {
    let calls = 0;
    const onError = vi.fn();

    function* boom(): Generator {
      calls += 1;
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (calls === 1) throw 'not-an-error';
    }

    const { dispatched } = setupStoreWithSagas(createRootSaga([boom], onError));
    await flush();
    await flush();

    expect(onError).not.toHaveBeenCalled();
    expect(dispatched.some((a) => a.type === SAGA_ERROR)).toBe(true);
  });
});

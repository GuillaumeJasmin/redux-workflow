/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { MutationEntry, MutationInstance } from '@redux-workflow/core';

export type UseMutationStatus<TResult> = {
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: TResult | null;
  error: unknown | null;
  reset: () => void;
};

export type UseMutationResult<TResult, TArgs> = [
  trigger: [TArgs] extends [void] ? () => void : (args: TArgs) => void,
  status: UseMutationStatus<TResult>,
];

function selectEntry(
  state: any,
  reducerPath: string,
  mutationKey: string,
): MutationEntry | undefined {
  return state[reducerPath]?.mutations?.[mutationKey];
}

/**
 * Run a mutation. Returns a `[trigger, status]` tuple. The status entry is
 * shared across every component reading the same mutation — call
 * `status.reset()` to clear `data`/`error` and return to `idle`.
 *
 * @example
 * const [updateUser, { isLoading, error, reset }] = useMutation(
 *   usersApi.mutations.updateUser,
 * );
 * // ... <button onClick={() => updateUser({ id, name })}>Save</button>
 */
export function useMutation<TResult, TArgs>(
  instance: MutationInstance<TResult, TArgs>,
): UseMutationResult<TResult, TArgs> {
  const dispatch = useDispatch();

  const entry = useSelector((state: any) =>
    selectEntry(state, instance._reducerPath, instance._key),
  );

  const trigger = useCallback(
    (args: TArgs) => {
      dispatch(instance.trigger(args));
    },
    [dispatch, instance],
  );

  const reset = useCallback(() => {
    dispatch(instance._reset({ mutationKey: instance._key }));
  }, [dispatch, instance]);

  const status = entry?.status ?? 'idle';

  return [
    trigger as UseMutationResult<TResult, TArgs>[0],
    {
      isLoading: status === 'pending',
      isSuccess: status === 'fulfilled',
      isError: status === 'rejected',
      data: (entry?.data as TResult | null) ?? null,
      error: entry?.error ?? null,
      reset,
    },
  ];
}

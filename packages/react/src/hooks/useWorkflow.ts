/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { WorkflowEntry, WorkflowInstance } from '@redux-workflow/core';

export type UseWorkflowOptions = {
  cancelOnUnmount?: boolean;
};

export type UseWorkflowStatus<TResult> = {
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: TResult | null;
  error: unknown | null;
  reset: () => void;
};

export type UseWorkflowResult<TResult, TArgs> = [
  trigger: [TArgs] extends [void] ? () => void : (args: TArgs) => void,
  status: UseWorkflowStatus<TResult>,
];

function selectEntry(
  state: any,
  reducerPath: string,
  workflowKey: string,
): WorkflowEntry | undefined {
  return state[reducerPath]?.workflows?.[workflowKey];
}

/**
 * Run a workflow. Returns a `[trigger, status]` tuple. Pass
 * `{ cancelOnUnmount: true }` to dispatch the workflow's cancel action when
 * the component unmounts — useful for long-running orchestrations the user
 * navigated away from.
 *
 * @example
 * const [importBatch, { isLoading }] = useWorkflow(
 *   api.workflows.importBatch,
 *   { cancelOnUnmount: true },
 * );
 */
export function useWorkflow<TResult, TArgs>(
  instance: WorkflowInstance<TResult, TArgs>,
  options: UseWorkflowOptions = {},
): UseWorkflowResult<TResult, TArgs> {
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
    dispatch(instance._reset({ workflowKey: instance._key }));
  }, [dispatch, instance]);

  useEffect(() => {
    if (!options.cancelOnUnmount) return;

    return () => {
      dispatch(instance.cancel());
    };
  }, [dispatch, instance, options.cancelOnUnmount]);

  const status = entry?.status ?? 'idle';

  return [
    trigger as UseWorkflowResult<TResult, TArgs>[0],
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

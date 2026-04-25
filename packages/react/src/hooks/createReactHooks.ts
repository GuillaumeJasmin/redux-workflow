/* eslint-disable react-hooks/rules-of-hooks -- factory builds hooks with dynamic names; calls inside `useXxxQuery`-shaped properties are real custom hooks at runtime */

import type {
  ApiInstance,
  MutationInstance,
  QueryInstance,
  WorkflowInstance,
} from '@redux-workflow/core';
import { useQuery, type UseQueryOptions, type UseQueryResult } from './useQuery';
import { useLazyQuery, type UseLazyQueryResult } from './useLazyQuery';
import { useMutation, type UseMutationResult } from './useMutation';
import { useWorkflow, type UseWorkflowOptions, type UseWorkflowResult } from './useWorkflow';

// ---------------- Generated hook signatures ----------------

type QueryHook<I> =
  I extends QueryInstance<infer TResult, infer TArgs>
    ? (args: TArgs, options?: UseQueryOptions) => UseQueryResult<TResult>
    : never;

type LazyQueryHook<I> =
  I extends QueryInstance<infer TResult, infer TArgs>
    ? () => UseLazyQueryResult<TResult, TArgs>
    : never;

type MutationHook<I> =
  I extends MutationInstance<infer TResult, infer TArgs>
    ? () => UseMutationResult<TResult, TArgs>
    : never;

type WorkflowHook<I> =
  I extends WorkflowInstance<infer TResult, infer TArgs>
    ? (options?: UseWorkflowOptions) => UseWorkflowResult<TResult, TArgs>
    : never;

export type ReactHooks<
  Q extends Record<string, QueryInstance>,
  M extends Record<string, MutationInstance>,
  W extends Record<string, WorkflowInstance>,
> = {
  [K in keyof Q & string as `use${Capitalize<K>}Query`]: QueryHook<Q[K]>;
} & {
  [K in keyof Q & string as `use${Capitalize<K>}LazyQuery`]: LazyQueryHook<Q[K]>;
} & {
  [K in keyof M & string as `use${Capitalize<K>}Mutation`]: MutationHook<M[K]>;
} & {
  [K in keyof W & string as `use${Capitalize<K>}Workflow`]: WorkflowHook<W[K]>;
};

// ---------------- Factory ----------------

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function createReactHooks<
  Q extends Record<string, QueryInstance>,
  M extends Record<string, MutationInstance>,
  W extends Record<string, WorkflowInstance>,
>(api: ApiInstance<Q, M, W>): ReactHooks<Q, M, W> {
  const hooks: Record<string, unknown> = {};

  for (const [name, instance] of Object.entries(api.queries)) {
    const cap = capitalize(name);
    hooks[`use${cap}Query`] = (args: unknown, options?: UseQueryOptions) =>
      useQuery(instance, args, options);
    hooks[`use${cap}LazyQuery`] = () => useLazyQuery(instance);
  }

  for (const [name, instance] of Object.entries(api.mutations)) {
    const cap = capitalize(name);
    hooks[`use${cap}Mutation`] = () => useMutation(instance);
  }

  for (const [name, instance] of Object.entries(api.workflows)) {
    const cap = capitalize(name);
    hooks[`use${cap}Workflow`] = (options?: UseWorkflowOptions) => useWorkflow(instance, options);
  }

  return hooks as ReactHooks<Q, M, W>;
}

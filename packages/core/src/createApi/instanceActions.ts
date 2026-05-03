import { createAction } from '@reduxjs/toolkit';
import type { ActionCreatorWithPayload } from '@reduxjs/toolkit';

type SagaQueryInstanceKind = 'query' | 'mutation' | 'workflow';
type SagaQueryPhase = 'pending' | 'fulfilled' | 'rejected';

export function createInstanceAction<TPayload>(
  type: string,
  instanceKind: SagaQueryInstanceKind,
  phase: SagaQueryPhase,
): ActionCreatorWithPayload<TPayload> {
  const creator = createAction(type, (payload: TPayload) => ({
    payload,
    meta: { sagaQuery: { instanceKind, phase } },
  }));
  return creator;
}

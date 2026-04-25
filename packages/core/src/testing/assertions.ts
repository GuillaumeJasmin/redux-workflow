/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'vitest';
import type { CacheEntry } from '../store/cacheSlice';
import type { MutationEntry } from '../store/mutationSlice';
import type { WorkflowEntry } from '../store/workflowSlice';

export class QueryAssertion<TResult> {
  constructor(public readonly entry: CacheEntry | undefined) {}

  isUninitialized(): this {
    const status = this.entry?.status ?? 'uninitialized';
    expect(status).toBe('uninitialized');
    return this;
  }

  isPending(): this {
    expect(this.entry?.status).toBe('pending');
    return this;
  }

  isFulfilled(): this {
    expect(this.entry?.status).toBe('fulfilled');
    return this;
  }

  isRejected(): this {
    expect(this.entry?.status).toBe('rejected');
    return this;
  }

  hasData(expected: TResult): this {
    expect(this.entry?.data).toEqual(expected);
    return this;
  }

  hasPartialData(expected: Partial<TResult>): this {
    expect(this.entry?.data).toMatchObject(expected as any);
    return this;
  }

  hasError(expected: unknown): this {
    expect(this.entry?.error).toEqual(expected);
    return this;
  }

  raw(): CacheEntry | undefined {
    return this.entry;
  }
}

export class MutationAssertion<TResult> {
  constructor(public readonly entry: MutationEntry | undefined) {}

  isIdle(): this {
    const status = this.entry?.status ?? 'idle';
    expect(status).toBe('idle');
    return this;
  }

  isPending(): this {
    expect(this.entry?.status).toBe('pending');
    return this;
  }

  isFulfilled(): this {
    expect(this.entry?.status).toBe('fulfilled');
    return this;
  }

  isRejected(): this {
    expect(this.entry?.status).toBe('rejected');
    return this;
  }

  hasData(expected: TResult): this {
    expect(this.entry?.data).toEqual(expected);
    return this;
  }

  hasPartialData(expected: Partial<TResult>): this {
    expect(this.entry?.data).toMatchObject(expected as any);
    return this;
  }

  hasError(expected: unknown): this {
    expect(this.entry?.error).toEqual(expected);
    return this;
  }

  raw(): MutationEntry | undefined {
    return this.entry;
  }
}

export class WorkflowAssertion<TResult> {
  constructor(public readonly entry: WorkflowEntry | undefined) {}

  isIdle(): this {
    const status = this.entry?.status ?? 'idle';
    expect(status).toBe('idle');
    return this;
  }

  isPending(): this {
    expect(this.entry?.status).toBe('pending');
    return this;
  }

  isFulfilled(): this {
    expect(this.entry?.status).toBe('fulfilled');
    return this;
  }

  isRejected(): this {
    expect(this.entry?.status).toBe('rejected');
    return this;
  }

  hasData(expected: TResult): this {
    expect(this.entry?.data).toEqual(expected);
    return this;
  }

  hasPartialData(expected: Partial<TResult>): this {
    expect(this.entry?.data).toMatchObject(expected as any);
    return this;
  }

  hasError(expected: unknown): this {
    expect(this.entry?.error).toEqual(expected);
    return this;
  }

  raw(): WorkflowEntry | undefined {
    return this.entry;
  }
}

export class SliceAssertion<TState> {
  constructor(public readonly state: TState) {}

  equals(expected: TState): this {
    expect(this.state).toEqual(expected);
    return this;
  }

  matches(expected: Partial<TState>): this {
    expect(this.state).toMatchObject(expected as any);
    return this;
  }
}

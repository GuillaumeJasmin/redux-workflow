import type { QueryInstance, QueryStatus } from '../createApi/types';

export function buildCacheKey(queryKey: string, args: unknown): string {
  const serializedArgs = args === undefined ? '' : stableStringify(args);
  return `${queryKey}(${serializedArgs})`;
}

/**
 * The prefix that every cacheKey for a given query starts with.
 * `buildCacheKey('q', args)` produces `q(<serializedArgs>)`, so the prefix
 * up to the opening paren uniquely identifies which query a cacheKey belongs to.
 */
export function cacheKeyPrefix(queryKey: string): string {
  return `${queryKey}(`;
}

export function findQueryInstanceForCacheKey(
  cacheKey: string,
  instances: QueryInstance[],
): QueryInstance | undefined {
  for (const instance of instances) {
    if (cacheKey.startsWith(cacheKeyPrefix(instance._key))) return instance;
  }
  return undefined;
}

type CacheEntryShape = {
  status: QueryStatus;
  updatedAt: number | null;
};

export function isCacheStale(
  entry: CacheEntryShape | undefined,
  ttlSeconds: number | undefined,
): boolean {
  if (!entry || entry.status === 'uninitialized') {
    return true;
  }

  if (entry.status === 'rejected') {
    return true;
  }

  if (ttlSeconds === undefined || ttlSeconds <= 0) {
    return false;
  }

  if (entry.updatedAt === null) {
    return true;
  }

  const ageSeconds = (Date.now() - entry.updatedAt) / 1000;

  return ageSeconds > ttlSeconds;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const record = val as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = record[key];
          return acc;
        }, {});
    }
    return val;
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApi, buildCacheKey, httpRequest } from './index';
import { setupStore, getCache, getMutation } from './testing';

type MockFetch = ReturnType<typeof vi.fn>;

function makeResponse(
  body: unknown,
  init: { status?: number; contentType?: string } = {},
): Response {
  const { status = 200, contentType = 'application/json' } = init;
  const payload = contentType === 'application/json' ? JSON.stringify(body) : String(body);
  return new Response(payload, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

describe('httpRequest', () => {
  let fetchMock: MockFetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy GET returns { data } and issues the correct request', async () => {
    fetchMock.mockResolvedValue(makeResponse({ id: '1', name: 'Alice' }));

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          execute: httpRequest<{ id: string; name: string }, { id: string }>({
            baseUrl: 'https://api.example.com',
            url: ({ id }) => `/users/${id}`,
          }),
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/users/1');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'fulfilled',
      data: { id: '1', name: 'Alice' },
    });
  });

  it('POST with plain object body is JSON-stringified and tagged Content-Type', async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: true }));

    const api = createApi({
      name: 'test',
      mutations: (mutation) => ({
        createUser: mutation({
          execute: httpRequest<{ ok: boolean }, { name: string }>({
            baseUrl: 'https://api.example.com',
            url: '/users',
            method: 'POST',
            body: (args: { name: string }) => args,
          }),
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.mutations.createUser.trigger({ name: 'Bob' }));
    await flush();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/users');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Bob' }));
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');

    expect(getMutation(store, api.reducerPath, api.mutations.createUser._key)).toMatchObject({
      status: 'fulfilled',
      data: { ok: true },
    });
  });

  it('appends params as a query string, skipping null/undefined', async () => {
    fetchMock.mockResolvedValue(makeResponse([]));

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        search: query({
          execute: httpRequest<unknown[], { q: string; page: number }>({
            baseUrl: 'https://api.example.com',
            url: '/search',
            params: ({ q, page }) => ({
              q,
              page,
              limit: 10,
              cursor: null,
            }),
          }),
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.search.trigger({ q: 'redux', page: 2 }));
    await flush();

    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/search');
    expect(parsed.searchParams.get('q')).toBe('redux');
    expect(parsed.searchParams.get('page')).toBe('2');
    expect(parsed.searchParams.get('limit')).toBe('10');
    expect(parsed.searchParams.has('cursor')).toBe(false);
  });

  it('non-2xx HTTP response produces { error: { status, data } }', async () => {
    fetchMock.mockResolvedValue(makeResponse({ message: 'not found' }, { status: 404 }));

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          execute: httpRequest<unknown, { id: string }>({
            baseUrl: 'https://api.example.com',
            url: ({ id }) => `/users/${id}`,
          }),
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.getUser.trigger({ id: 'missing' }));
    await flush();

    const cacheKey = buildCacheKey(api.queries.getUser._key, {
      id: 'missing',
    });
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'rejected',
      error: { status: 404, data: { message: 'not found' } },
    });
  });

  it('fetch rejection (network failure) produces { error: NETWORK_ERROR }', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          execute: httpRequest<unknown, { id: string }>({
            baseUrl: 'https://api.example.com',
            url: ({ id }) => `/users/${id}`,
          }),
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      status: 'rejected',
      error: 'NETWORK_ERROR',
    });
  });

  it('transformResponse maps the parsed body into TResult', async () => {
    fetchMock.mockResolvedValue(makeResponse({ data: { id: '1', name: 'Alice' } }));

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          execute: httpRequest<{ id: string; name: string }, { id: string }>({
            baseUrl: 'https://api.example.com',
            url: ({ id }) => `/users/${id}`,
            transformResponse: (raw: any) => raw.data,
          }),
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    const cacheKey = buildCacheKey(api.queries.getUser._key, { id: '1' });
    expect(getCache(store, api.reducerPath, cacheKey)).toMatchObject({
      data: { id: '1', name: 'Alice' },
    });
  });

  it('prepareHeaders receives ctx.getState and can set headers', async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: true }));

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getUser: query({
          execute: httpRequest<unknown, { id: string }>({
            baseUrl: 'https://api.example.com',
            url: ({ id }) => `/users/${id}`,
            prepareHeaders: (headers, ctx) => {
              // Exercise the ctx.getState wiring and set a header.
              ctx.getState();
              headers.set('Authorization', 'Bearer token-123');
              return headers;
            },
          }),
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.getUser.trigger({ id: '1' }));
    await flush();

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer token-123');
  });

  it('accepts a full absolute URL (ignores baseUrl)', async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: true }));

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        ping: query({
          execute: httpRequest<{ ok: boolean }>({
            baseUrl: 'https://api.example.com',
            url: 'https://other-host.test/ping',
          }),
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.ping.trigger());
    await flush();

    expect(fetchMock.mock.calls[0]![0]).toBe('https://other-host.test/ping');
  });

  it('fetchFn option replaces globalThis.fetch for that endpoint', async () => {
    const customFetch = vi.fn().mockResolvedValue(makeResponse({ custom: 1 }));

    const api = createApi({
      name: 'test',
      queries: (query) => ({
        getThing: query({
          execute: httpRequest<{ custom: number }>({
            baseUrl: 'https://api.example.com',
            url: '/thing',
            fetchFn: customFetch,
          }),
        }),
      }),
    });

    const { store, flush } = setupStore(api);
    store.dispatch(api.queries.getThing.trigger());
    await flush();

    expect(customFetch).toHaveBeenCalledTimes(1);
    // Global fetch mock untouched.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import type { ExecuteCallContext, QueryResultShape } from './createApi/types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type HttpError = {
  status: number;
  data: unknown;
};

type MaybeFn<TValue, TArgs> = TValue | ((args: TArgs) => TValue);

type ParamValue = string | number | boolean | null | undefined;

export type HttpQueryOptions<TResult, TArgs> = {
  /** Full URL, or path appended to `baseUrl`. Accepts a function of args. */
  url: MaybeFn<string, TArgs>;
  /** Prefix prepended to `url` when `url` doesn't start with http(s)://. */
  baseUrl?: string;
  /** Defaults to `'GET'`. */
  method?: HttpMethod;
  /**
   * Request body. Plain objects are JSON-stringified and the request gets a
   * `Content-Type: application/json` header. `FormData`, `URLSearchParams`,
   * `Blob`, `ArrayBuffer`, and strings are passed through untouched.
   */
  body?: MaybeFn<unknown, TArgs>;
  /** Header overrides; merged on top of auto-set headers (e.g. content-type). */
  headers?: MaybeFn<Record<string, string>, TArgs>;
  /** Appended as URL query string. `undefined` / `null` values are dropped. */
  params?: MaybeFn<Record<string, ParamValue>, TArgs>;
  /**
   * Mutate the final headers right before the request — typical use is
   * reading an auth token out of the store:
   *   `prepareHeaders: (h, { getState }) => { h.set('Authorization', …); return h; }`
   */
  prepareHeaders?: (headers: Headers, ctx: ExecuteCallContext) => Headers;
  /** Transform the parsed success payload into `TResult`. */
  transformResponse?: (response: unknown, args: TArgs) => TResult;
  /** Transform the parsed error payload into the `error` field of `{ error }`. */
  transformErrorResponse?: (response: unknown, status: number, args: TArgs) => unknown;
  /** Override `globalThis.fetch` — handy for tests or custom transports. */
  fetchFn?: typeof fetch;
};

function resolve<TValue, TArgs>(value: MaybeFn<TValue, TArgs>, args: TArgs): TValue {
  return typeof value === 'function' ? (value as (args: TArgs) => TValue)(args) : value;
}

function buildUrl(
  rawUrl: string,
  baseUrl: string | undefined,
  params: Record<string, ParamValue> | undefined,
): string {
  const isAbsolute = /^https?:\/\//i.test(rawUrl);
  const full = isAbsolute
    ? rawUrl
    : `${(baseUrl ?? '').replace(/\/+$/, '')}/${rawUrl.replace(/^\/+/, '')}`;

  if (!params) return full;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.append(key, String(value));
  }

  const query = search.toString();
  if (!query) return full;

  return full.includes('?') ? `${full}&${query}` : `${full}?${query}`;
}

function isPlainBody(body: unknown): boolean {
  return (
    body != null &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body)
  );
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

/**
 * Build an `execute` function backed by `fetch`. Fits directly as
 * `execute:` on a query or mutation definition:
 *
 * ```ts
 * getUser: query({
 *   execute: httpQuery<User, { id: string }>({
 *     url: ({ id }) => `/users/${id}`,
 *     baseUrl: 'https://api.example.com',
 *   }),
 * }),
 * ```
 *
 * On success returns `{ data }`. HTTP errors (non-2xx) return
 * `{ error: { status, data } }`. Transport errors (network, parse) return
 * `{ error: 'NETWORK_ERROR' }`.
 */
export function httpQuery<TResult = unknown, TArgs = void>(
  options: HttpQueryOptions<TResult, TArgs>,
): (args: TArgs, ctx: ExecuteCallContext) => Promise<QueryResultShape<TResult>> {
  return async function execute(args, ctx) {
    try {
      const rawUrl = resolve(options.url, args);
      const params = options.params ? resolve(options.params, args) : undefined;
      const url = buildUrl(rawUrl, options.baseUrl, params);

      const headers = new Headers();
      if (options.headers) {
        const headerEntries = resolve(options.headers, args);
        for (const [key, value] of Object.entries(headerEntries)) {
          headers.set(key, value);
        }
      }

      let body: BodyInit | undefined;
      if (options.body !== undefined) {
        const rawBody = resolve(options.body, args);
        if (isPlainBody(rawBody)) {
          body = JSON.stringify(rawBody);
          if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
          }
        } else {
          body = rawBody as BodyInit;
        }
      }

      const finalHeaders = options.prepareHeaders ? options.prepareHeaders(headers, ctx) : headers;

      const fetchFn = options.fetchFn ?? globalThis.fetch;
      const response = await fetchFn(url, {
        method: options.method ?? 'GET',
        headers: finalHeaders,
        body,
      });

      const parsed = await parseBody(response);

      if (!response.ok) {
        const errorData = options.transformErrorResponse
          ? options.transformErrorResponse(parsed, response.status, args)
          : ({ status: response.status, data: parsed } satisfies HttpError);
        return { error: errorData };
      }

      const data = options.transformResponse
        ? options.transformResponse(parsed, args)
        : (parsed as TResult);
      return { data };
    } catch {
      return { error: 'NETWORK_ERROR' };
    }
  };
}

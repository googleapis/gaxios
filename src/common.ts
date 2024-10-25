// Copyright 2018 Google LLC
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {Agent} from 'http';
import {URL} from 'url';

import {pkg} from './util';
import extend from 'extend';
import {Readable} from 'stream';

/**
 * TypeScript does not have this type available globally - however `@types/node` includes `undici-types`, which has it:
 * - https://www.npmjs.com/package/@types/node/v/18.19.59?activeTab=dependencies
 *
 * Additionally, this is the TypeScript pattern for type sniffing and `import("undici-types")` is pretty common:
 * - https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/node/globals.d.ts
 */
type _BodyInit = typeof globalThis extends {BodyInit: infer T}
  ? T
  : import('undici-types').BodyInit;
type _HeadersInit = typeof globalThis extends {HeadersInit: infer T}
  ? T
  : import('undici-types').HeadersInit;

/**
 * Support `instanceof` operator for `GaxiosError`s in different versions of this library.
 *
 * @see {@link GaxiosError[Symbol.hasInstance]}
 */
export const GAXIOS_ERROR_SYMBOL = Symbol.for(`${pkg.name}-gaxios-error`);

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export class GaxiosError<T = any> extends Error {
  /**
   * An Error code.
   * See {@link https://nodejs.org/api/errors.html#errorcode error.code}
   *
   * @example
   * 'ECONNRESET'
   */
  code?: string;
  /**
   * An HTTP Status code.
   * See {@link https://developer.mozilla.org/en-US/docs/Web/API/Response/status Response: status property}
   *
   * @example
   * 500
   */
  status?: number;

  /**
   * Support `instanceof` operator for `GaxiosError` across builds/duplicated files.
   *
   * @see {@link GAXIOS_ERROR_SYMBOL}
   * @see {@link GaxiosError[Symbol.hasInstance]}
   * @see {@link https://github.com/microsoft/TypeScript/issues/13965#issuecomment-278570200}
   * @see {@link https://stackoverflow.com/questions/46618852/require-and-instanceof}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/@@hasInstance#reverting_to_default_instanceof_behavior}
   */
  [GAXIOS_ERROR_SYMBOL] = pkg.version;

  /**
   * Support `instanceof` operator for `GaxiosError` across builds/duplicated files.
   *
   * @see {@link GAXIOS_ERROR_SYMBOL}
   * @see {@link GaxiosError[GAXIOS_ERROR_SYMBOL]}
   */
  static [Symbol.hasInstance](instance: unknown) {
    if (
      instance &&
      typeof instance === 'object' &&
      GAXIOS_ERROR_SYMBOL in instance &&
      instance[GAXIOS_ERROR_SYMBOL] === pkg.version
    ) {
      return true;
    }

    // fallback to native
    return Function.prototype[Symbol.hasInstance].call(GaxiosError, instance);
  }

  constructor(
    message: string,
    public config: GaxiosOptionsPrepared,
    public response?: GaxiosResponse<T>,
    cause?: unknown,
  ) {
    super(message, {cause});

    // deep-copy config as we do not want to mutate
    // the existing config for future retries/use
    this.config = extend(true, {}, config);
    if (this.response) {
      this.response.config = extend(true, {}, this.response.config);
    }

    if (this.response) {
      try {
        this.response.data = translateData(
          this.config.responseType,
          // workaround for `node-fetch`'s `.data` deprecation...
          this.response?.bodyUsed ? this.response?.data : undefined,
        );
      } catch {
        // best effort - don't throw an error within an error
        // we could set `this.response.config.responseType = 'unknown'`, but
        // that would mutate future calls with this config object.
      }

      this.status = this.response.status;
    }

    if (this.cause instanceof Error) {
      if (this.cause instanceof DOMException) {
        // 'code' is a legacy `number` for DOMExceptions, use the `name` instead:
        // - https://developer.mozilla.org/en-US/docs/Web/API/DOMException#error_names
        // Notably, useful for `AbortError`:
        // - https://developer.mozilla.org/en-US/docs/Web/API/DOMException#aborterror
        this.code = this.cause.name;
      } else if ('code' in this.cause && typeof this.cause.code === 'string') {
        this.code = this.cause.code;
      }
    }

    if (config.errorRedactor) {
      config.errorRedactor({
        config: this.config,
        response: this.response,
      });
    }
  }
}

type GaxiosResponseData =
  | ReturnType<JSON['parse']>
  | GaxiosOptionsPrepared['data'];

export type GaxiosPromise<T = GaxiosResponseData> = Promise<GaxiosResponse<T>>;

export interface GaxiosResponse<T = GaxiosResponseData> extends Response {
  config: GaxiosOptionsPrepared;
  data: T;
}

export interface GaxiosMultipartOptions {
  headers: _HeadersInit;
  content: string | Readable;
}

/**
 * Request options that are used to form the request.
 */
export interface GaxiosOptions extends RequestInit {
  /**
   * Optional method to override making the actual HTTP request. Useful
   * for writing tests.
   *
   * @deprecated Use {@link GaxiosOptions.fetchImplementation} instead.
   */
  adapter?: <T = GaxiosResponseData>(
    options: GaxiosOptionsPrepared,
    defaultAdapter: (options: GaxiosOptionsPrepared) => GaxiosPromise<T>,
  ) => GaxiosPromise<T>;
  url?: string | URL;
  /**
   * @deprecated
   */
  baseUrl?: string;
  baseURL?: string | URL;
  /**
   * The data to send in the {@link RequestInit.body} of the request. Objects will be
   * serialized as JSON, except for:
   * - `ArrayBuffer`
   * - `Blob`
   * - `Buffer` (Node.js)
   * - `DataView`
   * - `File`
   * - `FormData`
   * - `ReadableStream`
   * - `stream.Readable` (Node.js)
   * - strings
   * - `TypedArray` (e.g. `Uint8Array`, `BigInt64Array`)
   * - `URLSearchParams`
   * - all other objects where:
   *   - headers['Content-Type'] === 'application/x-www-form-urlencoded' (serialized as `URLSearchParams`)
   *
   * In all other cases, if you would like to prevent `application/json` as the
   * default `Content-Type` header you must provide a string or readable stream
   * rather than an object, e.g.:
   *
   * ```ts
   * {data: JSON.stringify({some: 'data'})}
   * {data: fs.readFile('./some-data.jpeg')}
   * ```
   */
  data?:
    | _BodyInit
    | ArrayBuffer
    | Blob
    | Buffer
    | DataView
    | File
    | FormData
    | ReadableStream
    | Readable
    | string
    | ArrayBufferView
    | URLSearchParams
    | {};
  /**
   * The maximum size of the http response `Content-Length` in bytes allowed.
   */
  maxContentLength?: number;
  /**
   * The maximum number of redirects to follow. Defaults to 20.
   *
   * @deprecated non-spec. Should use `20` if enabled per-spec: https://fetch.spec.whatwg.org/#http-redirect-fetch
   */
  maxRedirects?: number;
  /**
   * @deprecated non-spec. Should use `20` if enabled per-spec: https://fetch.spec.whatwg.org/#http-redirect-fetch
   */
  follow?: number;
  /**
   * A collection of parts to send as a `Content-Type: multipart/related` request.
   *
   * This is passed to {@link RequestInit.body}.
   */
  multipart?: GaxiosMultipartOptions[];
  params?: GaxiosResponseData;
  /**
   * @deprecated Use {@link URLSearchParams} instead and pass this directly to {@link GaxiosOptions.data `data`}.
   */
  paramsSerializer?: (params: {[index: string]: string | number}) => string;
  /**
   * A timeout for the request, in milliseconds. No timeout by default.
   */
  timeout?: number;
  /**
   * @deprecated ignored
   */
  onUploadProgress?: (progressEvent: GaxiosResponseData) => void;
  /**
   * If the `fetchImplementation` is native `fetch`, the
   * stream is a `ReadableStream`, otherwise `readable.Stream`
   */
  responseType?:
    | 'arraybuffer'
    | 'blob'
    | 'json'
    | 'text'
    | 'stream'
    | 'unknown';
  agent?: Agent | ((parsedUrl: URL) => Agent);
  validateStatus?: (status: number) => boolean;
  retryConfig?: RetryConfig;
  retry?: boolean;
  /**
   * Enables aborting via {@link AbortController}.
   */
  signal?: AbortSignal;
  /**
   * @deprecated non-spec. https://github.com/node-fetch/node-fetch/issues/1438
   */
  size?: number;
  /**
   * Implementation of `fetch` to use when making the API call. Will use `fetch` by default.
   *
   * @example
   *
   * let customFetchCalled = false;
   * const myFetch = (...args: Parameters<typeof fetch>) => {
   *  customFetchCalled = true;
   *  return fetch(...args);
   * };
   *
   * {fetchImplementation: myFetch};
   */
  fetchImplementation?: typeof fetch;
  // Configure client to use mTLS:
  cert?: string;
  key?: string;

  /**
   * An optional proxy to use for requests.
   * Available via `process.env.HTTP_PROXY` and `process.env.HTTPS_PROXY` as well - with a preference for the this config option when multiple are available.
   * The {@link GaxiosOptions.agent `agent`} option overrides this.
   *
   * @see {@link GaxiosOptions.noProxy}
   * @see {@link GaxiosOptions.agent}
   */
  proxy?: string | URL;
  /**
   * A list for excluding traffic for proxies.
   * Available via `process.env.NO_PROXY` as well as a common-separated list of strings - merged with any local `noProxy` rules.
   *
   * - When provided a string, it is matched by
   *   - Wildcard `*.` and `.` matching are available. (e.g. `.example.com` or `*.example.com`)
   * - When provided a URL, it is matched by the `.origin` property.
   *   - For example, requesting `https://example.com` with the following `noProxy`s would result in a no proxy use:
   *     - new URL('https://example.com')
   *     - new URL('https://example.com:443')
   *   - The following would be used with a proxy:
   *     - new URL('http://example.com:80')
   *     - new URL('https://example.com:8443')
   * - When provided a regular expression it is used to match the stringified URL
   *
   * @see {@link GaxiosOptions.proxy}
   */
  noProxy?: (string | URL | RegExp)[];

  /**
   * An experimental error redactor.
   *
   * @remarks
   *
   * This does not replace the requirement for an active Data Loss Prevention (DLP) provider. For DLP suggestions, see:
   * - https://cloud.google.com/sensitive-data-protection/docs/redacting-sensitive-data#dlp_deidentify_replace_infotype-nodejs
   * - https://cloud.google.com/sensitive-data-protection/docs/infotypes-reference#credentials_and_secrets
   *
   * @experimental
   */
  errorRedactor?: typeof defaultErrorRedactor | false;
}

export interface GaxiosOptionsPrepared extends GaxiosOptions {
  headers: globalThis.Headers;
  url: URL;
}

/**
 * Gaxios retry configuration.
 */
export interface RetryConfig {
  /**
   * The number of times to retry the request.  Defaults to 3.
   */
  retry?: number;

  /**
   * The number of retries already attempted.
   */
  currentRetryAttempt?: number;

  /**
   * The amount of time to initially delay the retry, in ms.  Defaults to 100ms.
   */
  retryDelay?: number;

  /**
   * The HTTP Methods that will be automatically retried.
   * Defaults to ['GET','PUT','HEAD','OPTIONS','DELETE']
   */
  httpMethodsToRetry?: string[];

  /**
   * The HTTP response status codes that will automatically be retried.
   * Defaults to: [[100, 199], [408, 408], [429, 429], [500, 599]]
   */
  statusCodesToRetry?: number[][];

  /**
   * Function to invoke when a retry attempt is made.
   */
  onRetryAttempt?: (err: GaxiosError) => Promise<void> | void;

  /**
   * Function to invoke which determines if you should retry
   */
  shouldRetry?: (err: GaxiosError) => Promise<boolean> | boolean;

  /**
   * When there is no response, the number of retries to attempt. Defaults to 2.
   */
  noResponseRetries?: number;

  /**
   * Function to invoke which returns a promise. After the promise resolves,
   * the retry will be triggered. If provided, this will be used in-place of
   * the `retryDelay`
   */
  retryBackoff?: (err: GaxiosError, defaultBackoffMs: number) => Promise<void>;

  /**
   * Time that the initial request was made. Users should not set this directly.
   */
  timeOfFirstRequest?: number;

  /**
   * The length of time to keep retrying in ms. The last sleep period will
   * be shortened as necessary, so that the last retry runs at deadline (and not
   * considerably beyond it).  The total time starting from when the initial
   * request is sent, after which an error will be returned, regardless of the
   * retrying attempts made meanwhile. Defaults to Number.MAX_SAFE_INTEGER indicating to effectively
   * ignore totalTimeout.
   */
  totalTimeout?: number;

  /*
   *  The maximum time to delay in ms. If retryDelayMultiplier results in a
   *  delay greater than maxRetryDelay, retries should delay by maxRetryDelay
   *  seconds instead. Defaults to Number.MAX_SAFE_INTEGER indicating to effectively ignore maxRetryDelay.
   */
  maxRetryDelay?: number;

  /*
   * The multiplier by which to increase the delay time between the completion of
   *  failed requests, and the initiation of the subsequent retrying request. Defaults to 2.
   */
  retryDelayMultiplier?: number;
}

function translateData(
  responseType: string | undefined,
  data: GaxiosResponseData,
) {
  switch (responseType) {
    case 'stream':
      return data;
    case 'json':
      return JSON.parse(JSON.stringify(data));
    case 'arraybuffer':
      return JSON.parse(Buffer.from(data).toString('utf8'));
    case 'blob':
      return JSON.parse(data.text());
    default:
      return data;
  }
}

/**
 * An experimental error redactor.
 *
 * @param config Config to potentially redact properties of
 * @param response Config to potentially redact properties of
 *
 * @experimental
 */
export function defaultErrorRedactor<
  O extends GaxiosOptionsPrepared,
  R extends GaxiosResponse<GaxiosResponseData>,
>(data: {config?: O; response?: R}) {
  const REDACT =
    '<<REDACTED> - See `errorRedactor` option in `gaxios` for configuration>.';

  function redactHeaders(headers?: Headers) {
    if (!headers) return;

    headers.forEach((_, key) => {
      // any casing of `Authentication`
      // any casing of `Authorization`
      // anything containing secret, such as 'client secret'
      if (
        /^authentication$/i.test(key) ||
        /^authorization$/i.test(key) ||
        /secret/i.test(key)
      )
        headers.set(key, REDACT);
    });
  }

  function redactString<T extends O | R>(obj: T, key: keyof T) {
    if (
      typeof obj === 'object' &&
      obj !== null &&
      typeof obj[key] === 'string'
    ) {
      const text = obj[key] as string;

      if (
        /grant_type=/i.test(text) ||
        /assertion=/i.test(text) ||
        /secret/i.test(text)
      ) {
        (obj[key] as {}) = REDACT;
      }
    }
  }

  function redactObject<T extends O['data'] | R>(obj: T | null) {
    if (!obj) {
      return;
    } else if (
      obj instanceof FormData ||
      obj instanceof URLSearchParams ||
      // support `node-fetch` FormData/URLSearchParams
      ('forEach' in obj && 'set' in obj)
    ) {
      (obj as FormData | URLSearchParams).forEach((_, key) => {
        if (['grant_type', 'assertion'].includes(key) || /secret/.test(key)) {
          (obj as FormData | URLSearchParams).set(key, REDACT);
        }
      });
    } else {
      if ('grant_type' in obj) {
        obj['grant_type'] = REDACT;
      }

      if ('assertion' in obj) {
        obj['assertion'] = REDACT;
      }

      if ('client_secret' in obj) {
        obj['client_secret'] = REDACT;
      }
    }
  }

  if (data.config) {
    redactHeaders(data.config.headers);

    redactString(data.config, 'data');
    redactObject(data.config.data);

    redactString(data.config, 'body');
    redactObject(data.config.body);

    if (data.config.url.searchParams.has('token')) {
      data.config.url.searchParams.set('token', REDACT);
    }

    if (data.config.url.searchParams.has('client_secret')) {
      data.config.url.searchParams.set('client_secret', REDACT);
    }
  }

  if (data.response) {
    defaultErrorRedactor({config: data.response.config});
    redactHeaders(data.response.headers);

    // workaround for `node-fetch`'s `.data` deprecation...
    if ((data.response as {} as Response).bodyUsed) {
      redactString(data.response, 'data');
      redactObject(data.response.data);
    }
  }

  return data;
}

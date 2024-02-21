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
    public config: GaxiosOptions,
    public response?: GaxiosResponse<T>,
    public error?: Error | NodeJS.ErrnoException
  ) {
    super(message);

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
          this.response?.data
        );
      } catch {
        // best effort - don't throw an error within an error
        // we could set `this.response.config.responseType = 'unknown'`, but
        // that would mutate future calls with this config object.
      }

      this.status = this.response.status;
    }

    if (error && 'code' in error && error.code) {
      this.code = error.code;
    }

    if (config.errorRedactor) {
      config.errorRedactor<T>({
        config: this.config,
        response: this.response,
      });
    }
  }
}

export interface Headers {
  [index: string]: any;
}
export type GaxiosPromise<T = any> = Promise<GaxiosResponse<T>>;

export interface GaxiosXMLHttpRequest {
  responseURL: string;
}

export interface GaxiosResponse<T = any> {
  config: GaxiosOptions;
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  request: GaxiosXMLHttpRequest;
}

/**
 * Request options that are used to form the request.
 */
export interface GaxiosOptions {
  /**
   * Optional method to override making the actual HTTP request. Useful
   * for writing tests.
   */
  adapter?: <T = any>(
    options: GaxiosOptions,
    defaultAdapter: (options: GaxiosOptions) => GaxiosPromise<T>
  ) => GaxiosPromise<T>;
  url?: string | URL;
  baseURL?: string | URL;
  method?:
    | 'GET'
    | 'HEAD'
    | 'POST'
    | 'DELETE'
    | 'PUT'
    | 'CONNECT'
    | 'OPTIONS'
    | 'TRACE'
    | 'PATCH';
  headers?: Headers;
  data?: any;
  body?: any;
  /**
   * The maximum size of the http response content in bytes allowed.
   */
  maxContentLength?: number;
  /**
   * The maximum number of redirects to follow. Defaults to 20.
   */
  maxRedirects?: number;
  follow?: number;
  params?: any;
  paramsSerializer?: (params: {[index: string]: string | number}) => string;
  timeout?: number;
  /**
   * @deprecated ignored
   */
  onUploadProgress?: (progressEvent: any) => void;
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
  // Should be instance of https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
  // interface. Left as 'any' due to incompatibility between spec and abort-controller.
  signal?: any;
  size?: number;
  /**
   * Implementation of `fetch` to use when making the API call. By default,
   * will use the browser context if available, and fall back to `node-fetch`
   * in node.js otherwise.
   */
  fetchImplementation?: FetchImplementation;
  // Configure client to use mTLS:
  cert?: string;
  key?: string;
  /**
   * An experimental error redactor.
   *
   * @experimental
   */
  errorRedactor?: typeof defaultErrorRedactor | false;
}
/**
 * A partial object of `GaxiosResponse` with only redactable keys
 *
 * @experimental
 */
export type RedactableGaxiosOptions = Pick<
  GaxiosOptions,
  'body' | 'data' | 'headers' | 'url'
>;
/**
 * A partial object of `GaxiosResponse` with only redactable keys
 *
 * @experimental
 */
export type RedactableGaxiosResponse<T = any> = Pick<
  GaxiosResponse<T>,
  'config' | 'data' | 'headers'
>;

/**
 * Configuration for the Gaxios `request` method.
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
   * Defaults to: [[100, 199], [429, 429], [500, 599]]
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
}

export type FetchImplementation = (
  input: FetchRequestInfo,
  init?: FetchRequestInit
) => Promise<FetchResponse>;

export type FetchRequestInfo = any;

export interface FetchResponse {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body: unknown | null;
  arrayBuffer(): Promise<unknown>;
  blob(): Promise<unknown>;
  readonly headers: FetchHeaders;
  json(): Promise<any>;
  text(): Promise<string>;
}

export interface FetchRequestInit {
  method?: string;
}

export interface FetchHeaders {
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
  forEach(
    callbackfn: (value: string, key: string) => void,
    thisArg?: any
  ): void;
}

function translateData(responseType: string | undefined, data: any) {
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
export function defaultErrorRedactor<T = any>(data: {
  config?: RedactableGaxiosOptions;
  response?: RedactableGaxiosResponse<T>;
}) {
  const REDACT =
    '<<REDACTED> - See `errorRedactor` option in `gaxios` for configuration>.';

  function redactHeaders(headers?: Headers) {
    if (!headers) return;

    for (const key of Object.keys(headers)) {
      // any casing of `Authentication`
      if (/^authentication$/.test(key)) {
        headers[key] = REDACT;
      }
    }
  }

  function redactString(obj: GaxiosOptions, key: keyof GaxiosOptions) {
    if (
      typeof obj === 'object' &&
      obj !== null &&
      typeof obj[key] === 'string'
    ) {
      const text = obj[key];

      if (/grant_type=/.test(text) || /assertion=/.test(text)) {
        obj[key] = REDACT;
      }
    }
  }

  function redactObject<T extends GaxiosOptions['data']>(obj: T) {
    if (typeof obj === 'object' && obj !== null) {
      if ('grant_type' in obj) {
        obj['grant_type'] = REDACT;
      }

      if ('assertion' in obj) {
        obj['assertion'] = REDACT;
      }
    }
  }

  if (data.config) {
    redactHeaders(data.config.headers);

    redactString(data.config, 'data');
    redactObject(data.config.data);

    redactString(data.config, 'body');
    redactObject(data.config.body);

    try {
      const url = new URL('', data.config.url);

      if (url.searchParams.has('token')) {
        url.searchParams.set('token', REDACT);
      }

      data.config.url = url.toString();
    } catch {
      // ignore error - no need to parse an invalid URL
    }
  }

  if (data.response) {
    defaultErrorRedactor({config: data.response.config});
    redactHeaders(data.response.headers);

    redactString(data.response, 'data');
    redactObject(data.response.data);
  }

  return data;
}

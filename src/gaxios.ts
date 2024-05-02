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

import extend from 'extend';
import {Agent} from 'http';
import {Agent as HTTPSAgent} from 'https';
import nodeFetch from 'node-fetch';
import qs from 'querystring';
import isStream from 'is-stream';
import {URL} from 'url';

import {
  FetchResponse,
  GaxiosMultipartOptions,
  GaxiosError,
  GaxiosOptions,
  GaxiosPromise,
  GaxiosResponse,
  Headers,
  defaultErrorRedactor,
} from './common';
import {getRetryConfig} from './retry';
import {PassThrough, Stream, pipeline} from 'stream';
import {v4} from 'uuid';
import {GaxiosInterceptorManager} from './interceptor';

/* eslint-disable @typescript-eslint/no-explicit-any */

const fetch = hasFetch() ? window.fetch : nodeFetch;

function hasWindow() {
  return typeof window !== 'undefined' && !!window;
}

function hasFetch() {
  return hasWindow() && !!window.fetch;
}

function hasBuffer() {
  return typeof Buffer !== 'undefined';
}

function hasHeader(options: GaxiosOptions, header: string) {
  return !!getHeader(options, header);
}

function getHeader(options: GaxiosOptions, header: string): string | undefined {
  header = header.toLowerCase();
  for (const key of Object.keys(options?.headers || {})) {
    if (header === key.toLowerCase()) {
      return options.headers![key];
    }
  }
  return undefined;
}

enum GaxiosInterceptorType {
  Request = 1,
  Response,
}

export class Gaxios {
  protected agentCache = new Map<
    string | URL,
    Agent | ((parsedUrl: URL) => Agent)
  >();

  /**
   * Default HTTP options that will be used for every HTTP request.
   */
  defaults: GaxiosOptions;

  /**
   * Interceptors
   */
  interceptors: {
    request: GaxiosInterceptorManager<GaxiosOptions>;
    response: GaxiosInterceptorManager<GaxiosResponse>;
  };

  /**
   * The Gaxios class is responsible for making HTTP requests.
   * @param defaults The default set of options to be used for this instance.
   */
  constructor(defaults?: GaxiosOptions) {
    this.defaults = defaults || {};
    this.interceptors = {
      request: new GaxiosInterceptorManager(),
      response: new GaxiosInterceptorManager(),
    };
  }

  /**
   * Perform an HTTP request with the given options.
   * @param opts Set of HTTP options that will be used for this HTTP request.
   */
  async request<T = any>(opts: GaxiosOptions = {}): GaxiosPromise<T> {
    opts = await this.#prepareRequest(opts);
    opts = await this.#applyInterceptors(opts);
    return this.#applyInterceptors(
      this._request(opts),
      GaxiosInterceptorType.Response
    );
  }

  private async _defaultAdapter<T>(
    opts: GaxiosOptions
  ): Promise<GaxiosResponse<T>> {
    const fetchImpl = opts.fetchImplementation || fetch;
    const res = (await fetchImpl(opts.url, opts)) as FetchResponse;
    const data = await this.getResponseData(opts, res);
    return this.translateResponse<T>(opts, res, data);
  }

  /**
   * Internal, retryable version of the `request` method.
   * @param opts Set of HTTP options that will be used for this HTTP request.
   */
  protected async _request<T = any>(
    opts: GaxiosOptions = {}
  ): GaxiosPromise<T> {
    try {
      let translatedResponse: GaxiosResponse<T>;
      if (opts.adapter) {
        translatedResponse = await opts.adapter<T>(
          opts,
          this._defaultAdapter.bind(this)
        );
      } else {
        translatedResponse = await this._defaultAdapter(opts);
      }

      if (!opts.validateStatus!(translatedResponse.status)) {
        if (opts.responseType === 'stream') {
          let response = '';
          await new Promise(resolve => {
            (translatedResponse?.data as Stream).on('data', chunk => {
              response += chunk;
            });
            (translatedResponse?.data as Stream).on('end', resolve);
          });
          translatedResponse.data = response as T;
        }
        throw new GaxiosError<T>(
          `Request failed with status code ${translatedResponse.status}`,
          opts,
          translatedResponse
        );
      }
      return translatedResponse;
    } catch (e) {
      const err =
        e instanceof GaxiosError
          ? e
          : new GaxiosError((e as Error).message, opts, undefined, e as Error);

      const {shouldRetry, config} = await getRetryConfig(err);
      if (shouldRetry && config) {
        err.config.retryConfig!.currentRetryAttempt =
          config.retryConfig!.currentRetryAttempt;

        // The error's config could be redacted - therefore we only want to
        // copy the retry state over to the existing config
        opts.retryConfig = err.config?.retryConfig;

        return this._request<T>(opts);
      }
      throw err;
    }
  }

  private async getResponseData(
    opts: GaxiosOptions,
    res: FetchResponse
  ): Promise<any> {
    switch (opts.responseType) {
      case 'stream':
        return res.body;
      case 'json': {
        let data = await res.text();
        try {
          data = JSON.parse(data);
        } catch {
          // continue
        }
        return data as {};
      }
      case 'arraybuffer':
        return res.arrayBuffer();
      case 'blob':
        return res.blob();
      case 'text':
        return res.text();
      default:
        return this.getResponseDataFromContentType(res);
    }
  }

  #urlMayUseProxy(
    url: string | URL,
    noProxy: GaxiosOptions['noProxy'] = []
  ): boolean {
    const candidate = new URL(url);
    const noProxyList = [...noProxy];
    const noProxyEnvList =
      (process.env.NO_PROXY ?? process.env.no_proxy)?.split(',') || [];

    for (const rule of noProxyEnvList) {
      noProxyList.push(rule.trim());
    }

    for (const rule of noProxyList) {
      // Match regex
      if (rule instanceof RegExp) {
        if (rule.test(candidate.toString())) {
          return false;
        }
      }
      // Match URL
      else if (rule instanceof URL) {
        if (rule.origin === candidate.origin) {
          return false;
        }
      }
      // Match string regex
      else if (rule.startsWith('*.') || rule.startsWith('.')) {
        const cleanedRule = rule.replace(/^\*\./, '.');
        if (candidate.hostname.endsWith(cleanedRule)) {
          return false;
        }
      }
      // Basic string match
      else if (
        rule === candidate.origin ||
        rule === candidate.hostname ||
        rule === candidate.href
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Applies the interceptors. The request interceptors are applied after the
   * call to prepareRequest is completed. The response interceptors are applied after the call
   * to translateResponse.
   *
   * @param {T} optionsOrResponse The current set of options or the translated response.
   *
   * @returns {Promise<T>} Promise that resolves to the set of options or response after interceptors are applied.
   */
  async #applyInterceptors<
    T extends
      | GaxiosOptions
      | GaxiosResponse
      | Promise<GaxiosOptions | GaxiosResponse>,
  >(
    optionsOrResponse: T,
    type: GaxiosInterceptorType = GaxiosInterceptorType.Request
  ): Promise<T> {
    let promiseChain = Promise.resolve(optionsOrResponse) as Promise<T>;

    if (type === GaxiosInterceptorType.Request) {
      for (const interceptor of this.interceptors.request) {
        if (interceptor) {
          promiseChain = promiseChain.then(
            interceptor.resolved as unknown as (opts: T) => Promise<T>,
            interceptor.rejected
          ) as Promise<T>;
        }
      }
    } else {
      for (const interceptor of this.interceptors.response) {
        if (interceptor) {
          promiseChain = promiseChain.then(
            interceptor.resolved as unknown as (resp: T) => Promise<T>,
            interceptor.rejected
          ) as Promise<T>;
        }
      }
    }

    return promiseChain;
  }

  /**
   * Validates the options, merges them with defaults, and prepare request.
   *
   * @param options The original options passed from the client.
   * @returns Prepared options, ready to make a request
   */
  async #prepareRequest(options: GaxiosOptions): Promise<GaxiosOptions> {
    const opts = extend(true, {}, this.defaults, options);
    if (!opts.url) {
      throw new Error('URL is required.');
    }

    // baseUrl has been deprecated, remove in 2.0
    const baseUrl = opts.baseUrl || opts.baseURL;
    if (baseUrl) {
      opts.url = baseUrl.toString() + opts.url;
    }

    opts.paramsSerializer = opts.paramsSerializer || this.paramsSerializer;
    if (opts.params && Object.keys(opts.params).length > 0) {
      let additionalQueryParams = opts.paramsSerializer(opts.params);
      if (additionalQueryParams.startsWith('?')) {
        additionalQueryParams = additionalQueryParams.slice(1);
      }
      const prefix = opts.url.toString().includes('?') ? '&' : '?';
      opts.url = opts.url + prefix + additionalQueryParams;
    }

    if (typeof options.maxContentLength === 'number') {
      opts.size = options.maxContentLength;
    }

    if (typeof options.maxRedirects === 'number') {
      opts.follow = options.maxRedirects;
    }

    opts.headers = opts.headers || {};
    if (opts.multipart === undefined && opts.data) {
      const isFormData =
        typeof FormData === 'undefined'
          ? false
          : opts?.data instanceof FormData;
      if (isStream.readable(opts.data)) {
        opts.body = opts.data;
      } else if (hasBuffer() && Buffer.isBuffer(opts.data)) {
        // Do not attempt to JSON.stringify() a Buffer:
        opts.body = opts.data;
        if (!hasHeader(opts, 'Content-Type')) {
          opts.headers['Content-Type'] = 'application/json';
        }
      } else if (typeof opts.data === 'object') {
        // If www-form-urlencoded content type has been set, but data is
        // provided as an object, serialize the content using querystring:
        if (!isFormData) {
          if (
            getHeader(opts, 'content-type') ===
            'application/x-www-form-urlencoded'
          ) {
            opts.body = opts.paramsSerializer(opts.data);
          } else {
            // } else if (!(opts.data instanceof FormData)) {
            if (!hasHeader(opts, 'Content-Type')) {
              opts.headers['Content-Type'] = 'application/json';
            }
            opts.body = JSON.stringify(opts.data);
          }
        }
      } else {
        opts.body = opts.data;
      }
    } else if (opts.multipart && opts.multipart.length > 0) {
      // note: once the minimum version reaches Node 16,
      // this can be replaced with randomUUID() function from crypto
      // and the dependency on UUID removed
      const boundary = v4();
      opts.headers['Content-Type'] = `multipart/related; boundary=${boundary}`;
      const bodyStream = new PassThrough();
      opts.body = bodyStream;
      pipeline(
        this.getMultipartRequest(opts.multipart, boundary),
        bodyStream,
        () => {}
      );
    }

    opts.validateStatus = opts.validateStatus || this.validateStatus;
    opts.responseType = opts.responseType || 'unknown';
    if (!opts.headers['Accept'] && opts.responseType === 'json') {
      opts.headers['Accept'] = 'application/json';
    }
    opts.method = opts.method || 'GET';

    const proxy =
      opts.proxy ||
      process?.env?.HTTPS_PROXY ||
      process?.env?.https_proxy ||
      process?.env?.HTTP_PROXY ||
      process?.env?.http_proxy;
    const urlMayUseProxy = this.#urlMayUseProxy(opts.url, opts.noProxy);

    if (opts.agent) {
      // don't do any of the following options - use the user-provided agent.
    } else if (proxy && urlMayUseProxy) {
      const HttpsProxyAgent = await Gaxios.#getProxyAgent();

      if (this.agentCache.has(proxy)) {
        opts.agent = this.agentCache.get(proxy);
      } else {
        opts.agent = new HttpsProxyAgent(proxy, {
          cert: opts.cert,
          key: opts.key,
        });

        this.agentCache.set(proxy, opts.agent);
      }
    } else if (opts.cert && opts.key) {
      // Configure client for mTLS
      if (this.agentCache.has(opts.key)) {
        opts.agent = this.agentCache.get(opts.key);
      } else {
        opts.agent = new HTTPSAgent({
          cert: opts.cert,
          key: opts.key,
        });
        this.agentCache.set(opts.key, opts.agent);
      }
    }

    if (
      typeof opts.errorRedactor !== 'function' &&
      opts.errorRedactor !== false
    ) {
      opts.errorRedactor = defaultErrorRedactor;
    }

    return opts;
  }

  /**
   * By default, throw for any non-2xx status code
   * @param status status code from the HTTP response
   */
  private validateStatus(status: number) {
    return status >= 200 && status < 300;
  }

  /**
   * Encode a set of key/value pars into a querystring format (?foo=bar&baz=boo)
   * @param params key value pars to encode
   */
  private paramsSerializer(params: {[index: string]: string | number}) {
    return qs.stringify(params);
  }

  private translateResponse<T>(
    opts: GaxiosOptions,
    res: FetchResponse,
    data?: T
  ): GaxiosResponse<T> {
    // headers need to be converted from a map to an obj
    const headers = {} as Headers;
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      config: opts,
      data: data as T,
      headers,
      status: res.status,
      statusText: res.statusText,

      // XMLHttpRequestLike
      request: {
        responseURL: res.url,
      },
    };
  }

  /**
   * Attempts to parse a response by looking at the Content-Type header.
   * @param {FetchResponse} response the HTTP response.
   * @returns {Promise<any>} a promise that resolves to the response data.
   */
  private async getResponseDataFromContentType(
    response: FetchResponse
  ): Promise<any> {
    let contentType = response.headers.get('Content-Type');
    if (contentType === null) {
      // Maintain existing functionality by calling text()
      return response.text();
    }
    contentType = contentType.toLowerCase();
    if (contentType.includes('application/json')) {
      let data = await response.text();
      try {
        data = JSON.parse(data);
      } catch {
        // continue
      }
      return data as {};
    } else if (contentType.match(/^text\//)) {
      return response.text();
    } else {
      // If the content type is something not easily handled, just return the raw data (blob)
      return response.blob();
    }
  }

  /**
   * Creates an async generator that yields the pieces of a multipart/related request body.
   * This implementation follows the spec: https://www.ietf.org/rfc/rfc2387.txt. However, recursive
   * multipart/related requests are not currently supported.
   *
   * @param {GaxioMultipartOptions[]} multipartOptions the pieces to turn into a multipart/related body.
   * @param {string} boundary the boundary string to be placed between each part.
   */
  private async *getMultipartRequest(
    multipartOptions: GaxiosMultipartOptions[],
    boundary: string
  ) {
    const finale = `--${boundary}--`;
    for (const currentPart of multipartOptions) {
      const partContentType =
        currentPart.headers['Content-Type'] || 'application/octet-stream';
      const preamble = `--${boundary}\r\nContent-Type: ${partContentType}\r\n\r\n`;
      yield preamble;
      if (typeof currentPart.content === 'string') {
        yield currentPart.content;
      } else {
        yield* currentPart.content;
      }
      yield '\r\n';
    }
    yield finale;
  }

  /**
   * A cache for the lazily-loaded proxy agent.
   *
   * Should use {@link Gaxios[#getProxyAgent]} to retrieve.
   */
  // using `import` to dynamically import the types here
  static #proxyAgent?: typeof import('https-proxy-agent').HttpsProxyAgent;

  /**
   * Imports, caches, and returns a proxy agent - if not already imported
   *
   * @returns A proxy agent
   */
  static async #getProxyAgent() {
    this.#proxyAgent ||= (await import('https-proxy-agent')).HttpsProxyAgent;

    return this.#proxyAgent;
  }
}

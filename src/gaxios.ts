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
  GaxiosError,
  GaxiosOptions,
  GaxiosPromise,
  GaxiosResponse,
  Headers,
} from './common';
import {getRetryConfig} from './retry';

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

let HttpsProxyAgent: any;

function loadProxy() {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (proxy) {
    HttpsProxyAgent = require('https-proxy-agent');
  }
  return proxy;
}
loadProxy();

function skipProxy(url: string) {
  const noProxyEnv = process.env.NO_PROXY ?? process.env.no_proxy;
  if (!noProxyEnv) {
    return false;
  }
  const noProxyUrls = noProxyEnv.split(',');
  const parsedURL = new URL(url);
  return !!noProxyUrls.find(url => {
    if (url.startsWith('*.') || url.startsWith('.')) {
      url = url.replace(/^\*\./, '.');
      return parsedURL.hostname.endsWith(url);
    } else {
      return url === parsedURL.origin || url === parsedURL.hostname;
    }
  });
}

// Figure out if we should be using a proxy. Only if it's required, load
// the https-proxy-agent module as it adds startup cost.
function getProxy(url: string) {
  // If there is a match between the no_proxy env variables and the url, then do not proxy
  if (skipProxy(url)) {
    return undefined;
    // If there is not a match between the no_proxy env variables and the url, check to see if there should be a proxy
  } else {
    return loadProxy();
  }
}

export class Gaxios {
  protected agentCache = new Map<string, Agent | ((parsedUrl: URL) => Agent)>();

  /**
   * Default HTTP options that will be used for every HTTP request.
   */
  defaults: GaxiosOptions;

  /**
   * The Gaxios class is responsible for making HTTP requests.
   * @param defaults The default set of options to be used for this instance.
   */
  constructor(defaults?: GaxiosOptions) {
    this.defaults = defaults || {};
  }

  /**
   * Perform an HTTP request with the given options.
   * @param opts Set of HTTP options that will be used for this HTTP request.
   */
  async request<T = any>(opts: GaxiosOptions = {}): GaxiosPromise<T> {
    opts = this.validateOpts(opts);
    return this._request(opts);
  }

  private async _defaultAdapter<T>(
    opts: GaxiosOptions
  ): Promise<GaxiosResponse<T>> {
    const fetchImpl = opts.fetchImplementation || fetch;
    const res = (await fetchImpl(opts.url!, opts)) as FetchResponse;
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
        throw new GaxiosError<T>(
          `Request failed with status code ${translatedResponse.status}`,
          opts,
          translatedResponse
        );
      }
      return translatedResponse;
    } catch (e) {
      const err = e as GaxiosError;
      err.config = opts;
      const {shouldRetry, config} = await getRetryConfig(e);
      if (shouldRetry && config) {
        err.config.retryConfig!.currentRetryAttempt =
          config.retryConfig!.currentRetryAttempt;
        return this._request<T>(err.config);
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
      default:
        return res.text();
    }
  }

  /**
   * Validates the options, and merges them with defaults.
   * @param opts The original options passed from the client.
   */
  private validateOpts(options: GaxiosOptions): GaxiosOptions {
    const opts = extend(true, {}, this.defaults, options);
    if (!opts.url) {
      throw new Error('URL is required.');
    }

    // baseUrl has been deprecated, remove in 2.0
    const baseUrl = opts.baseUrl || opts.baseURL;
    if (baseUrl) {
      opts.url = baseUrl + opts.url;
    }

    opts.paramsSerializer = opts.paramsSerializer || this.paramsSerializer;
    if (opts.params && Object.keys(opts.params).length > 0) {
      let additionalQueryParams = opts.paramsSerializer(opts.params);
      if (additionalQueryParams.startsWith('?')) {
        additionalQueryParams = additionalQueryParams.slice(1);
      }
      const prefix = opts.url.includes('?') ? '&' : '?';
      opts.url = opts.url + prefix + additionalQueryParams;
    }

    if (typeof options.maxContentLength === 'number') {
      opts.size = options.maxContentLength;
    }

    if (typeof options.maxRedirects === 'number') {
      opts.follow = options.maxRedirects;
    }

    opts.headers = opts.headers || {};
    if (opts.data) {
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
        if (
          getHeader(opts, 'content-type') ===
          'application/x-www-form-urlencoded'
        ) {
          opts.body = opts.paramsSerializer(opts.data);
        } else {
          if (!hasHeader(opts, 'Content-Type')) {
            opts.headers['Content-Type'] = 'application/json';
          }
          opts.body = JSON.stringify(opts.data);
        }
      } else {
        opts.body = opts.data;
      }
    }

    opts.validateStatus = opts.validateStatus || this.validateStatus;
    opts.responseType = opts.responseType || 'json';
    if (!opts.headers['Accept'] && opts.responseType === 'json') {
      opts.headers['Accept'] = 'application/json';
    }
    opts.method = opts.method || 'GET';

    const proxy = getProxy(opts.url);
    if (proxy) {
      if (this.agentCache.has(proxy)) {
        opts.agent = this.agentCache.get(proxy);
      } else {
        // Proxy is being used in conjunction with mTLS.
        if (opts.cert && opts.key) {
          const parsedURL = new URL(proxy);
          opts.agent = new HttpsProxyAgent({
            port: parsedURL.port,
            host: parsedURL.host,
            protocol: parsedURL.protocol,
            cert: opts.cert,
            key: opts.key,
          });
        } else {
          opts.agent = new HttpsProxyAgent(proxy);
        }
        this.agentCache.set(proxy, opts.agent!);
      }
    } else if (opts.cert && opts.key) {
      // Configure client for mTLS:
      if (this.agentCache.has(opts.key)) {
        opts.agent = this.agentCache.get(opts.key);
      } else {
        opts.agent = new HTTPSAgent({
          cert: opts.cert,
          key: opts.key,
        });
        this.agentCache.set(opts.key, opts.agent!);
      }
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
}

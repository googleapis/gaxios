// Copyright 2018, Google, LLC.
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
import nodeFetch, {Response as NodeFetchResponse} from 'node-fetch';
import qs from 'querystring';
import stream from 'stream';
import isStream from 'is-stream';
import url from 'url';

import {
  GaxiosError,
  GaxiosOptions,
  GaxiosPromise,
  GaxiosResponse,
  Headers,
} from './common';
import {getRetryConfig} from './retry';

// tslint:disable no-any

const URL = hasURL() ? window.URL : url.URL;
const fetch = hasFetch() ? window.fetch : nodeFetch;

function hasWindow() {
  return typeof window !== 'undefined' && !!window;
}

function hasURL() {
  return hasWindow() && !!window.URL;
}

function hasFetch() {
  return hasWindow() && !!window.fetch;
}

// tslint:disable-next-line variable-name
let HttpsProxyAgent: any;

// Figure out if we should be using a proxy. Only if it's required, load
// the https-proxy-agent module as it adds startup cost.
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

export class Gaxios {
  private agentCache = new Map<
    string,
    Agent | ((parsedUrl: url.URL) => Agent)
  >();

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

  /**
   * Internal, retryable version of the `request` method.
   * @param opts Set of HTTP options that will be used for this HTTP request.
   */
  private async _request<T = any>(opts: GaxiosOptions = {}): GaxiosPromise<T> {
    try {
      let translatedResponse: GaxiosResponse<T>;
      if (opts.adapter) {
        translatedResponse = await opts.adapter<T>(opts);
      } else {
        const res = await fetch(opts.url!, opts);
        const data = await this.getResponseData(opts, res);
        translatedResponse = this.translateResponse<T>(opts, res, data);
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
        err.config.retryConfig!.currentRetryAttempt = config.retryConfig!.currentRetryAttempt;
        return this._request<T>(err.config);
      }
      throw err;
    }
  }

  private async getResponseData(
    opts: GaxiosOptions,
    res: Response | NodeFetchResponse
  ): Promise<any> {
    switch (opts.responseType) {
      case 'stream':
        return res.body;
      case 'json':
        let data = await res.text();
        try {
          data = JSON.parse(data);
        } catch (e) {}
        return data as {};
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

    const parsedUrl = new URL(opts.url);
    opts.url = `${parsedUrl.origin}${parsedUrl.pathname}`;
    opts.params = extend(
      qs.parse(parsedUrl.search.substr(1)), // removes leading ?
      opts.params
    );

    opts.paramsSerializer = opts.paramsSerializer || this.paramsSerializer;
    if (opts.params) {
      parsedUrl.search = opts.paramsSerializer(opts.params);
    }

    opts.url = parsedUrl.href;

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
      } else if (typeof opts.data === 'object') {
        opts.body = JSON.stringify(opts.data);
        opts.headers['Content-Type'] = 'application/json';
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

    const proxy = loadProxy();
    if (proxy) {
      if (this.agentCache.has(proxy)) {
        opts.agent = this.agentCache.get(proxy);
      } else {
        opts.agent = new HttpsProxyAgent(proxy);
        this.agentCache.set(proxy, opts.agent!);
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
    res: Response | NodeFetchResponse,
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
    };
  }
}

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

import * as extend from 'extend';
import {Agent} from 'https';
import fetch, {Response} from 'node-fetch';
import * as qs from 'querystring';
import {URL} from 'url';

import {GaxiosError, GaxiosOptions, GaxiosPromise, GaxiosResponse, Headers} from './common';
import {getRetryConfig} from './retry';

// tslint:disable-next-line variable-name
const HttpsProxyAgent = require('https-proxy-agent');

export class Gaxios {
  private agentCache = new Map<string, Agent>();

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
  async request<T = any>(opts: GaxiosOptions): GaxiosPromise<T> {
    opts = this.validateOpts(opts);
    try {
      const res = await fetch(opts.url!, opts);
      const data = await this.getResponseData(opts, res);
      const translatedResponse = this.translateResponse(opts, res, data);
      if (!opts.validateStatus!(res.status)) {
        throw new GaxiosError<T>(
            `Request failed with status code ${res.status}`, opts,
            translatedResponse);
      }
      return this.translateResponse(opts, res, data);
    } catch (e) {
      const err = e as GaxiosError;
      err.config = opts;
      const {shouldRetry, config} = await getRetryConfig(e);
      if (shouldRetry && config) {
        err.config.retryConfig!.currentRetryAttempt =
            config.retryConfig!.currentRetryAttempt;
        return this.request<T>(err.config);
      }
      throw err;
    }
  }

  private async getResponseData(opts: GaxiosOptions, res: Response) {
    if (res.ok) {
      if (opts.responseType === 'stream') {
        return res.body;
      }
      if (res.size > 0) {
        switch (opts.responseType) {
          case 'json':
            return res.json();
          case 'text':
            return res.text();
          case 'arraybuffer':
            return res.arrayBuffer();
          case 'blob':
            return res.blob();
          default:
            throw new Error('Invalid responseType.');
        }
      }
    }
    try {
      if (res.headers.get('content-type') === 'application/json') {
        return res.json();
      } else {
        return res.text();
      }
    } catch {
    }
  }

  /**
   * Validate the options, and massage them to match the
   * fetch format.
   * @param opts The original options passed from the client.
   */
  private validateOpts(options: GaxiosOptions): GaxiosOptions {
    const opts = extend(true, {}, this.defaults, options);
    if (!opts.url) {
      throw new Error('URL is required.');
    }

    opts.headers = opts.headers || {};
    if (opts.data) {
      opts.body = JSON.stringify(opts.data);
      opts.headers['Content-Type'] = 'application/json';
      delete opts.data;
    }

    opts.validateStatus = opts.validateStatus || this.validateStatus;
    opts.responseType = opts.responseType || 'json';
    if (!opts.headers['Accept'] && opts.responseType === 'json') {
      opts.headers['Accept'] = 'application/json';
    }
    opts.method = opts.method || 'GET';

    if (opts.params) {
      const parts = new URL(opts.url);
      parts.search = qs.stringify(opts.params);
      opts.url = parts.href;
    }

    if (process.env.http_proxy || process.env.https_proxy) {
      const proxy = (process.env.http_proxy || process.env.https_proxy)!;
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

  private translateResponse<T>(opts: GaxiosOptions, res: Response, data?: T):
      GaxiosResponse<T> {
    // headers need to be converted from a map to an obj
    const headers = {} as Headers;
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {config: opts, data: data as T, headers, status: res.status};
  }
}
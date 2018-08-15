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

'use strict';

import fetch, {Response} from 'node-fetch';
import * as qs from 'qs';
import * as extend from 'extend';
import {URL} from 'url';
import {Agent} from 'https';
import {GetchOptions, GetchPromise, GetchError, GetchResponse, Headers, RetryConfig} from './common';
import {getRetryConfig} from './retry';
// tslint:disable-next-line variable-name
const HttpsProxyAgent = require('https-proxy-agent');

export {
  GetchOptions,
  GetchPromise,
  GetchError,
  GetchResponse,
  Headers,
  RetryConfig
};

export let defaults: GetchOptions = {
  method: 'GET',
  responseType: 'json'
};

export async function getch<T = any>(opts: GetchOptions): GetchPromise<T> {
  opts = validateOpts(opts);
  try {
    const res = await fetch(opts.url!, opts);
    let data: any;
    if (res.ok) {
      switch (opts.responseType) {
        case 'json':
          data = await res.json();
          break;
        case 'text':
          data = await res.text();
          break;
        case 'stream':
          data = res.body;
          break;
        default:
          throw new Error('Invalid responseType.');
      }
    } else {
      try {
        if (res.headers.get('content-type') === 'application/json') {
          data = await res.json();
        } else {
          data = await res.text();
        }
      } catch {
      }
    }
    const translatedResponse = translateResponse(opts, res, data);
    if (!opts.validateStatus!(res.status)) {
      throw new GetchError<T>(data, opts, translatedResponse);
    }
    return translateResponse(opts, res, data);
  } catch (e) {
    const err = e as GetchError;
    err.config = opts;
    const {shouldRetry, config} = await getRetryConfig(e);
    if (shouldRetry && config) {
      err.config.retryConfig!.currentRetryAttempt =
          config.retryConfig!.currentRetryAttempt;
      return getch<T>(err.config);
    }
    throw err;
  }
}

const agentCache = new Map<string, Agent>();

/**
 * Validate the options, and massage them to match the
 * fetch format.
 * @param opts The original options passed from the client.
 */
function validateOpts(opts: GetchOptions): GetchOptions {
  opts = extend({}, defaults, opts);
  if (!opts.url) {
    throw new Error('URL is required.');
  }
  opts.body = opts.data;
  opts.validateStatus = opts.validateStatus || validateStatus;
  opts.responseType = opts.responseType || 'json';

  if (opts.params) {
    const parts = new URL(opts.url);
    parts.search = qs.stringify(opts.params);
    opts.url = parts.href;
  }

  if (process.env.http_proxy || process.env.https_proxy) {
    const proxy = (process.env.http_proxy || process.env.https_proxy)!;
    if (agentCache.has(proxy)) {
      opts.agent = agentCache.get(proxy);
    } else {
      opts.agent = new HttpsProxyAgent(proxy);
      agentCache.set(proxy, opts.agent!);
    }
  }
  return opts;
}

/**
 * By default, throw for any non-2xx status code
 * @param status status code from the HTTP response
 */
function validateStatus(status: number) {
  return status >= 200 && status < 300;
}

function translateResponse<T>(
    opts: GetchOptions, res: Response, data?: T): GetchResponse<T> {
  // headers need to be converted from a map to an obj
  const headers = {} as Headers;
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {config: opts, data: data as T, headers, status: res.status};
}

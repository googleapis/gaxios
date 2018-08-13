// Copyright 2016, Google, Inc.
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
import {URL} from 'url';

export type Headers = {
  [index: string]: any
};
export type GetchPromise<T = any> = Promise<GetchResponse<T>>;

export interface GetchResponse<T = any> {
  config: GetchOptions;
  data: T;
  status: number;
  headers: Headers;
}

export class GetchError<T = any> extends Error {
  code?: string;
  response?: GetchResponse<T>;
  constructor(message: string, response: GetchResponse<T>) {
    super(message);
    this.response = response;
    this.code = response.status.toString();
  }
}

export interface GetchOptions {
  url?: string;
  method?: 'GET'|'HEAD'|'POST'|'DELETE'|'PUT';
  headers?: {[index: string]: string};
  data?: any;
  body?: any;
  params?: any;
  timeout?: number;
  validateStatus?: (status: number) => boolean;
}

export async function getch<T = any>(opts: GetchOptions): GetchPromise<T> {
  validateOpts(opts);
  const res = await fetch(opts.url!, opts);
  if (!opts.validateStatus!(res.status)) {
    throw new GetchError('Request failed.', translateResponse(opts, res));
  }
  const data = await res.json();
  return translateResponse(opts, res, data);
}

function validateOpts(opts: GetchOptions): void {
  if (!opts.url) {
    throw new Error('URL is required.');
  }
  opts.body = opts.data;
  opts.validateStatus = opts.validateStatus || validateStatus;
  if (opts.params) {
    const parts = new URL(opts.url);
    parts.search = qs.stringify(opts.params);
    opts.url = parts.href;
  }
}

function validateStatus(status: number) {
  return status >= 200 && status < 300;
}

function translateResponse<T>(
    opts: GetchOptions, res: Response, data?: T): GetchResponse<T> {
  return {
    config: opts,
    data: data as T,
    headers: res.headers,
    status: res.status,
  };
}

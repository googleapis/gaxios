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

/* eslint-disable @typescript-eslint/no-explicit-any */

export class GaxiosError<T = any> extends Error {
  code?: string;
  response?: GaxiosResponse<T>;
  config: GaxiosOptions;
  constructor(
    message: string,
    options: GaxiosOptions,
    response: GaxiosResponse<T>
  ) {
    super(message);
    this.response = response;
    this.config = options;
    this.code = response.status.toString();
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
  url?: string;
  baseUrl?: string; // deprecated
  baseURL?: string;
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
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' | 'stream';
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
}

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

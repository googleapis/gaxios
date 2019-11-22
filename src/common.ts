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

import {AbortSignal} from 'abort-controller';
import {Agent} from 'http';
import {URL} from 'url';

// tslint:disable no-any

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

export interface GaxiosResponse<T = any> {
  config: GaxiosOptions;
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
}

/**
 * Request options that are used to form the request.
 */
export interface GaxiosOptions {
  /**
   * Optional method to override making the actual HTTP request. Useful
   * for writing tests.
   */
  adapter?: <T = any>(options: GaxiosOptions) => GaxiosPromise<T>;
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
  onUploadProgress?: (progressEvent: any) => void;
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' | 'stream';
  agent?: Agent | ((parsedUrl: URL) => Agent);
  validateStatus?: (status: number) => boolean;
  retryConfig?: RetryConfig;
  retry?: boolean;
  signal?: AbortSignal;
  size?: number;
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
   * The amount of time to initially delay the retry.  Defaults to 100.
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
  onRetryAttempt?: (err: GaxiosError) => void;

  /**
   * Function to invoke which determines if you should retry
   */
  shouldRetry?: (err: GaxiosError) => boolean;

  /**
   * When there is no response, the number of retries to attempt. Defaults to 2.
   */
  noResponseRetries?: number;
}

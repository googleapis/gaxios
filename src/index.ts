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

import {Getch} from './getch';
import {GetchOptions} from './common';

export {Getch, GetchOptions};
export {GetchError, GetchPromise, GetchResponse, Headers, RetryConfig} from './common';

/**
 * The default instance used when the `getch` method is directly
 * invoked.
 */
export const instance = new Getch();

/**
 * Make an HTTP request using the given options.
 * @param opts Options for the request
 */
export async function getch<T>(opts: GetchOptions) {
  return instance.getch<T>(opts);
}

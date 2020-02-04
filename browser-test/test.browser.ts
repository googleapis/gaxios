// Copyright 2019 Google, LLC
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

import assert from 'assert';
import {describe, it} from 'mocha';
import {request} from '../src/index';
const port = 7172; // should match the port defined in `webserver.ts`

describe('💻 browser tests', () => {
  it('should just work from browser', async () => {
    const result = await request({url: `http://localhost:${port}/path`});
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data, 'response');
  });

  it('should pass querystring parameters from browser', async () => {
    const result = await request({
      url: `http://localhost:${port}/querystring`,
      params: {query: 'value'},
    });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data, 'value');
  });
});

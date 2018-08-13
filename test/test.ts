/**
 * Copyright 2018 Google LLC
 *
 * Distributed under MIT license.
 * See file LICENSE for detail or copy at https://opensource.org/licenses/MIT
 */

'use strict';

import {getch} from '../src';
import * as nock from 'nock';
import * as assert from 'assert';
const assertRejects = require('assert-rejects');

nock.disableNetConnect();

const url = 'https://example.com';

it('should throw an error if a url is not provided', () => {
  assertRejects(getch({}), /URL is required/);
});

it('should encode query string parameters', async () => {
  const opts = {url, params: {james: 'kirk', montgomery: 'scott'}};
  const path = '/?james=kirk&montgomery=scott';
  const scope = nock(url).get(path).reply(200, {});
  const res = await getch(opts);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.config.url, url + path);
  scope.done();
});

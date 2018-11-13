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

import * as assert from 'assert';
import * as nock from 'nock';
import * as stream from 'stream';

import {Gaxios, GaxiosError, request} from '../src';

const assertRejects = require('assert-rejects');

nock.disableNetConnect();

afterEach(() => {
  nock.cleanAll();
});

const url = 'https://example.com';

describe('🦖 option validation', () => {
  it('should throw an error if a url is not provided', () => {
    assertRejects(request({}), /URL is required/);
  });
});

describe('🚙 error handling', () => {
  it('should throw on non-2xx responses by default', async () => {
    const scope = nock(url).get('/').reply(500);
    await assertRejects(request({url}), (err: GaxiosError) => {
      scope.done();
      return err.code === '500';
    });
  });
});

describe('🥁 configuration options', () => {
  it('should use options passed into the constructor', async () => {
    const scope = nock(url).head('/').reply(200);
    const inst = new Gaxios({method: 'HEAD'});
    const res = await inst.request({url});
    scope.done();
    assert.strictEqual(res.config.method, 'HEAD');
  });

  it('should handle nested options passed into the constructor', async () => {
    const scope = nock(url).get('/').reply(200);
    const inst = new Gaxios({headers: {apple: 'juice'}});
    const res = await inst.request({url, headers: {figgy: 'pudding'}});
    scope.done();
    assert.strictEqual(res.config.headers!.apple, 'juice');
    assert.strictEqual(res.config.headers!.figgy, 'pudding');
  });

  it('should allow overriding valid status', async () => {
    const scope = nock(url).get('/').reply(304);
    const res = await request({
      url,
      validateStatus: () => {
        return true;
      }
    });
    scope.done();
    assert.strictEqual(res.status, 304);
  });

  it('should encode query string parameters', async () => {
    const opts = {url, params: {james: 'kirk', montgomery: 'scott'}};
    const path = '/?james=kirk&montgomery=scott';
    const scope = nock(url).get(path).reply(200, {});
    const res = await request(opts);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.config.url, url + path);
    scope.done();
  });

  it('should return json by default', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url).get('/').reply(200, body);
    const res = await request({url});
    scope.done();
    assert.deepStrictEqual(body, res.data);
  });

  it('should send an application/json header by default', async () => {
    const scope =
        nock(url).matchHeader('accept', 'application/json').get('/').reply(200);
    const res = await request({url});
    scope.done();
  });

  it('should return stream if asked nicely', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url).get('/').reply(200, body);
    const res = await request<stream.Readable>({url, responseType: 'stream'});
    scope.done();
    assert(res.data instanceof stream.Readable);
  });

  it('should return text if asked nicely', async () => {
    const body = 'hello 🌎';
    const scope = nock(url).get('/').reply(200, body);
    const res = await request<string>({url, responseType: 'text'});
    scope.done();
    assert.strictEqual(res.data, body);
  });
});

describe('🍂 defaults & instances', () => {
  it('should allow creating a new instance', () => {
    const requestInstance = new Gaxios();
    assert.equal(typeof requestInstance.request, 'function');
  });
});

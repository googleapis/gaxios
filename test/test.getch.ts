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

import assert from 'assert';
import nock from 'nock';
import sinon from 'sinon';
import stream from 'stream';
const assertRejects = require('assert-rejects');
// tslint:disable-next-line variable-name
const HttpsProxyAgent = require('https-proxy-agent');
import {
  Gaxios,
  GaxiosError,
  request,
  GaxiosOptions,
  GaxiosResponse,
} from '../src';
import qs from 'querystring';
import fs from 'fs';
import {Blob} from 'node-fetch';

nock.disableNetConnect();

const sandbox = sinon.createSandbox();
afterEach(() => {
  sandbox.restore();
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
    const scope = nock(url)
      .get('/')
      .reply(500);
    await assertRejects(request({url}), (err: GaxiosError) => {
      scope.done();
      return err.code === '500';
    });
  });
});

describe('🥁 configuration options', () => {
  it('should use options passed into the constructor', async () => {
    const scope = nock(url)
      .head('/')
      .reply(200);
    const inst = new Gaxios({method: 'HEAD'});
    const res = await inst.request({url});
    scope.done();
    assert.strictEqual(res.config.method, 'HEAD');
  });

  it('should handle nested options passed into the constructor', async () => {
    const scope = nock(url)
      .get('/')
      .reply(200);
    const inst = new Gaxios({headers: {apple: 'juice'}});
    const res = await inst.request({url, headers: {figgy: 'pudding'}});
    scope.done();
    assert.strictEqual(res.config.headers!.apple, 'juice');
    assert.strictEqual(res.config.headers!.figgy, 'pudding');
  });

  it('should allow setting a base url in the options', async () => {
    const scope = nock(url)
      .get('/v1/mango')
      .reply(200, {});
    const inst = new Gaxios({baseURL: `${url}/v1`});
    const res = await inst.request({url: '/mango'});
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  it('should allow overriding valid status', async () => {
    const scope = nock(url)
      .get('/')
      .reply(304);
    const res = await request({url, validateStatus: () => true});
    scope.done();
    assert.strictEqual(res.status, 304);
  });

  it('should allow setting maxContentLength', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .get('/')
      .reply(200, body);
    const maxContentLength = 1;
    await assertRejects(request({url, maxContentLength}), /over limit/);
    scope.done();
  });

  it('should support redirects by default', async () => {
    const body = {hello: '🌎'};
    const scopes = [
      nock(url)
        .get('/foo')
        .reply(200, body),
      nock(url)
        .get('/')
        .reply(302, undefined, {location: '/foo'}),
    ];
    const res = await request({url});
    scopes.forEach(x => x.done());
    assert.deepStrictEqual(res.data, body);
  });

  it('should support disabling redirects', async () => {
    const scope = nock(url)
      .get('/')
      .reply(302, undefined, {location: '/foo'});
    const maxRedirects = 0;
    await assertRejects(request({url, maxRedirects}), /maximum redirect/);
    scope.done();
  });

  it('should allow overriding the adapter', async () => {
    const response: GaxiosResponse = {
      data: {hello: '🌎'},
      config: {},
      status: 200,
      statusText: 'OK',
      headers: {},
    };
    const adapter = (options: GaxiosOptions) => {
      return Promise.resolve(response);
    };
    const res = await request({url, adapter});
    assert.strictEqual(response, res);
  });

  it('should encode URL parameters', async () => {
    const path = '/?james=kirk&montgomery=scott';
    const opts = {url: `${url}${path}`};
    const scope = nock(url)
      .get(path)
      .reply(200, {});
    const res = await request(opts);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.config.url, url + path);
    scope.done();
  });

  it('should encode parameters from the params option', async () => {
    const opts = {url, params: {james: 'kirk', montgomery: 'scott'}};
    const path = '/?james=kirk&montgomery=scott';
    const scope = nock(url)
      .get(path)
      .reply(200, {});
    const res = await request(opts);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.config.url, url + path);
    scope.done();
  });

  it('should merge URL parameters with the params option', async () => {
    const opts = {
      url: `${url}/?james=beckwith&montgomery=scott`,
      params: {james: 'kirk'},
    };
    const path = '/?james=kirk&montgomery=scott';
    const scope = nock(url)
      .get(path)
      .reply(200, {});
    const res = await request(opts);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.config.url, url + path);
    scope.done();
  });

  it('should allow overriding the param serializer', async () => {
    const qs = '?oh=HAI';
    const params = {james: 'kirk'};
    const opts: GaxiosOptions = {
      url,
      params,
      paramsSerializer: ps => {
        assert.strictEqual(JSON.stringify(params), JSON.stringify(ps));
        return '?oh=HAI';
      },
    };
    const scope = nock(url)
      .get(`/${qs}`)
      .reply(200, {});
    const res = await request(opts);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.config.url, `${url}/${qs}`);
    scope.done();
  });

  it('should return json by default', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .get('/')
      .reply(200, body);
    const res = await request({url});
    scope.done();
    assert.deepStrictEqual(body, res.data);
  });

  it('should send an application/json header by default', async () => {
    const scope = nock(url)
      .matchHeader('accept', 'application/json')
      .get('/')
      .reply(200, {});
    const res = await request({url});
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  it('should use an https proxy if asked nicely', async () => {
    sandbox.stub(process, 'env').value({https_proxy: 'https://fake.proxy'});
    const body = {hello: '🌎'};
    const scope = nock(url)
      .get('/')
      .reply(200, body);
    const res = await request({url});
    scope.done();
    assert.deepStrictEqual(res.data, body);
    assert.ok(res.config.agent instanceof HttpsProxyAgent);
  });

  it('should load the proxy from the cache', async () => {
    sandbox.stub(process, 'env').value({HTTPS_PROXY: 'https://fake.proxy'});
    const body = {hello: '🌎'};
    const scope = nock(url)
      .get('/')
      .twice()
      .reply(200, body);
    const res1 = await request({url});
    const agent = res1.config.agent;
    const res2 = await request({url});
    assert.strictEqual(agent, res2.config.agent);
    scope.done();
  });

  it('should include the request data in the response config', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .post('/', body)
      .reply(200);
    const res = await request({url, method: 'POST', data: body});
    scope.done();
    assert.deepStrictEqual(res.config.data, body);
  });
});

describe('🎏 data handling', () => {
  it('should accpet a ReadableStream as request data', async () => {
    const body = fs.createReadStream('package.json');
    const contents = require('../../package.json');
    const scope = nock(url)
      .post('/', contents)
      .reply(200, {});
    const res = await request({url, method: 'POST', data: body});
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  it('should accept a string in the request data', async () => {
    const body = {hello: '🌎'};
    const encoded = qs.stringify(body);
    const scope = nock(url)
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .post('/', encoded)
      .reply(200, {});
    const res = await request({
      url,
      method: 'POST',
      data: encoded,
      headers: {'content-type': 'application/x-www-form-urlencoded'},
    });
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  it('should set content-type for object request', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .matchHeader('content-type', 'application/json')
      .post('/', JSON.stringify(body))
      .reply(200, {});
    const res = await request({
      url,
      method: 'POST',
      data: body,
    });
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  it('should return stream if asked nicely', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .get('/')
      .reply(200, body);
    const res = await request<stream.Readable>({url, responseType: 'stream'});
    scope.done();
    assert(res.data instanceof stream.Readable);
  });

  it('should return an ArrayBuffer if asked nicely', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .get('/')
      .reply(200, body);
    const res = await request<ArrayBuffer>({
      url,
      responseType: 'arraybuffer',
    });
    scope.done();
    assert(res.data instanceof ArrayBuffer);
    assert.deepStrictEqual(
      Buffer.from(JSON.stringify(body)),
      Buffer.from(res.data)
    );
  });

  it('should return a blob if asked nicely', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .get('/')
      .reply(200, body);
    const res = await request<Blob>({url, responseType: 'blob'});
    scope.done();
    assert.ok(res.data);
  });

  it('should return text if asked nicely', async () => {
    const body = 'hello 🌎';
    const scope = nock(url)
      .get('/')
      .reply(200, body);
    const res = await request<string>({url, responseType: 'text'});
    scope.done();
    assert.strictEqual(res.data, body);
  });

  it('should return status text', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .get('/')
      .reply(200, body);
    const res = await request({url});
    scope.done();
    assert.ok(res.data);
    assert.strictEqual(res.statusText, 'OK');
  });
});

describe('🍂 defaults & instances', () => {
  it('should allow creating a new instance', () => {
    const requestInstance = new Gaxios();
    assert.strictEqual(typeof requestInstance.request, 'function');
  });

  it('should allow passing empty options', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .get('/')
      .reply(200, body);
    const gax = new Gaxios({url});
    const res = await gax.request();
    scope.done();
    assert.deepStrictEqual(res.data, body);
  });
});

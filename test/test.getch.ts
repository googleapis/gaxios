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

import assert from 'assert';
import nock from 'nock';
import sinon from 'sinon';
import stream from 'stream';
import {describe, it, afterEach} from 'mocha';
import fetch from 'node-fetch';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HttpsProxyAgent = require('https-proxy-agent');
import {
  Gaxios,
  GaxiosError,
  request,
  GaxiosOptions,
  GaxiosResponse,
  GaxiosPromise,
} from '../src';
import qs from 'querystring';
import fs from 'fs';
import {Blob} from 'node-fetch';
global.FormData = require('form-data');

nock.disableNetConnect();

const sandbox = sinon.createSandbox();
afterEach(() => {
  sandbox.restore();
  nock.cleanAll();
});

const url = 'https://example.com';

describe('🦖 option validation', () => {
  it('should throw an error if a url is not provided', async () => {
    await assert.rejects(request({}), /URL is required/);
  });
});

describe('🚙 error handling', () => {
  it('should throw on non-2xx responses by default', async () => {
    const scope = nock(url).get('/').reply(500);
    await assert.rejects(request({url}), (err: GaxiosError) => {
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

  it('should allow setting a base url in the options', async () => {
    const scope = nock(url).get('/v1/mango').reply(200, {});
    const inst = new Gaxios({baseURL: `${url}/v1`});
    const res = await inst.request({url: '/mango'});
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  it('should allow overriding valid status', async () => {
    const scope = nock(url).get('/').reply(304);
    const res = await request({url, validateStatus: () => true});
    scope.done();
    assert.strictEqual(res.status, 304);
  });

  it('should allow setting maxContentLength', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url).get('/').reply(200, body);
    const maxContentLength = 1;
    await assert.rejects(request({url, maxContentLength}), /over limit/);
    scope.done();
  });

  it('should support redirects by default', async () => {
    const body = {hello: '🌎'};
    const scopes = [
      nock(url).get('/foo').reply(200, body),
      nock(url).get('/').reply(302, undefined, {location: '/foo'}),
    ];
    const res = await request({url});
    scopes.forEach(x => x.done());
    assert.deepStrictEqual(res.data, body);
    assert.strictEqual(res.request.responseURL, `${url}/foo`);
  });

  it('should support disabling redirects', async () => {
    const scope = nock(url).get('/').reply(302, undefined, {location: '/foo'});
    const maxRedirects = 0;
    await assert.rejects(request({url, maxRedirects}), /maximum redirect/);
    scope.done();
  });

  it('should allow overriding the adapter', async () => {
    const response: GaxiosResponse = {
      data: {hello: '🌎'},
      config: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      request: {
        responseURL: url,
      },
    };
    const adapter = () => Promise.resolve(response);
    const res = await request({url, adapter});
    assert.strictEqual(response, res);
  });

  it('should allow overriding the adapter with default adapter wrapper', async () => {
    const body = {hello: '🌎'};
    const extraProperty = '🦦';
    const scope = nock(url).get('/').reply(200, body);
    const timings: {duration: number}[] = [];
    const res = await request({
      url,
      adapter: async (opts, defaultAdapter) => {
        const begin = Date.now();
        const res = await defaultAdapter(opts);
        const end = Date.now();
        res.data = {
          ...res.data,
          extraProperty,
        };
        timings.push({duration: end - begin});
        return res;
      },
    });
    scope.done();
    assert.deepStrictEqual(res.data, {
      ...body,
      extraProperty,
    });
    assert(timings.length === 1);
    assert(typeof timings[0].duration === 'number');
  });

  it('should encode URL parameters', async () => {
    const path = '/?james=kirk&montgomery=scott';
    const opts = {url: `${url}${path}`};
    const scope = nock(url).get(path).reply(200, {});
    const res = await request(opts);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.config.url, url + path);
    scope.done();
  });

  it('should preserve the original querystring', async () => {
    const path = '/?robot';
    const opts = {url: `${url}${path}`};
    const scope = nock(url).get(path).reply(200, {});
    const res = await request(opts);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.config.url, url + path);
    scope.done();
  });

  it('should handle empty querystring params', async () => {
    const scope = nock(url).get('/').reply(200, {});
    const res = await request({
      url,
      params: {},
    });
    assert.strictEqual(res.status, 200);
    scope.done();
  });

  it('should encode parameters from the params option', async () => {
    const opts = {url, params: {james: 'kirk', montgomery: 'scott'}};
    const qs = '?james=kirk&montgomery=scott';
    const path = `/${qs}`;
    const scope = nock(url).get(path).reply(200, {});
    const res = await request(opts);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.config.url, url + qs);
    scope.done();
  });

  it('should merge URL parameters with the params option', async () => {
    const opts = {
      url: `${url}/?james=beckwith&montgomery=scott`,
      params: {james: 'kirk'},
    };
    const path = '/?james=beckwith&montgomery=scott&james=kirk';
    const scope = nock(url).get(path).reply(200, {});
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
    const scope = nock(url).get(`/${qs}`).reply(200, {});
    const res = await request(opts);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.config.url, url + qs);
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
    const scope = nock(url)
      .matchHeader('accept', 'application/json')
      .get('/')
      .reply(200, {});
    const res = await request({url});
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  describe('proxying', () => {
    it('should use an https proxy if asked nicely', async () => {
      const url = 'https://fake.proxy';
      sandbox.stub(process, 'env').value({https_proxy: 'https://fake.proxy'});
      const body = {hello: '🌎'};
      const scope = nock(url).get('/').reply(200, body);
      const res = await request({url});
      scope.done();
      assert.deepStrictEqual(res.data, body);
      assert.ok(res.config.agent instanceof HttpsProxyAgent);
    });

    it('should not proxy when url matches no_proxy', async () => {
      const url = 'https://example.com';
      sandbox.stub(process, 'env').value({
        https_proxy: 'https://fake.proxy',
        no_proxy: 'https://example.com',
      });
      const body = {hello: '🌎'};
      const scope = nock(url).get('/').reply(200, body);
      const res = await request({url});
      scope.done();
      assert.deepStrictEqual(res.data, body);
      assert.strictEqual(res.config.agent, undefined);
    });

    it('should proxy if url does not match no_proxy env variable', async () => {
      const url = 'https://example2.com';
      sandbox.stub(process, 'env').value({
        https_proxy: 'https://fake.proxy',
        no_proxy: 'https://example.com',
      });
      const body = {hello: '🌎'};
      const scope = nock(url).get('/').reply(200, body);
      const res = await request({url});
      scope.done();
      assert.deepStrictEqual(res.data, body);
      assert.ok(res.config.agent instanceof HttpsProxyAgent);
    });

    it('should not proxy if no_proxy env var matches the origin or hostname of the URL', async () => {
      const url = 'https://example2.com';
      sandbox.stub(process, 'env').value({
        https_proxy: 'https://fake.proxy',
        no_proxy: 'example2.com',
      });
      const body = {hello: '🌎'};
      const scope = nock(url).get('/').reply(200, body);
      const res = await request({url});
      scope.done();
      assert.deepStrictEqual(res.data, body);
      assert.strictEqual(res.config.agent, undefined);
    });

    it('should not proxy if no_proxy env variable has asterisk, and URL partially matches', async () => {
      const url = 'https://domain.example.com';
      sandbox.stub(process, 'env').value({
        https_proxy: 'https://fake.proxy',
        no_proxy: '*.example.com',
      });
      const body = {hello: '🌎'};
      const scope = nock(url).get('/').reply(200, body);
      const res = await request({url});
      scope.done();
      assert.deepStrictEqual(res.data, body);
      assert.strictEqual(res.config.agent, undefined);
    });

    it('should proxy if no_proxy env variable has asterisk, but URL is not matching', async () => {
      const url = 'https://domain.example2.com';
      sandbox.stub(process, 'env').value({
        https_proxy: 'https://fake.proxy',
        no_proxy: '*.example.com',
      });
      const body = {hello: '🌎'};
      const scope = nock(url).get('/').reply(200, body);
      const res = await request({url});
      scope.done();
      assert.deepStrictEqual(res.data, body);
      assert.ok(res.config.agent instanceof HttpsProxyAgent);
    });

    it('should not proxy if no_proxy env variable starts with a dot, and URL partially matches', async () => {
      const url = 'https://domain.example.com';
      sandbox.stub(process, 'env').value({
        https_proxy: 'https://fake.proxy',
        no_proxy: '.example.com',
      });
      const body = {hello: '🌎'};
      const scope = nock(url).get('/').reply(200, body);
      const res = await request({url});
      scope.done();
      assert.deepStrictEqual(res.data, body);
      assert.strictEqual(res.config.agent, undefined);
    });

    it('should allow comma-separated lists for no_proxy env variables', async () => {
      const url = 'https://api.google.com';
      sandbox.stub(process, 'env').value({
        https_proxy: 'https://fake.proxy',
        no_proxy: 'example.com,*.google.com,hello.com',
      });
      const body = {hello: '🌎'};
      const scope = nock(url).get('/').reply(200, body);
      const res = await request({url});
      scope.done();
      assert.deepStrictEqual(res.data, body);
      assert.strictEqual(res.config.agent, undefined);
    });
  });

  it('should load the proxy from the cache', async () => {
    sandbox.stub(process, 'env').value({HTTPS_PROXY: 'https://fake.proxy'});
    const body = {hello: '🌎'};
    const scope = nock(url).get('/').twice().reply(200, body);
    const res1 = await request({url});
    const agent = res1.config.agent;
    const res2 = await request({url});
    assert.deepStrictEqual(agent, res2.config.agent);
    scope.done();
  });

  it('should include the request data in the response config', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url).post('/', body).reply(200);
    const res = await request({url, method: 'POST', data: body});
    scope.done();
    assert.deepStrictEqual(res.config.data, body);
  });

  it('should not stringify the data if it is appended by a form', async () => {
    const formData = new FormData();
    formData.append('test', '123');
    // I don't think matching formdata is supported in nock, so skipping: https://github.com/nock/nock/issues/887
    const scope = nock(url).post('/').reply(200);
    const res = await request({
      url,
      method: 'POST',
      data: formData,
    });
    scope.done();
    assert.deepStrictEqual(res.config.data, formData);
    assert.ok(res.config.data instanceof FormData);
    assert.deepEqual(res.config.body, undefined);
  });

  it('should allow explicitly setting the fetch implementation to node-fetch', async () => {
    const scope = nock(url).get('/').reply(200);
    const res = await request({url, fetchImplementation: fetch});
    scope.done();
    assert.deepStrictEqual(res.status, 200);
  });
});

describe('🎏 data handling', () => {
  it('should accpet a ReadableStream as request data', async () => {
    const body = fs.createReadStream('package.json');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const contents = require('../../package.json');
    const scope = nock(url).post('/', contents).reply(200, {});
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

  it('should set application/json content-type for object request by default', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .matchHeader('Content-Type', 'application/json')
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

  it('should allow other JSON content-types to be specified', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .matchHeader('Content-Type', 'application/json-patch+json')
      .post('/', JSON.stringify(body))
      .reply(200, {});
    const res = await request({
      url,
      method: 'POST',
      data: body,
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
    });
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  it('should stringify with qs when content-type is set to application/x-www-form-urlencoded', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url)
      .matchHeader('Content-Type', 'application/x-www-form-urlencoded')
      .post('/', qs.stringify(body))
      .reply(200, {});
    const res = await request({
      url,
      method: 'POST',
      data: body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  it('should return stream if asked nicely', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url).get('/').reply(200, body);
    const res = await request<stream.Readable>({url, responseType: 'stream'});
    scope.done();
    assert(res.data instanceof stream.Readable);
  });

  it('should return an ArrayBuffer if asked nicely', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url).get('/').reply(200, body);
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
    const scope = nock(url).get('/').reply(200, body);
    const res = await request<Blob>({url, responseType: 'blob'});
    scope.done();
    assert.ok(res.data);
  });

  it('should return text if asked nicely', async () => {
    const body = 'hello 🌎';
    const scope = nock(url).get('/').reply(200, body);
    const res = await request<string>({url, responseType: 'text'});
    scope.done();
    assert.strictEqual(res.data, body);
  });

  it('should return status text', async () => {
    const body = {hello: '🌎'};
    const scope = nock(url).get('/').reply(200, body);
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
    const scope = nock(url).get('/').reply(200, body);
    const gax = new Gaxios({url});
    const res = await gax.request();
    scope.done();
    assert.deepStrictEqual(res.data, body);
  });

  it('should allow buffer to be posted', async () => {
    const pkg = fs.readFileSync('./package.json');
    const pkgJson = JSON.parse(pkg.toString('utf8'));
    const scope = nock(url)
      .matchHeader('content-type', 'application/dicom')
      .post('/', pkgJson)
      .reply(200, {});
    const res = await request({
      url,
      method: 'POST',
      data: pkg,
      headers: {'content-type': 'application/dicom'},
    });
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  it('should set content-type to application/json by default, for buffer', async () => {
    const pkg = fs.readFileSync('./package.json');
    const pkgJson = JSON.parse(pkg.toString('utf8'));
    const scope = nock(url)
      .matchHeader('content-type', 'application/json')
      .post('/', pkgJson)
      .reply(200, {});
    const res = await request({
      url,
      method: 'POST',
      data: pkg,
    });
    scope.done();
    assert.deepStrictEqual(res.data, {});
  });

  describe('mtls', () => {
    class GaxiosAssertAgentCache extends Gaxios {
      getAgentCache() {
        return this.agentCache;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      protected async _request<T = any>(
        opts: GaxiosOptions = {}
      ): GaxiosPromise<T> {
        assert(opts.agent);
        return super._request(opts);
      }
    }
    it('uses HTTPS agent if cert and key provided, on first request', async () => {
      const key = fs.readFileSync('./test/fixtures/fake.key', 'utf8');
      const scope = nock(url).get('/').reply(200);
      const inst = new GaxiosAssertAgentCache({
        headers: {apple: 'juice'},
        cert: fs.readFileSync('./test/fixtures/fake.cert', 'utf8'),
        key,
      });
      const res = await inst.request({url, headers: {figgy: 'pudding'}});
      scope.done();
      assert.strictEqual(res.config.headers!.apple, 'juice');
      assert.strictEqual(res.config.headers!.figgy, 'pudding');
      const agentCache = inst.getAgentCache();
      assert(agentCache.get(key));
    });
    it('uses HTTPS agent if cert and key provided, on subsequent requests', async () => {
      const key = fs.readFileSync('./test/fixtures/fake.key', 'utf8');
      const scope = nock(url).get('/').reply(200).get('/').reply(200);
      const inst = new GaxiosAssertAgentCache({
        headers: {apple: 'juice'},
        cert: fs.readFileSync('./test/fixtures/fake.cert', 'utf8'),
        key,
      });
      await inst.request({url, headers: {figgy: 'pudding'}});
      await inst.request({url, headers: {figgy: 'pudding'}});
      scope.done();
      const agentCache = inst.getAgentCache();
      assert(agentCache.get(key));
    });
  });
});

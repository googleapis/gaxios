import * as assert from 'assert';

import {request} from '../src/index';
const port = 3000;  // should match the port defined in `webserver.ts`

describe('💻 browser tests', async () => {
  it('should just work from browser', async () => {
    const result = await request({url: `http://localhost:${port}/path`});
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data, 'response');
  });

  it('should pass querystring parameters from browser', async () => {
    const result = await request({
      url: `http://localhost:${port}/querystring`,
      params: {query: 'value'}
    });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data, 'value');
  });

  after(async () => {
    const result = await request({url: `http://localhost:${port}/enough`});
    // webserver will die now
  });
});

// Copyright 2019, Google, LLC.
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

import execa from 'execa';
import express from 'express';
import http from 'http';

const port = 7172;

async function listen(
  app: express.Express,
  port: number
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, (err: Error) => {
      if (err) {
        reject(err);
      }
      resolve(server);
    });
  });
}

// Starts a web server that browser tests will use, then runs actual browser
// tests.
async function main() {
  const app = express();
  app.get('/path', (req: express.Request, res: express.Response) => {
    if (req.header('origin')) {
      res.set('Access-Control-Allow-Origin', req.header('origin'));
    }
    res.send('response');
  });
  app.get('/querystring', (req: express.Request, res: express.Response) => {
    if (req.header('origin')) {
      res.set('Access-Control-Allow-Origin', req.header('origin'));
    }
    const query = req.query.query;
    res.send(query || '');
  });

  const server = await listen(app, port);
  console.log(`[http server] I'm listening on port ${port}! Starting karma.`);
  const result = await execa('karma', ['start'], {stdio: 'inherit'});
  server.close();
  console.log(
    `[http server] Karma has finished! I'm no longer listening on port ${port}!`
  );
  process.exit(result.failed ? 1 : 0);
}

main().catch(err => {
  console.log('Error:', err);
});

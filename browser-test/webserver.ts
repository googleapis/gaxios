import * as express from 'express';
import * as http from 'http';

const port = 7172;

function main() {
  const app = express();
  let server: http.Server;
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
  app.get('/enough', (req: express.Request, res: express.Response) => {
    if (req.header('origin')) {
      res.set('Access-Control-Allow-Origin', req.header('origin'));
    }
    res.send('have a great rest of your day');
    server.close();
    console.log(`[http server] I'm no longer listening on port ${port}!`);
    process.exit(0);
  });
  server = app.listen(port, () => {
    console.log(`[http server] I'm listening on port ${port}!`);
  });
}

main();

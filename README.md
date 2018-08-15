# @google/getch
> Consistent request interface for Google npm modules. This is *not* a general purpose HTTP client. It's sole purpose is to use with other Google npm modules.


## Install
```sh
$ npm install @google/getch
```


## Example

```js
const {getch} = require('@google/getch');

const res = await getch({
  url: 'https://www.googleapis.com/discovery/v1/apis/'
});
```

## Options

```js
{
  // The url to which the request should be sent.  Required.
  url: string,

  // The HTTP method to use for the request.  Defaults to `GET`.
  method: 'GET',

  // The HTTP methods to be sent with the request.
  headers: { 'some': 'header' },

  // The data to base64 encode and send in the body of the request.
  data: {
    some: 'data'
  },

  // The querystring parameters that will be encoded using `qs` and
  // appended to the url
  params: {
    querystring: 'parameters'
  },

  // The timeout for the HTTP request. Defaults to 0.
  timeout: 1000,

  // The expected return type of the request.  Options are `json`, `stream`,
  // and `text`.  Defaults to JSON.
  responseType: 'json',

  // The node.js http agent to use for the request.
  agent: someHttpsAgent,

  // Custom function to determine if the response is valid based on the
  // status code.  Defaults to (>= 200 && < 300)
  validateStatus: (status: number) => true,

  // Custom configuration for retrying of requests.
  retryConfig: {
    // The number of times to retry the request.  Defaults to 3.
    retry?: number;

    // The number of retries already attempted.
    currentRetryAttempt?: number;

    // The amount of time to initially delay the retry.  Defaults to 100.
    retryDelay?: number;

    // The HTTP Methods that will be automatically retried.
    // Defaults to ['GET','PUT','HEAD','OPTIONS','DELETE']
    httpMethodsToRetry?: string[];

    // The HTTP response status codes that will automatically be retried.
    // Defaults to: [[100, 199], [429, 429], [500, 599]]
    statusCodesToRetry?: number[][];

    // Function to invoke when a retry attempt is made.
    onRetryAttempt?: (err: GetchError) => void;

    // Function to invoke which determines if you should retry
    shouldRetry?: (err: GetchError) => boolean;

    // When there is no response, the number of retries to attempt. Defaults to 2.
    noResponseRetries?: number;
  },

  // Just enable retries with the default config.
  retry: true
}

## License
[Apache-2.0](LICENSE)

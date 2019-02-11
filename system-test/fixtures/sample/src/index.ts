import {request} from 'gaxios';
async function main() {
  await request({
    url: 'https://www.googleapis.com/discovery/v1/apis/'
  });
}
main();

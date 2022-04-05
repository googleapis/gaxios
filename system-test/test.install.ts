// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import assert from 'assert';
import execa from 'execa';
import fs from 'fs';
import mv from 'mv';
import {ncp} from 'ncp';
import path from 'path';
import tmp from 'tmp';
import {promisify} from 'util';
import {describe, it, before, after} from 'mocha';

const keep = false;
const mvp = promisify(mv) as {} as (...args: string[]) => Promise<void>;
const ncpp = promisify(ncp);
const stagingDir = tmp.dirSync({keep, unsafeCleanup: true});
const stagingPath = stagingDir.name;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json');

describe('📦 pack and install', () => {
  /**
   * Create a staging directory with temp fixtures used to test on a fresh
   * application.
   */
  before('pack and install', async () => {
    await execa('npm', ['pack']);
    const tarball = `${pkg.name}-${pkg.version}.tgz`;
    await mvp(tarball, `${stagingPath}/gaxios.tgz`);
    await ncpp('system-test/fixtures/sample', `${stagingPath}/`);
    await execa('npm', ['install'], {
      cwd: `${stagingPath}/`,
      stdio: 'inherit',
    });
  });

  it('should run the sample', async () => {
    await execa('node', ['--throw-deprecation', 'build/src/index.js'], {
      cwd: `${stagingPath}/`,
      stdio: 'inherit',
    });
  });

  it('should be able to webpack the library', async () => {
    // we expect npm install is executed in the before hook
    await execa('npx', ['webpack'], {
      cwd: `${stagingPath}/`,
      stdio: 'inherit',
    });
    const bundle = path.join(stagingPath, 'dist', 'bundle.min.js');
    const stat = fs.statSync(bundle);
    assert(stat.size < 256 * 1024);
  }).timeout(20000);

  /**
   * CLEAN UP - remove the staging directory when done.
   */
  after('cleanup staging', () => {
    if (!keep) {
      stagingDir.removeCallback();
    }
  });
});

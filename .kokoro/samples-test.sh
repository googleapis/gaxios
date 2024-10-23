#!/bin/bash

# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -eo pipefail

echo "===NPM_CONFIG_PREFIX: NPM DEBUGGING==="
echo "$NPM_CONFIG_PREFIX"

(
  echo "===UPDATE NOTIFIER: NPM DEBUGGING==="
  npm config get update-notifier || true
  npm config set update-notifier false || true
)

export NPM_CONFIG_PREFIX=${HOME}/.npm-global

echo "===PRE: NPM DEBUGGING==="
which npm
whereis npm
npm -v
echo npm config get update-notifier

echo "===INSTALL: NPM DEBUGGING==="
npm install -g npm@10

echo "===POST: NPM DEBUGGING==="
which npm
whereis npm
npm -v
echo npm config get update-notifier

echo "===RUN: NPM DEBUGGING==="


# Setup service account credentials.
export GOOGLE_APPLICATION_CREDENTIALS=${KOKORO_GFILE_DIR}/secret_manager/long-door-651-kokoro-system-test-service-account
export GCLOUD_PROJECT=long-door-651

cd $(dirname $0)/..

# Run a pre-test hook, if a pre-samples-test.sh is in the project
if [ -f .kokoro/pre-samples-test.sh ]; then
    set +x
    . .kokoro/pre-samples-test.sh
    set -x
fi

if [ -f samples/package.json ]; then
    echo "===1: NPM DEBUGGING==="
    npm install

    # Install and link samples
    cd samples/

    echo "===2: NPM DEBUGGING==="
    npm link ../

    echo "===3: NPM DEBUGGING==="
    npm install

    echo "===4: NPM DEBUGGING==="
    cd ..
    # If tests are running against main branch, configure flakybot
    # to open issues on failures:
    if [[ $KOKORO_BUILD_ARTIFACTS_SUBDIR = *"continuous"* ]] || [[ $KOKORO_BUILD_ARTIFACTS_SUBDIR = *"nightly"* ]]; then
      export MOCHA_REPORTER_OUTPUT=test_output_sponge_log.xml
      export MOCHA_REPORTER=xunit
      cleanup() {
        chmod +x $KOKORO_GFILE_DIR/linux_amd64/flakybot
        $KOKORO_GFILE_DIR/linux_amd64/flakybot
      }
      trap cleanup EXIT HUP
    fi

    echo "===5: NPM DEBUGGING==="
    npm run samples-test

    echo "===6: NPM DEBUGGING==="
fi

# codecov combines coverage across integration and unit tests. Include
# the logic below for any environment you wish to collect coverage for:
COVERAGE_NODE=18
if npx check-node-version@3.3.0 --silent --node $COVERAGE_NODE; then
  NYC_BIN=./node_modules/nyc/bin/nyc.js
  if [ -f "$NYC_BIN" ]; then
    $NYC_BIN report || true
  fi

  echo "===7: NPM DEBUGGING==="

  bash $KOKORO_GFILE_DIR/codecov.sh
else
  echo "coverage is only reported for Node $COVERAGE_NODE"
fi

echo "===DONE: NPM DEBUGGING==="

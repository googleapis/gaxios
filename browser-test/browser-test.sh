#!/bin/sh

# Copyright 2019, Google, LLC.
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

PORT=7172

node build/browser-test/webserver.js &
while : ; do 
  if curl http://localhost:$PORT/path > /dev/null 2>&1 ; then
    break
  fi
  echo '[script] Still waiting for server to start...'
  sleep 1
done

echo '[script] Server is running, starting Karma!'
npx karma start
result=$?
echo "[script] Karma has finished with code $result"
wait
exit $result

#!/bin/sh
set -e

echo "Running fn from $FN_MODULE $FN_PATH"
cd /home/node/app
npm init -y && npm i e$FN_MODULE

node /home/node/lambda.mjs

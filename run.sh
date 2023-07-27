#!/bin/sh
set -e

echo "Running fn from $FN_MODULE or $FN_PATH"
cd /home/node/app
[ -n "$FN_MODULE" ] && npm i -S $FN_MODULE;

node /home/node/lambda.mjs

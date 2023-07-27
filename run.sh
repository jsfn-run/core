#!/bin/sh
set -e

echo "Running fn from $FN_MODULE or $FN_PATH"
cd /home/node/app

if [ -n "$FN_MODULE" ]; then
  npm i -S fn$FN_MODULE;
  export FN_PATH="/home/node/app/node_modules/fn/index.js";
  unset FN_MODULE
fi

node /home/node/lambda.mjs

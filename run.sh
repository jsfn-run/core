#!/bin/sh
set -e

echo "Running fn from $FN_MODULE"
cd /home/node/app
npm init -y && npm i $FN_MODULE

node /home/node/lambda.mjs

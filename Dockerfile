FROM docker.io/node:19-alpine

RUN sed -i -e 's/^root::/root:!:/' /etc/shadow
RUN set -xe && apk add --no-cache bash git openssh nano python3 curl gcc g++ make libc-dev
ENV HOME=/home/node
RUN chown -R node:node /home
ADD ./dist /home/node
RUN cd /home/node && mkdir app && npm init -y && npm i @node-lambdas/core

USER node
WORKDIR /home/node/app
ENTRYPOINT ["/usr/local/bin/node", "/home/node/index.mjs"]

ENV FN_PATH "/home/node/app/index.js"
ENV PORT 8080
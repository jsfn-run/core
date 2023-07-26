FROM docker.io/node:19-alpine

RUN sed -i -e 's/^root::/root:!:/' /etc/shadow
RUN set -xe && apk add --no-cache bash git openssh nano python3 curl gcc g++ make libc-dev
ENV HOME=/home/node
ENV FN_PATH "/home/node/app/index.js"
COPY ./dist /home/node
COPY run.sh /entrypoint.sh
RUN cd /home/node && mkdir app
RUN chown -R 1000:1000 /home

USER 1000
WORKDIR /home/node/app
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]

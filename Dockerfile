FROM ghcr.io/cloud-cli/node:latest
COPY . /home/app
USER 0
# USER 1000
RUN mkdir /home/fn
ENV WORKING_DIR=/home/fn
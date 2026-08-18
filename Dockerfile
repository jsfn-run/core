FROM ghcr.io/cloud-cli/node:latest AS builder
COPY . .
RUN pnpm i && pnpm build

FROM ghcr.io/cloud-cli/node:latest
COPY --from=builder /home/app/dist/ ./
RUN mkdir /home/fn
ENV WORKING_DIR=/home/fn
ENTRYPOINT [ "node" ]
CMD [ "/home/app/runner.mjs" ]
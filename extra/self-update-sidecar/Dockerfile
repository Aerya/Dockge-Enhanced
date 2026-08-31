FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3

RUN apk add --no-cache docker-cli docker-cli-compose \
    && rm -rf /usr/local/lib/node_modules/npm
WORKDIR /updater
COPY --chown=node:node extra/self-update-sidecar/index.js ./index.js
USER node
ENTRYPOINT ["node", "/updater/index.js"]

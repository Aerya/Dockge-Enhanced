FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS dependencies

WORKDIR /dependencies
RUN npm install --ignore-scripts --no-package-lock --omit=dev yaml@2.9.0 \
    && rm -rf /root/.npm

FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3

RUN apk add --no-cache docker-cli docker-cli-compose \
    && rm -rf /usr/local/lib/node_modules/npm
WORKDIR /helper
COPY --from=dependencies /dependencies/node_modules/yaml ./node_modules/yaml
COPY extra/external-stack-access-sidecar/index.js ./index.js
USER node
ENTRYPOINT ["node", "/helper/index.js"]

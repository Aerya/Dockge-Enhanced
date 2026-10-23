FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797

# eMudhra: refresh both the CA sources and the generated bundle.
RUN apk add --no-cache --upgrade ca-certificates ca-certificates-bundle \
    && update-ca-certificates

RUN apk upgrade --no-cache libcrypto3 libssl3 \
    && apk add --no-cache docker-cli docker-cli-compose \
    && rm -rf /usr/local/lib/node_modules/npm
WORKDIR /updater
COPY --chown=node:node extra/self-update-sidecar/index.js ./index.js
USER node
ENTRYPOINT ["node", "/updater/index.js"]

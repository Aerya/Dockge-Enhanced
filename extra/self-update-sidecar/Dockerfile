FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019

RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /updater
COPY --chown=node:node extra/self-update-sidecar/index.js ./index.js
USER node
ENTRYPOINT ["node", "/updater/index.js"]

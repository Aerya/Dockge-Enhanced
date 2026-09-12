# ─── Stage 1 : build ─────────────────────────────────────────────
FROM golang:1.27-alpine AS restic-builder

ARG RESTIC_VERSION=0.19.1
ARG GRPC_VERSION=1.83.2
WORKDIR /src
RUN wget -qO- "https://github.com/restic/restic/archive/refs/tags/v${RESTIC_VERSION}.tar.gz" \
    | tar -xz --strip-components=1 \
    && go get "google.golang.org/grpc@v${GRPC_VERSION}" \
    && go run build.go

# ─── Stage 2 : build de l'application ─────────────────────────────────
FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS builder

WORKDIR /app

# Outils de compilation pour les modules natifs (node-pty, sqlite3)
RUN apk add --no-cache python3 make g++

# Toutes les dépendances (dev incluses pour le build frontend)
COPY package*.json ./
# Installation strictement reproductible depuis le verrou audité
RUN npm ci

# Build du frontend Vite → /app/frontend-dist
COPY . .
RUN npm run build:frontend

# Suppression des devDependencies — les modules natifs restent compilés
RUN npm prune --omit=dev

# ─── Stage 2 : image de production ───────────────────────────────
FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868

WORKDIR /app

ARG BUILD_REVISION=""
ARG BUILD_DATE=""
LABEL org.opencontainers.image.source="https://github.com/Aerya/Dockge-Enhanced" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.created="${BUILD_DATE}"

ENV NODE_ENV=production

# Docker CLI + Compose plugin (nécessaires pour gérer les stacks)
# Trivy n'est pas installé ici — le scanner utilise aquasec/trivy:latest via Docker
RUN apk upgrade --no-cache libcrypto3 libssl3 \
    && apk add --no-cache bash docker-cli docker-cli-compose git openssh-client sshpass rsync

# npm et Corepack ne sont pas nécessaires à l’exécution. Les retirer élimine
# aussi leur propre arbre de dépendances de l’image exposée.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# La release stable est recompilée avec gRPC corrigé jusqu'à ce qu'un
# binaire officiel Restic intègre la correction de CVE-2026-84445.
COPY --from=restic-builder /src/restic /usr/local/bin/restic

# node_modules déjà compilés (pas de recompilation nécessaire)
COPY --from=builder /app/node_modules ./node_modules

# Code source
COPY backend/ ./backend/
COPY common/ ./common/
COPY extra/ ./extra/
COPY package*.json ./

# Frontend compilé
COPY --from=builder /app/frontend-dist ./frontend-dist

VOLUME ["/app/data"]

EXPOSE 5001

HEALTHCHECK --interval=60s --timeout=30s --start-period=180s --retries=5 \
    CMD wget -qO- http://localhost:5001/status || exit 1

CMD ["./node_modules/.bin/tsx", "./backend/index.ts"]

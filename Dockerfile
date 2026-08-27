# ─── Stage 1 : build ─────────────────────────────────────────────
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS builder

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
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019

WORKDIR /app

ENV NODE_ENV=production

# Docker CLI + Compose plugin (nécessaires pour gérer les stacks)
# Trivy n'est pas installé ici — le scanner utilise aquasec/trivy:latest via Docker
RUN apk upgrade --no-cache libcrypto3 libssl3 \
    && apk add --no-cache bash docker-cli docker-cli-compose git openssh-client sshpass rsync

# npm et Corepack ne sont pas nécessaires à l’exécution. Les retirer élimine
# aussi leur propre arbre de dépendances de l’image exposée.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Restic depuis GitHub releases — compilé avec Go récent (fix CVE stdlib).
# Mettre à jour RESTIC_VERSION dès qu'une nouvelle release est disponible :
# https://github.com/restic/restic/releases
ARG RESTIC_VERSION=0.19.1
RUN case "$(uname -m)" in \
        aarch64) ARCH=arm64 ;; \
        armv7l)  ARCH=arm   ;; \
        *)       ARCH=amd64 ;; \
    esac \
    && wget -qO /tmp/restic.bz2 \
       "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_${ARCH}.bz2" \
    && bunzip2 /tmp/restic.bz2 \
    && mv /tmp/restic /usr/local/bin/restic \
    && chmod +x /usr/local/bin/restic \
    && rm -f /tmp/restic.bz2

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

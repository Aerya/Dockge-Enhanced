# ─── Stage 1 : build ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Outils de compilation pour les modules natifs (node-pty, sqlite3)
RUN apk add --no-cache python3 make g++

# Toutes les dépendances (dev incluses pour le build frontend)
COPY package*.json ./
# npm install (plus souple que npm ci — tolère un lock file désynchronisé)
RUN npm install

# Build du frontend Vite → /app/frontend-dist
COPY . .
RUN npm run build:frontend

# Suppression des devDependencies — les modules natifs restent compilés
RUN npm prune --omit=dev

# ─── Stage 2 : image de production ───────────────────────────────
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Docker CLI + Compose plugin (nécessaires pour gérer les stacks)
# Restic (backups chiffrés)
RUN apk add --no-cache docker-cli docker-cli-compose restic curl \
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin \
    && apk del curl

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

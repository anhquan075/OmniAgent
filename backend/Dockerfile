# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/tsconfig.json ./
COPY backend/src/ ./src/

RUN pnpm run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["node", "dist/index.js"]

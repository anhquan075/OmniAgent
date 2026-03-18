FROM node:20-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/tsconfig.json ./
COPY backend/src/ ./src/

RUN pnpm run build

FROM node:20-bookworm-slim AS production

RUN corepack enable && corepack prepare pnpm@latest --activate && \
    groupadd -S appgroup && useradd -S appuser -G appgroup

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/package.json .

RUN pnpm config set store-dir /root/.pnpm-store

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

USER appuser

CMD ["node", "dist/index.js"]

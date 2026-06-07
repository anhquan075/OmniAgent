FROM node:22-alpine AS runtime

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm run build

EXPOSE 4173

CMD ["sh", "-c", "pnpm exec vite preview --host 0.0.0.0 --port ${PORT:-4173}"]

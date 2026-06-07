FROM node:22-bookworm-slim AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN chmod +x ./start.sh

EXPOSE 8787

CMD ["npm", "run", "start"]

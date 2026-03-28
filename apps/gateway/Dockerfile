FROM node:22-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build --workspace @pocket-codex/protocol --workspace @pocket-codex/db --workspace @pocket-codex/gateway

ENV NODE_ENV=production

EXPOSE 8787

CMD ["node", "apps/gateway/dist/apps/gateway/src/index.js"]

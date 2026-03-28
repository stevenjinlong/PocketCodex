FROM node:22-bookworm-slim

WORKDIR /app

ARG NEXT_PUBLIC_GATEWAY_HTTP_URL=http://localhost:8787
ARG NEXT_PUBLIC_GATEWAY_WS_URL=ws://localhost:8787/ws/browser

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_GATEWAY_HTTP_URL=${NEXT_PUBLIC_GATEWAY_HTTP_URL}
ENV NEXT_PUBLIC_GATEWAY_WS_URL=${NEXT_PUBLIC_GATEWAY_WS_URL}

COPY . .

RUN npm ci
RUN npm run build --workspace @pocket-codex/protocol --workspace @pocket-codex/crypto --workspace @pocket-codex/web

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "@pocket-codex/web", "--", "-H", "0.0.0.0", "-p", "3000"]

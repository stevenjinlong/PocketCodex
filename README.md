# Pocket Codex

Pocket Codex is a web-first remote client for your local Codex runtime.

The browser app and gateway manage users, trusted browsers, hosts, pairings, and encrypted relay sessions. Chat threads and turn history continue to live in the Codex runtime environment and are read from there on demand instead of being duplicated into the product database.

## What the database stores

The database is intentionally limited to control-plane data:

- users
- trusted browser devices
- registered hosts
- pairing tokens
- encrypted relay session metadata
- gateway server secret

It does **not** store Codex thread content as the source of truth.

## Storage modes

Pocket Codex supports two storage backends for the gateway:

- `json`
  Default when `DATABASE_URL` is not set. Good for quick local testing.
- `postgres`
  Recommended for shared or production-style installs.

The gateway selects the backend in this order:

1. `POCKET_CODEX_STORAGE_BACKEND=json|postgres`
2. If unset and `DATABASE_URL` exists, use Postgres
3. Otherwise use local JSON storage

## Quick start

### Option A: zero-config local mode

```sh
npm install
npm run dev:gateway
npm run dev:agent
npm run dev:web
```

This uses the local JSON gateway store under `~/.pocket-codex/`.

### Option B: one-command stack with Docker

1. Create env file:

```sh
cp .env.example .env
```

2. Start the full stack:

```sh
docker compose up --build
```

This starts:

- `gateway`
- `web`

The browser app will be available at:

```text
http://localhost:3000
```

The gateway will be available at:

```text
http://localhost:8787
```

3. Start the agent on the host machine:

```sh
npm install
npm run dev:agent
```

The agent stays on the host instead of inside Docker because it needs access to the local `codex` CLI/runtime and your real working directory.

### Option C: enable Postgres for the control plane

If you want the gateway to use Postgres instead of JSON:

```sh
cp .env.example .env
```

Edit `.env` to set:

```env
POCKET_CODEX_STORAGE_BACKEND=postgres
DATABASE_URL=postgres://pocket_codex:pocket_codex@localhost:5432/pocket_codex
```

Then start the DB profile:

```sh
docker compose --profile postgres up --build
```

Or use:

```sh
npm run stack:up:postgres
```

### Option D: Postgres only, apps on host

1. Create env file:

```sh
cp .env.example .env
```

2. Start Postgres:

```sh
npm run db:up
```

3. Start the app:

```sh
npm install
npm run dev:gateway
npm run dev:agent
npm run dev:web
```

The gateway will auto-create the required control-plane tables on startup. No separate migration step is required for first boot.

## Docker commands

```sh
npm run stack:up
npm run stack:up:postgres
npm run stack:down
npm run stack:logs
```

## Database-only commands

```sh
npm run db:up
npm run db:down
npm run db:logs
npm run db:reset
```

## Environment

See [.env.example](./.env.example) for the supported variables.

The most important ones are:

- `NEXT_PUBLIC_GATEWAY_HTTP_URL`
- `NEXT_PUBLIC_GATEWAY_WS_URL`
- `POCKET_CODEX_WEB_ORIGIN`
- `POCKET_CODEX_STORAGE_BACKEND`
- `DATABASE_URL`

Recommended open-source defaults:

- easiest install: `docker compose up` and let the gateway use JSON
- upgrade to DB-backed control plane later with the Postgres profile

## Verification

```sh
npm run typecheck
npm run build
```

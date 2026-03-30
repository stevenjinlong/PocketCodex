<p align="center">
  <img src="./docs/assets/pocket-codex-hero.png" alt="Pocket Codex hero" width="960" />
</p>

<p align="center">
  <a href="https://github.com/stevenjinlong/PocketCodex/stargazers">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/stevenjinlong/PocketCodex?style=for-the-badge&logo=github&label=Stars&color=0A66FF" />
  </a>
  <a href="https://github.com/stevenjinlong/PocketCodex/forks">
    <img alt="GitHub forks" src="https://img.shields.io/github/forks/stevenjinlong/PocketCodex?style=for-the-badge&logo=github&label=Forks&color=2563EB" />
  </a>
  <a href="https://github.com/stevenjinlong/PocketCodex/issues">
    <img alt="GitHub issues" src="https://img.shields.io/github/issues/stevenjinlong/PocketCodex?style=for-the-badge&logo=github&label=Issues&color=0F766E" />
  </a>
</p>

<p align="center">
  English | <a href="./README.zh-CN.md">简体中文</a>
</p>

# Pocket Codex

Pocket Codex is a web UI and control plane for a local Codex runtime.

The project is split into four parts:

- `web`: browser UI
- `gateway`: HTTP + WebSocket control-plane service
- `agent`: local daemon that talks to Codex and your local workspace
- `postgres`: database for users, hosts, browser devices, pairings, and relay session metadata

The important design point is:

- `web + gateway + postgres` can run on a server
- `agent` should run on the machine that has the real repository and Codex runtime

Thread content is not stored in the product database as the source of truth. The database only stores control-plane data.

## Screenshots

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="./docs/assets/screenshots/dashboard-dark.png" alt="Pocket Codex dark workspace" />
    </td>
    <td width="50%" valign="top">
      <img src="./docs/assets/screenshots/dashboard-light.png" alt="Pocket Codex light workspace" />
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="./docs/assets/screenshots/auth-screen.png" alt="Pocket Codex authentication screen" />
    </td>
  </tr>
</table>

## Architecture

```text
Browser
  -> web
  -> gateway (HTTP + WebSocket)
  -> postgres

Agent on a real machine
  -> gateway (WebSocket)
  -> local Codex runtime
  -> local filesystem / git / shell
```

## What each service does

### `web`

- user login
- pairing UI
- chat UI
- runtime controls

### `gateway`

- authentication
- browser/device trust
- host registration
- pairing token creation and claiming
- browser/agent WebSocket relay
- secure session setup

### `agent`

- connects a machine to the gateway
- talks to the local Codex runtime
- reads threads and turns
- executes commands against the local workspace

### `postgres`

Stores:

- users
- browser devices
- hosts
- pairing tokens
- relay sessions
- gateway config

## Requirements

- Node.js 22+
- npm 10+
- Docker / Docker Compose for the default database-backed setup
- a working `codex` CLI/runtime on any machine that will run `agent`

## Default mode

The default gateway backend is `postgres`.

JSON mode still exists as a fallback for local debugging, but for normal use and deployment you should use DB mode.

## Quick start

### Option A: easiest local run

Run `web + gateway + postgres` on the current machine, then run `agent` on the same machine.

```sh
npm install
cp .env.example .env
npm run stack:up
npm run start --workspace @pocket-codex/agent -- --pair
```

This gives you:

- web: `http://localhost:3000`
- gateway: `http://localhost:8787`
- postgres: `localhost:5432`

### Option B: database in Docker, apps on the host

Useful when you want hot reload for `web` and `gateway`.

```sh
npm install
cp .env.example .env
npm run db:up
npm run dev:gateway
npm run dev:web
npm run start --workspace @pocket-codex/agent -- --pair
```

### Option C: legacy JSON mode

If you explicitly want to avoid Postgres:

```env
POCKET_CODEX_STORAGE_BACKEND=json
DATABASE_URL=
DATABASE_URL_DOCKER=
```

Then use either:

```sh
npm run dev:gateway:json
```

or:

```sh
npm run stack:up:json
```

## Main commands

### Workspace-wide

```sh
npm install
npm run build
npm run typecheck
```

### Docker stack

```sh
npm run stack:up
npm run stack:up:postgres
npm run stack:up:json
npm run stack:down
npm run stack:logs
```

### Database only

```sh
npm run db:up
npm run db:down
npm run db:logs
npm run db:reset
```

### Host-native development

```sh
npm run dev:web
npm run dev:gateway
npm run dev:gateway:json
npm run dev:agent
```

### Workspace-scoped examples

```sh
npm run build --workspace @pocket-codex/gateway
npm run typecheck --workspace @pocket-codex/web
npm run start --workspace @pocket-codex/agent -- --pair
```

## Pairing a host

Start the agent with `--pair`:

```sh
npm run start --workspace @pocket-codex/agent -- --pair
```

The agent will print:

- a QR code
- a raw pairing payload JSON blob
- a short-lived `pair_...` token

Then in the browser:

1. Sign in.
2. Open the setup/pairing panel.
3. Paste the pairing payload or token.
4. Bind the host.

Pairing tokens are:

- tied to a host
- valid for 10 minutes
- single-use
- claimed through the gateway

## Recommended deployment model

If someone wants to deploy this as a website for real use, the recommended split is:

### Server

Run these on one server:

- `web`
- `gateway`
- `postgres`
- optional reverse proxy like `nginx` or `caddy`

### User machine

Run this on each real user machine:

- `agent`

That means:

- the website is shared
- the gateway is shared
- the database is shared
- each user still keeps execution on their own machine

## Deploy `web + gateway + postgres` on one server

Recommended DNS layout:

- `app.example.com` -> `web`
- `gateway.example.com` -> `gateway`

Example `.env`:

```env
NEXT_PUBLIC_GATEWAY_HTTP_URL=https://gateway.example.com
NEXT_PUBLIC_GATEWAY_WS_URL=wss://gateway.example.com/ws/browser
POCKET_CODEX_WEB_ORIGIN=https://app.example.com

POCKET_CODEX_STORAGE_BACKEND=postgres

DATABASE_URL=postgres://pocket_codex:YOUR_PASSWORD@localhost:5432/pocket_codex
DATABASE_URL_DOCKER=postgres://pocket_codex:YOUR_PASSWORD@postgres:5432/pocket_codex

POSTGRES_DB=pocket_codex
POSTGRES_USER=pocket_codex
POSTGRES_PASSWORD=YOUR_PASSWORD
POSTGRES_PORT=5432
```

Start the server side:

```sh
npm install
docker compose up -d --build
```

Health check:

```sh
curl http://localhost:8787/health
```

## Run `agent` on another machine

On the remote machine:

```sh
git clone <your-fork-or-repo>
cd PocketCodex
npm install

POCKET_CODEX_GATEWAY_WS_URL=wss://gateway.example.com/ws/agent \
npm run start --workspace @pocket-codex/agent -- --pair
```

The agent WebSocket endpoint is:

- browser: `/ws/browser`
- agent: `/ws/agent`

So the agent should connect to something like:

```text
wss://gateway.example.com/ws/agent
```

As long as the browser and the agent talk to the same gateway, the pairing token will work.

## Example: host machine + VM simulation

If you want to simulate this locally:

### On the host machine

Run:

```sh
npm install
cp .env.example .env
npm run stack:up
```

### On the VM

Use the host machine IP instead of `localhost`:

```sh
POCKET_CODEX_GATEWAY_WS_URL=ws://HOST_IP:8787/ws/agent \
npm run start --workspace @pocket-codex/agent -- --pair
```

Important:

- `localhost` inside the VM means the VM itself
- the VM must connect to the host machine IP, not `localhost`

## Environment variables

See [.env.example](./.env.example) for the full set.

Most important values:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_GATEWAY_HTTP_URL` | web | Browser HTTP base URL |
| `NEXT_PUBLIC_GATEWAY_WS_URL` | web | Browser WebSocket URL |
| `POCKET_CODEX_WEB_ORIGIN` | gateway | Allowed browser origin |
| `POCKET_CODEX_STORAGE_BACKEND` | gateway | `postgres` or `json` |
| `DATABASE_URL` | host-native gateway | Postgres URL for local process mode |
| `DATABASE_URL_DOCKER` | Docker gateway | Postgres URL inside Compose |
| `POCKET_CODEX_GATEWAY_WS_URL` | agent | Agent WebSocket URL |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_PORT` | postgres | Database settings |

## Why there are two database URLs

This is expected:

```env
DATABASE_URL=postgres://pocket_codex:pocket_codex@localhost:5432/pocket_codex
DATABASE_URL_DOCKER=postgres://pocket_codex:pocket_codex@postgres:5432/pocket_codex
```

Reason:

- `DATABASE_URL` is for processes running directly on the host
- `DATABASE_URL_DOCKER` is for the `gateway` container inside Docker Compose

Inside Compose, `postgres` is the service hostname. Using `localhost` from inside the `gateway` container would point back to the container itself, not the database container.

## Storage modes

### `postgres`

- default
- recommended
- required for serious deployment

### `json`

- local fallback only
- useful for debugging
- not recommended for a real multi-user deployment

## Verification

Build and typecheck:

```sh
npm run typecheck
npm run build
```

Gateway health:

```sh
curl http://localhost:8787/health
```

Database tables:

```sh
docker exec pocketcodex-postgres-1 psql -U pocket_codex -d pocket_codex -c '\dt'
```

## Troubleshooting

### `localhost:3000` still shows an old UI

You are probably looking at an older Docker container or an older local dev process.

Try:

- rebuild the `web` container
- or stop the container and run `npm run dev:web`

### Gateway cannot connect to Postgres inside Docker

Use `DATABASE_URL_DOCKER=postgres://...@postgres:5432/...`.

Do not use `localhost` inside the `gateway` container.

### Pairing token does not work

Check:

- the token is not expired
- the token was generated by an agent connected to the same gateway
- the browser is logged into the same deployment
- the host is not already paired to another account

### Agent on another machine cannot connect

Check:

- firewall rules
- correct gateway host/IP
- `POCKET_CODEX_GATEWAY_WS_URL`
- whether `8787` is actually reachable from that machine

## Local agent state

The agent identity is stored at:

```text
~/.pocket-codex/agent.json
```

It includes:

- `hostId`
- `hostSecret`
- `displayName`

Do not commit or share it casually.

## License

No license file is included yet.

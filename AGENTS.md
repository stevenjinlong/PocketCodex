# Repository Guidelines

## Project Structure & Module Organization
`pocket-codex` is an npm workspace monorepo.

- `apps/web`: Next.js web client (`src/app`, `src/components`)
- `apps/gateway`: Express/WebSocket relay and auth service (`src/index.ts`, `src/store.ts`)
- `apps/agent`: local Node daemon that talks to `codex app-server` over `stdio`
- `packages/protocol`: shared message types and normalization helpers
- `packages/crypto`: browser/agent session key and relay envelope helpers
- `packages/db`: Drizzle schema and database client helpers

Build output goes to each package’s `dist/` directory. The web app also generates `.next/`.

## Build, Test, and Development Commands
- `npm install`: install all workspace dependencies
- `npm run build`: build every package and app
- `npm run typecheck`: run TypeScript checks across all workspaces
- `npm run dev:web`: start the Next.js app locally
- `npm run dev:gateway`: run the gateway in watch mode
- `npm run dev:agent`: run the local agent against the gateway

Use workspace-scoped commands when debugging one area, for example:
`npm run build --workspace @pocket-codex/gateway`

## Coding Style & Naming Conventions
- Language: TypeScript with ES modules
- Indentation: 2 spaces in JSON, standard TypeScript formatting elsewhere
- Prefer small, explicit functions and shared types from `@pocket-codex/protocol`
- File names: kebab-case for component/modules like `pocket-codex-app.tsx`
- Types/interfaces: `PascalCase`
- Variables/functions: `camelCase`

No dedicated formatter or linter is configured yet, so keep code consistent with nearby files.

## Testing Guidelines
There is no committed test suite yet. For now, treat these as the minimum checks:

- `npm run typecheck`
- `npm run build`

When adding tests, place them beside the source as `*.test.ts` or `*.test.tsx`, and prefer focused unit coverage for protocol, crypto, and gateway behavior.

## Commit & Pull Request Guidelines
Local Git history is not available in this workspace, so use clear, imperative commits such as:
`Add secure browser session bootstrap`

Pull requests should include:
- a short summary of the change
- affected workspaces (`apps/web`, `apps/gateway`, etc.)
- verification steps run locally
- screenshots for web UI changes

## Security & Configuration Tips
Use `NEXT_PUBLIC_GATEWAY_HTTP_URL` and `NEXT_PUBLIC_GATEWAY_WS_URL` for web-to-gateway routing. Never commit secrets, OAuth credentials, or local pairing data from `~/.pocket-codex/`.

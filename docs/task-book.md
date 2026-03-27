# Pocket Codex Task Book

## 1. Project Goal

Pocket Codex is a web-first remote client for the real local Codex runtime. It is not a generic hosted AI chat site.

The product must preserve the core properties validated by earlier Remodex exploration:

- local-first runtime ownership on the user's machine
- QR bootstrap for trust and pairing
- relay-based transport between browser and local host
- live event streaming that feels like native Codex

Target interaction path:

`browser UI <-> Pocket Codex gateway <-> local pocket-codex-agent <-> codex app-server`

## 2. Product Positioning

Pocket Codex should let a user securely operate their own local Codex environment from the browser.

The browser is the remote control surface.
The local agent is the runtime owner.
The gateway is the authenticated relay and session coordinator.
The Codex runtime remains local to the user's machine.

This means the project should optimize for:

- trusted remote access instead of hosted inference
- secure pairing instead of anonymous device access
- streaming timeline fidelity instead of simplified chat bubbles
- stable internal protocol design instead of exposing experimental upstream transports directly

## 3. Repository Responsibilities

The monorepo should evolve around the following responsibilities:

- `apps/web`: Next.js web client for login, QR scan, host dashboard, threads, and Codex-style timeline/composer UI
- `apps/gateway`: gateway service for auth, pairing, presence, browser-agent relay, and session coordination
- `apps/agent`: local daemon that runs on the user's machine and talks to `codex app-server` over local `stdio`
- `packages/protocol`: shared message types, relay envelopes, session events, and UI normalization helpers
- `packages/crypto`: authenticated key exchange, session keys, and encrypted envelope helpers
- `packages/db`: schema and helpers for users, hosts, pairings, sessions, and mirrored metadata

## 4. Core Architecture Decisions

### 4.1 Local-first Runtime

The real Codex runtime stays on the user's machine. Pocket Codex must never replace that ownership model with a hosted runtime abstraction.

### 4.2 Agent-to-Codex Transport

The local agent should communicate with `codex app-server` over local `stdio`.

This is a deliberate design choice:

- it keeps Codex runtime communication local and explicit
- it avoids depending on upstream experimental websocket behavior
- it lets Pocket Codex define its own stable browser/agent relay protocol

### 4.3 Gateway Role

The gateway is responsible for:

- user authentication to Pocket Codex
- pairing orchestration
- connection presence and host discovery
- relay of encrypted browser <-> agent traffic
- resumable session coordination

The gateway should not become the source of truth for local Codex execution state beyond what is necessary for routing, authorization, and optional mirrored metadata.

### 4.4 UI Model

The web UI should map directly to Codex concepts instead of flattening everything into a generic chat interface.

The implementation should preserve:

- `thread/start`
- `thread/resume`
- `turn/start`
- `turn/steer`
- `turn/interrupt`
- live `item/*` notifications

## 5. Security and Trust Model

Pocket Codex account authentication and local Codex authentication must remain separate concerns.

- Pocket Codex authenticates the person to the website
- the local agent owns the local Codex or ChatGPT session
- the browser only receives sanitized status and approved actions through the relay

Browser and agent should establish an authenticated end-to-end encrypted session through the gateway after pairing.

## 6. Pairing Flow

Required first-pair and recovery flow:

1. User logs into Pocket Codex in the browser.
2. User runs `pocket-codex agent up` on the machine that owns the local Codex runtime.
3. The agent creates or loads a host identity, connects outbound to the gateway, and prints a short-lived QR code.
4. The browser scans the QR code and binds the host to the logged-in account.
5. Browser and agent perform authenticated key exchange and establish an encrypted session through the gateway.
6. Later reconnects reuse stored trust. QR is required only for first pair or recovery.

## 7. UX Requirements

Pocket Codex should feel like Codex in a browser, not like a standard assistant chat product.

Required UX direction:

- desktop-first and mobile-strong responsive layout
- left sidebar for threads, hosts, and projects
- main center timeline with a pinned composer
- Codex-style mixed timeline for user messages, assistant deltas, terminal output, diffs, tool calls, approvals, plan cards, and subagent branches
- smooth streaming with optimistic user echo, delta merge, follow-bottom behavior, reconnect recovery, and queued follow-ups while a run is active
- composer support for plan mode, steer while running, slash commands, file mentions, skill mentions, and later attachments
- mobile web support for camera QR scan and installable-app behavior

## 8. Delivery Phases

### Phase 1

Build the functional base:

- monorepo scaffold
- account auth
- database schema
- agent bootstrap
- QR pairing
- host dashboard
- thread list
- basic live chat
- reconnect behavior
- model, reasoning, and approval controls

### Phase 2

Bring the product closer to real Codex behavior:

- full item rendering model
- approvals UI
- queue and steer controls
- plan mode
- diff and terminal cards
- thread resume and fork
- stronger mobile polish

### Phase 3

Expand into a multi-host remote workspace product:

- multi-host management
- encrypted history mirror
- git and workspace actions
- desktop handoff
- notifications
- team accounts

## 9. What To Reuse and What To Replace

Reuse these concepts from prior Remodex research:

- local-first runtime
- QR trust bootstrap
- relay transport
- secure reconnect
- live event streaming

Replace these parts completely:

- iOS-specific architecture
- SwiftUI implementation patterns
- AppleScript-based refresh behavior
- mobile-first card UI assumptions
- any generic chatbot interaction model

## 10. Non-goals

The project should explicitly avoid these outcomes:

- becoming a generic hosted AI chat website
- exposing the raw local runtime directly to the public internet
- depending on unsupported upstream transport patterns when a local bridge is more stable
- reducing the Codex event model to plain chat bubbles

## 11. Current Acceptance Criteria

This task book should be treated as satisfied at the current milestone only when all of the following are true:

- a user can log into the web app and see their available hosts
- a local agent can come online and maintain an outbound gateway connection
- first-time pairing works through QR bootstrap
- browser and agent can establish an authenticated encrypted relay session
- the web app can create or resume threads backed by the local Codex runtime
- live timeline items stream to the browser with reconnect recovery
- the UI exposes model, reasoning, and approval controls appropriate to remote Codex use

## 12. Execution Principle

Every implementation choice should be tested against one question:

Does this make Pocket Codex a trustworthy remote window into the user's local Codex runtime?

If the answer is no, the design is likely drifting away from the product's core direction.

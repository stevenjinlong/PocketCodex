import { createServer } from "node:http";
import { TextEncoder } from "node:util";

import type {
  AgentInboundMessage,
  AgentOutboundMessage,
  BrowserInboundMessage,
  BrowserOutboundMessage,
  BrowserDeviceSummary,
  HostSummary,
  UserProfile,
} from "@pocket-codex/protocol";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { WebSocket, WebSocketServer } from "ws";

import { GatewayStore } from "./store.js";

const PORT = Number(process.env.PORT || 8787);
const WEB_ORIGIN = process.env.POCKET_CODEX_WEB_ORIGIN || "http://localhost:3000";

const store = new GatewayStore();
const jwtSecret = new TextEncoder().encode(store.serverSecret);
const app = express();

app.use(cors({ origin: WEB_ORIGIN }));
app.use(express.json());

type AuthenticatedRequest = Request & {
  user: UserProfile;
};

type BrowserSocketState = {
  userId: string;
  browserDeviceId: string | null;
};

type PendingSessionInit = {
  socket: WebSocket;
  userId: string;
  hostId: string;
  browserDevice: BrowserDeviceSummary;
  browserPublicKey: JsonWebKey;
};

async function issueToken(user: UserProfile): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret);
}

async function requireUser(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = request.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      response.status(401).json({ error: "Missing bearer token." });
      return;
    }

    const verified = await jwtVerify(token, jwtSecret);
    const user = store.findUserById(String(verified.payload.sub || ""));
    if (!user) {
      response.status(401).json({ error: "Unknown user." });
      return;
    }

    (request as AuthenticatedRequest).user = user;
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired token." });
  }
}

function sendJson<T>(socket: WebSocket, message: T): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function parseJson<T>(value: unknown): T | null {
  try {
    const text = typeof value === "string" ? value : value instanceof Buffer ? value.toString("utf8") : "";
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function sendBrowserError(socket: WebSocket, message: string): void {
  sendJson<BrowserInboundMessage>(socket, {
    type: "browser:error",
    message,
  });
}

function sendBrowserRequestError(socket: WebSocket, requestId: string, message: string): void {
  sendJson<BrowserInboundMessage>(socket, {
    type: "response",
    requestId,
    ok: false,
    error: message,
  });
}

const httpServer = createServer(app);
const browserWss = new WebSocketServer({ noServer: true });
const agentWss = new WebSocketServer({ noServer: true });

const browserSockets = new Map<string, Set<WebSocket>>();
const browserSocketState = new WeakMap<WebSocket, BrowserSocketState>();
const sessionSockets = new Map<string, WebSocket>();
const agentSockets = new Map<string, WebSocket>();
const pendingRequests = new Map<string, WebSocket>();
const pendingSessionInits = new Map<string, PendingSessionInit>();

function ensureBrowserSocketSet(userId: string): Set<WebSocket> {
  const existing = browserSockets.get(userId);
  if (existing) {
    return existing;
  }
  const created = new Set<WebSocket>();
  browserSockets.set(userId, created);
  return created;
}

function broadcastHostStatus(userId: string, host: HostSummary): void {
  const sockets = browserSockets.get(userId);
  if (!sockets) {
    return;
  }

  const message: BrowserInboundMessage = {
    type: "host:status",
    host,
  };

  for (const socket of sockets) {
    sendJson(socket, message);
  }
}

function broadcastHostList(userId: string): void {
  const sockets = browserSockets.get(userId);
  if (!sockets) {
    return;
  }

  const message: BrowserInboundMessage = {
    type: "host:list",
    hosts: store.listHostsForUser(userId),
  };

  for (const socket of sockets) {
    sendJson(socket, message);
  }
}

function resolveHostAccess(userId: string, hostId: string): { host: HostSummary; agentSocket: WebSocket } | null {
  const host = store.getHostSummary(hostId);
  if (!host || host.ownerUserId !== userId) {
    return null;
  }

  const agentSocket = agentSockets.get(hostId);
  if (!agentSocket) {
    return null;
  }

  return { host, agentSocket };
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/auth/register", async (request, response) => {
  try {
    const email = String(request.body?.email || "");
    const password = String(request.body?.password || "");
    const name = String(request.body?.name || "");
    if (!email || !password) {
      response.status(400).json({ error: "Email and password are required." });
      return;
    }

    const user = store.registerUser(email, password, name);
    const token = await issueToken(user);
    response.json({ token, user });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Registration failed." });
  }
});

app.post("/api/auth/login", async (request, response) => {
  try {
    const email = String(request.body?.email || "");
    const password = String(request.body?.password || "");
    const user = store.authenticateUser(email, password);
    const token = await issueToken(user);
    response.json({ token, user });
  } catch (error) {
    response.status(401).json({ error: error instanceof Error ? error.message : "Login failed." });
  }
});

app.get("/api/me", requireUser, (request, response) => {
  const user = (request as AuthenticatedRequest).user;
  response.json({
    user,
    hosts: store.listHostsForUser(user.id),
    browserDevices: store.listBrowserDevicesForUser(user.id),
  });
});

app.post("/api/pairings/claim", requireUser, (request, response) => {
  try {
    const token = String(request.body?.token || "");
    const browserDeviceId = request.body?.browserDeviceId ? String(request.body.browserDeviceId) : null;
    const browserName = request.body?.browserName ? String(request.body.browserName) : null;

    if (!token) {
      response.status(400).json({ error: "Missing pairing token." });
      return;
    }

    const user = (request as AuthenticatedRequest).user;
    const result = store.claimPairing({
      userId: user.id,
      token,
      browserDeviceId,
      browserName,
    });

    broadcastHostStatus(user.id, result.host);
    broadcastHostList(user.id);

    const agentSocket = agentSockets.get(result.host.id);
    if (agentSocket) {
      sendJson<AgentInboundMessage>(agentSocket, {
        type: "agent:pairing:claimed",
        host: result.host,
      });
    }

    response.json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Pairing failed." });
  }
});

httpServer.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);

  if (url.pathname === "/ws/browser") {
    browserWss.handleUpgrade(request, socket, head, (ws) => {
      browserWss.emit("connection", ws, request);
    });
    return;
  }

  if (url.pathname === "/ws/agent") {
    agentWss.handleUpgrade(request, socket, head, (ws) => {
      agentWss.emit("connection", ws, request);
    });
    return;
  }

  socket.destroy();
});

browserWss.on("connection", (socket) => {
  socket.on("message", async (payload) => {
    const message = parseJson<BrowserOutboundMessage>(payload);
    if (!message) {
      sendBrowserError(socket, "Invalid browser payload.");
      return;
    }

    if (message.type === "browser:subscribe") {
      try {
        const verified = await jwtVerify(message.token, jwtSecret);
        const user = store.findUserById(String(verified.payload.sub || ""));
        if (!user) {
          throw new Error("Unknown user.");
        }

        browserSocketState.set(socket, {
          userId: user.id,
          browserDeviceId: null,
        });
        ensureBrowserSocketSet(user.id).add(socket);

        sendJson<BrowserInboundMessage>(socket, {
          type: "browser:ready",
          user,
        });
        sendJson<BrowserInboundMessage>(socket, {
          type: "host:list",
          hosts: store.listHostsForUser(user.id),
        });
      } catch {
        sendBrowserError(socket, "Authentication failed.");
        socket.close();
      }
      return;
    }

    const state = browserSocketState.get(socket);
    if (!state) {
      sendBrowserError(socket, "Subscribe before sending commands.");
      return;
    }

    if (message.type === "host:list") {
      sendJson<BrowserInboundMessage>(socket, {
        type: "host:list",
        hosts: store.listHostsForUser(state.userId),
      });
      return;
    }

    if (message.type === "host:session:init") {
      const resolved = resolveHostAccess(state.userId, message.hostId);
      if (!resolved) {
        sendBrowserRequestError(socket, message.requestId, "That host is offline or not paired to your account.");
        return;
      }

      const browserDevice = store.upsertBrowserDevice({
        ownerUserId: state.userId,
        browserDeviceId: message.browserDeviceId,
        browserName: message.browserName,
      });

      browserSocketState.set(socket, {
        userId: state.userId,
        browserDeviceId: browserDevice.id,
      });
      pendingSessionInits.set(message.requestId, {
        socket,
        userId: state.userId,
        hostId: message.hostId,
        browserDevice,
        browserPublicKey: message.browserPublicKey,
      });

      sendJson<AgentInboundMessage>(resolved.agentSocket, {
        type: "agent:session:init",
        requestId: message.requestId,
        hostId: message.hostId,
        browserDevice,
        browserPublicKey: message.browserPublicKey,
      });
      return;
    }

    if (message.type === "session:message") {
      const resolved = resolveHostAccess(state.userId, message.hostId);
      if (!resolved) {
        sendBrowserError(socket, "That host is offline or not paired to your account.");
        return;
      }

      const session = store.validateRelaySession({
        sessionId: message.sessionId,
        hostId: message.hostId,
        ownerUserId: state.userId,
        browserDeviceId: state.browserDeviceId,
      });

      if (!session) {
        sendBrowserError(socket, "That secure relay session is no longer valid.");
        return;
      }

      store.touchRelaySession(session.id);
      sessionSockets.set(session.id, socket);

      sendJson<AgentInboundMessage>(resolved.agentSocket, {
        type: "agent:session:message",
        sessionId: session.id,
        body: message.body,
      });
      return;
    }

    const hostId = "hostId" in message ? message.hostId : null;
    if (!hostId) {
      sendBrowserError(socket, "Missing host id.");
      return;
    }

    const resolved = resolveHostAccess(state.userId, hostId);
    if (!resolved) {
      sendBrowserRequestError(socket, message.requestId, "That host is offline or not paired to your account.");
      return;
    }

    pendingRequests.set(message.requestId, socket);
    sendJson<AgentInboundMessage>(resolved.agentSocket, {
      type: "agent:request",
      requestId: message.requestId,
      command:
        message.type === "host:threads:list"
          ? { type: "threads:list", hostId: message.hostId }
          : message.type === "host:thread:read"
            ? { type: "thread:read", hostId: message.hostId, threadId: message.threadId }
            : message.type === "host:turn:start"
              ? {
                  type: "turn:start",
                  hostId: message.hostId,
                  threadId: message.threadId,
                  input: message.input,
                  cwd: message.cwd,
                  model: message.model,
                  approvalPolicy: message.approvalPolicy,
                  sandbox: message.sandbox,
                }
              : message.type === "host:turn:steer"
                ? {
                    type: "turn:steer",
                    hostId: message.hostId,
                    threadId: message.threadId,
                    input: message.input,
                  }
                : {
                    type: "turn:interrupt",
                    hostId: message.hostId,
                    threadId: message.threadId,
                    turnId: message.turnId,
                  },
    });
  });

  socket.on("close", () => {
    const state = browserSocketState.get(socket);
    if (!state) {
      return;
    }

    const sockets = browserSockets.get(state.userId);
    if (sockets) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        browserSockets.delete(state.userId);
      }
    }

    for (const [sessionId, browserSocket] of sessionSockets.entries()) {
      if (browserSocket === socket) {
        sessionSockets.delete(sessionId);
      }
    }

    for (const [requestId, pending] of pendingRequests.entries()) {
      if (pending === socket) {
        pendingRequests.delete(requestId);
      }
    }

    for (const [requestId, pending] of pendingSessionInits.entries()) {
      if (pending.socket === socket) {
        pendingSessionInits.delete(requestId);
      }
    }
  });
});

agentWss.on("connection", (socket) => {
  let hostId: string | null = null;

  socket.on("message", (payload) => {
    const message = parseJson<AgentOutboundMessage>(payload);
    if (!message) {
      sendJson<AgentInboundMessage>(socket, {
        type: "agent:error",
        message: "Invalid agent payload.",
      });
      return;
    }

    if (message.type === "agent:hello") {
      try {
        const host = store.registerHost({
          hostId: message.hostId,
          hostSecret: message.hostSecret,
          displayName: message.displayName,
          platform: message.platform,
          agentVersion: message.agentVersion,
        });

        hostId = host.id;
        agentSockets.set(host.id, socket);
        sendJson<AgentInboundMessage>(socket, {
          type: "agent:hello:ack",
          host,
        });

        if (host.ownerUserId) {
          broadcastHostStatus(host.ownerUserId, host);
          broadcastHostList(host.ownerUserId);
        }
      } catch (error) {
        sendJson<AgentInboundMessage>(socket, {
          type: "agent:error",
          message: error instanceof Error ? error.message : "Host registration failed.",
        });
        socket.close();
      }
      return;
    }

    if (!hostId) {
      sendJson<AgentInboundMessage>(socket, {
        type: "agent:error",
        message: "Send agent:hello first.",
      });
      return;
    }

    if (message.type === "agent:pairing:create") {
      try {
        const pairing = store.createPairing(hostId);
        sendJson<AgentInboundMessage>(socket, {
          type: "agent:pairing:created",
          token: pairing.token,
          expiresAt: pairing.expiresAt,
          payload: pairing.payload,
        });
      } catch (error) {
        sendJson<AgentInboundMessage>(socket, {
          type: "agent:error",
          message: error instanceof Error ? error.message : "Could not create pairing token.",
        });
      }
      return;
    }

    if (message.type === "agent:session:ready") {
      const pending = pendingSessionInits.get(message.requestId);
      if (!pending) {
        return;
      }

      pendingSessionInits.delete(message.requestId);
      const session = store.createRelaySession({
        sessionId: message.session.id,
        hostId: pending.hostId,
        ownerUserId: pending.userId,
        browserDeviceId: pending.browserDevice.id,
        browserName: pending.browserDevice.name,
        browserPublicKey: pending.browserPublicKey,
        agentPublicKey: message.session.agentPublicKey,
        createdAt: message.session.createdAt,
      });

      sessionSockets.set(session.id, pending.socket);
      sendJson<BrowserInboundMessage>(pending.socket, {
        type: "session:ready",
        requestId: message.requestId,
        session,
      });
      return;
    }

    if (message.type === "agent:session:message") {
      const session = store.getRelaySession(message.sessionId);
      if (!session) {
        return;
      }

      store.touchRelaySession(session.id);
      const browserSocket = sessionSockets.get(session.id);
      if (!browserSocket) {
        return;
      }

      sendJson<BrowserInboundMessage>(browserSocket, {
        type: "session:message",
        hostId: session.hostId,
        sessionId: session.id,
        body: message.body,
      });
      return;
    }

    if (message.type === "agent:response") {
      const browserSocket = pendingRequests.get(message.requestId);
      if (!browserSocket) {
        return;
      }

      pendingRequests.delete(message.requestId);
      sendJson<BrowserInboundMessage>(browserSocket, {
        type: "response",
        requestId: message.requestId,
        ok: message.ok,
        data: message.data,
        error: message.error,
      });
      return;
    }

    if (message.type === "agent:event") {
      const ownerUserId = store.getHostOwner(hostId);
      if (!ownerUserId) {
        return;
      }

      const sockets = browserSockets.get(ownerUserId);
      if (!sockets) {
        return;
      }

      const browserMessage: BrowserInboundMessage = {
        type: "codex:event",
        hostId,
        event: message.event,
      };

      for (const browserSocket of sockets) {
        sendJson(browserSocket, browserMessage);
      }
      return;
    }
  });

  socket.on("close", () => {
    if (!hostId) {
      return;
    }

    agentSockets.delete(hostId);
    const host = store.markHostOffline(hostId);
    if (host?.ownerUserId) {
      broadcastHostStatus(host.ownerUserId, host);
      broadcastHostList(host.ownerUserId);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[pocket-codex/gateway] listening on http://localhost:${PORT}`);
});

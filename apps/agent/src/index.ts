import { randomUUID } from "node:crypto";
import os from "node:os";
import { parseArgs } from "node:util";

import {
  decryptRelayMessage,
  deriveSessionKey,
  encryptRelayMessage,
  generateSessionKeyPair,
} from "@pocket-codex/crypto";
import type {
  AgentCommand,
  AgentInboundMessage,
  AgentOutboundMessage,
  SandboxMode,
  SecureRelayPayload,
} from "@pocket-codex/protocol";
import qrcode from "qrcode-terminal";
import WebSocket from "ws";

import { CodexClient, normalizeThreadSnapshot, normalizeThreadSummary } from "./codex-client.js";
import { loadOrCreateAgentState, resetAgentState } from "./state.js";

const GATEWAY_URL = process.env.POCKET_CODEX_GATEWAY_WS_URL || "ws://localhost:8787/ws/agent";

type SecureSession = {
  key: CryptoKey;
};

function printHeader(message: string): void {
  console.log(`[pocket-codex/agent] ${message}`);
}

function toSandboxMode(mode: SandboxMode | null | undefined): SandboxMode {
  return mode || "workspace-write";
}

function parseIncomingMessage(payload: WebSocket.RawData): AgentInboundMessage | null {
  try {
    return JSON.parse(payload.toString()) as AgentInboundMessage;
  } catch {
    return null;
  }
}

async function handleCommand(client: CodexClient, command: AgentCommand): Promise<unknown> {
  if (command.type === "threads:list") {
    const result = await client.request("thread/list", { limit: 40 });
    const data = Array.isArray(result?.data) ? result.data : [];
    return {
      threads: data.map((thread: unknown) => normalizeThreadSummary(thread as Record<string, unknown>)),
    };
  }

  if (command.type === "thread:read") {
    const result = await client.request("thread/read", {
      threadId: command.threadId,
      includeTurns: true,
    });
    return {
      thread: normalizeThreadSnapshot(result.thread as Record<string, unknown>),
    };
  }

  if (command.type === "turn:start") {
    let threadId = command.threadId || null;
    if (!threadId) {
      const created = await client.request("thread/start", {
        model: command.model || "gpt-5.4",
        cwd: command.cwd || process.cwd(),
        approvalPolicy: command.approvalPolicy || "on-request",
        sandbox: toSandboxMode(command.sandbox),
      });
      threadId = String(created.thread.id);
    } else {
      await client.request("thread/resume", {
        threadId,
      });
    }

    const turnResult = await client.request("turn/start", {
      threadId,
      input: [
        {
          type: "text",
          text: command.input,
        },
      ],
    });

    return {
      threadId,
      turnId: turnResult.turn?.id ? String(turnResult.turn.id) : null,
    };
  }

  if (command.type === "turn:steer") {
    const result = await client.request("turn/steer", {
      threadId: command.threadId,
      input: [
        {
          type: "text",
          text: command.input,
        },
      ],
    });
    return {
      turnId: result.turnId ? String(result.turnId) : null,
    };
  }

  await client.request("turn/interrupt", {
    threadId: command.threadId,
    turnId: command.turnId || undefined,
  });
  return {};
}

async function runAgent(): Promise<void> {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      pair: { type: "boolean", default: false },
      reset: { type: "boolean", default: false },
      name: { type: "string" },
      gateway: { type: "string" },
    },
    allowPositionals: true,
  });

  if (args.values.reset) {
    resetAgentState();
    printHeader("reset local host identity");
    return;
  }

  const displayName = args.values.name || `${os.hostname()} · Pocket Codex`;
  const state = loadOrCreateAgentState(displayName);
  const gatewayUrl = args.values.gateway || GATEWAY_URL;
  const codex = new CodexClient();

  let socket: WebSocket | null = null;
  let reconnectDelayMs = 1_000;
  let shouldPrintPairing = args.values.pair;
  const secureSessions = new Map<string, SecureSession>();

  const sendAgentMessage = (message: AgentOutboundMessage): void => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const sendSecurePayload = async (sessionId: string, payload: SecureRelayPayload): Promise<void> => {
    const session = secureSessions.get(sessionId);
    if (!session) {
      return;
    }

    const body = await encryptRelayMessage(session.key, payload);
    sendAgentMessage({
      type: "agent:session:message",
      sessionId,
      body,
    });
  };

  const broadcastSecurePayload = async (payload: SecureRelayPayload): Promise<void> => {
    await Promise.all(
      Array.from(secureSessions.keys()).map(async (sessionId) => {
        await sendSecurePayload(sessionId, payload);
      }),
    );
  };

  codex.on("notification", (notification) => {
    void broadcastSecurePayload({
      kind: "event",
      event: {
        kind: "notification",
        notification,
      },
    });
  });

  codex.on("log", (message: string) => {
    void broadcastSecurePayload({
      kind: "event",
      event: {
        kind: "log",
        level: "info",
        message,
      },
    });
  });

  const connect = (): void => {
    printHeader(`connecting to ${gatewayUrl}`);
    secureSessions.clear();
    socket = new WebSocket(gatewayUrl);

    socket.on("open", () => {
      reconnectDelayMs = 1_000;
      sendAgentMessage({
        type: "agent:hello",
        hostId: state.hostId,
        hostSecret: state.hostSecret,
        displayName: state.displayName,
        platform: `${os.platform()} ${os.release()}`,
        agentVersion: "0.1.0",
      });
    });

    socket.on("message", async (payload) => {
      const message = parseIncomingMessage(payload);
      if (!message) {
        return;
      }

      if (message.type === "agent:hello:ack") {
        printHeader(
          `${message.host.displayName} is ${message.host.online ? "online" : "offline"}${message.host.paired ? " and paired" : " and waiting for pairing"}`,
        );
        if (!message.host.paired || shouldPrintPairing) {
          shouldPrintPairing = false;
          sendAgentMessage({ type: "agent:pairing:create" });
        }
        return;
      }

      if (message.type === "agent:pairing:created") {
        printHeader("scan this QR code from the Pocket Codex website");
        qrcode.generate(message.payload, { small: true });
        console.log(message.payload);
        printHeader(`pairing expires at ${message.expiresAt}`);
        return;
      }

      if (message.type === "agent:pairing:claimed") {
        printHeader(`paired to account and ready: ${message.host.displayName}`);
        return;
      }

      if (message.type === "agent:error") {
        printHeader(message.message);
        return;
      }

      if (message.type === "agent:session:init") {
        try {
          const keyPair = await generateSessionKeyPair();
          const sessionKey = await deriveSessionKey(keyPair.privateKey, message.browserPublicKey);
          const sessionId = randomUUID();
          const createdAt = new Date().toISOString();

          secureSessions.set(sessionId, { key: sessionKey });
          sendAgentMessage({
            type: "agent:session:ready",
            requestId: message.requestId,
            session: {
              id: sessionId,
              hostId: message.hostId,
              browserDeviceId: message.browserDevice.id,
              browserName: message.browserDevice.name,
              createdAt,
              agentPublicKey: keyPair.publicKey,
            },
          });
        } catch (error) {
          printHeader(error instanceof Error ? error.message : "Failed to create secure session.");
        }
        return;
      }

      if (message.type === "agent:session:message") {
        const session = secureSessions.get(message.sessionId);
        if (!session) {
          return;
        }

        let requestId = "";
        try {
          const payload = await decryptRelayMessage<SecureRelayPayload>(session.key, message.body);
          if (payload.kind !== "request") {
            return;
          }

          requestId = payload.requestId;
          const data = await handleCommand(codex, payload.command);
          await sendSecurePayload(message.sessionId, {
            kind: "response",
            requestId: payload.requestId,
            ok: true,
            data,
          });
        } catch (error) {
          if (requestId) {
            await sendSecurePayload(message.sessionId, {
              kind: "response",
              requestId,
              ok: false,
              error: error instanceof Error ? error.message : "Command failed.",
            });
          }
        }
        return;
      }

      if (message.type === "agent:request") {
        try {
          const data = await handleCommand(codex, message.command);
          sendAgentMessage({
            type: "agent:response",
            requestId: message.requestId,
            ok: true,
            data,
          });
        } catch (error) {
          sendAgentMessage({
            type: "agent:response",
            requestId: message.requestId,
            ok: false,
            error: error instanceof Error ? error.message : "Command failed.",
          });
        }
      }
    });

    socket.on("close", () => {
      secureSessions.clear();
      printHeader(`disconnected, reconnecting in ${Math.round(reconnectDelayMs / 1_000)}s`);
      setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 1.5, 5_000);
    });

    socket.on("error", (error) => {
      printHeader(error instanceof Error ? error.message : "WebSocket error.");
    });
  };

  connect();
}

runAgent().catch((error) => {
  printHeader(error instanceof Error ? error.message : "Agent failed.");
  process.exitCode = 1;
});

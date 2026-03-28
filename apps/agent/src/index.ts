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
  BrowserAttachment,
  GitInspectResult,
  ReviewStartResult,
  RuntimeConfigResult,
  SandboxMode,
  ThreadsListResult,
  ThreadForkResult,
  ThreadMutationResult,
  ThreadReadResult,
  TurnStartResult,
  TurnSteerResult,
  SecureRelayPayload,
  ReasoningEffort,
} from "@pocket-codex/protocol";
import qrcode from "qrcode-terminal";
import WebSocket from "ws";

import { CodexClient, normalizeThreadSnapshot, normalizeThreadSummary } from "./codex-client.js";
import {
  checkoutGitBranch,
  commitGitRepository,
  createGitBranch,
  inspectGitRepository,
  pullGitRepository,
  pushGitRepository,
} from "./git.js";
import { loadOrCreateAgentState, resetAgentState } from "./state.js";

const GATEWAY_URL = process.env.POCKET_CODEX_GATEWAY_WS_URL || "ws://localhost:8787/ws/agent";
const THREAD_LIST_SOURCE_KINDS = ["cli", "vscode", "appServer", "exec", "unknown"];

type SecureSession = {
  key: CryptoKey;
};

function printHeader(message: string): void {
  console.log(`[pocket-codex/agent] ${message}`);
}

function toSandboxMode(mode: SandboxMode | null | undefined): SandboxMode {
  return mode || "workspace-write";
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | null {
  if (typeof value !== "string") {
    return null;
  }

  switch (value) {
    case "none":
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    default:
      return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed.";
}

function isUnsupportedServiceTierError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("servicetier") || message.includes("service tier");
}

function isUnsupportedCollaborationModeError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("collaborationmode") || message.includes("collaboration mode");
}

function isUnsupportedThreadForkOverrideError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("modelprovider")
    || message.includes("model provider")
    || message.includes("sandbox")
    || isUnsupportedServiceTierError(error)
  );
}

function buildCollaborationModePayload(command: {
  collaborationMode?: string | null;
  model?: string | null;
  reasoningEffort?: ReasoningEffort | null;
}): Record<string, unknown> | undefined {
  if (!command.collaborationMode) {
    return undefined;
  }

  return {
    mode: command.collaborationMode,
    settings: {
      model: command.model || "gpt-5.4",
      reasoning_effort: command.reasoningEffort || null,
      developer_instructions: null,
    },
  };
}

function parseIncomingMessage(payload: WebSocket.RawData): AgentInboundMessage | null {
  try {
    return JSON.parse(payload.toString()) as AgentInboundMessage;
  } catch {
    return null;
  }
}

function buildTurnInputItems(
  input: string,
  attachments: BrowserAttachment[] | null | undefined,
): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];

  if (input.trim()) {
    items.push({
      type: "text",
      text: input,
    });
  }

  for (const attachment of attachments || []) {
    if (attachment.kind === "text") {
      items.push({
        type: "text",
        text: `Attached file: ${attachment.name}\n\n${attachment.content}`,
      });
      continue;
    }

    if (attachment.kind === "image") {
      items.push({
        type: "image",
        url: attachment.url,
      });
      continue;
    }

    items.push({
      type: "text",
      text: `Attached file: ${attachment.name} (${attachment.mimeType})`,
    });
  }

  return items;
}

async function resumeThread(client: CodexClient, threadId: string): Promise<void> {
  await client.request("thread/resume", {
    threadId,
  });
}

async function handleCommand(client: CodexClient, command: AgentCommand): Promise<unknown> {
  if (command.type === "threads:list") {
    const result = await client.request("thread/list", {
      limit: 80,
      archived: command.archived || undefined,
      sourceKinds: THREAD_LIST_SOURCE_KINDS,
    });
    const data = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.items)
        ? result.items
        : Array.isArray(result?.threads)
          ? result.threads
          : [];
    const response: ThreadsListResult = {
      threads: data.map((thread: unknown) => normalizeThreadSummary(thread as Record<string, unknown>)),
    };
    return response;
  }

  if (command.type === "thread:read") {
    const result = await client.request("thread/read", {
      threadId: command.threadId,
      includeTurns: true,
    });
    const response: ThreadReadResult = {
      thread: normalizeThreadSnapshot(result.thread as Record<string, unknown>),
    };
    return response;
  }

  if (command.type === "runtime:config") {
    const [modelsResult, accountResult] = await Promise.all([
      client.request("model/list", {}),
      client.request("account/read", {}),
    ]);

    let collaborationModesResult: unknown = { data: [] };
    try {
      collaborationModesResult = await client.request("collaborationMode/list", {});
    } catch {
      collaborationModesResult = { data: [] };
    }

    let rateLimitsError: string | null = null;
    try {
      await client.request("account/rateLimits/read", {});
    } catch (error) {
      rateLimitsError = errorMessage(error);
    }

    const response: RuntimeConfigResult = {
      models: (Array.isArray(modelsResult?.data) ? modelsResult.data : [])
        .map((model: unknown) => {
          const record = model as Record<string, unknown>;
          return {
            id: String(record.id || record.model || ""),
            model: String(record.model || record.id || ""),
            displayName: String(record.displayName || record.model || record.id || "Model"),
            description: String(record.description || ""),
            hidden: Boolean(record.hidden),
            supportsPersonality: Boolean(record.supportsPersonality),
            isDefault: Boolean(record.isDefault),
            inputModalities: Array.isArray(record.inputModalities)
              ? record.inputModalities.map((value) => String(value))
              : [],
            defaultReasoningEffort: normalizeReasoningEffort(record.defaultReasoningEffort),
            supportedReasoningEfforts: Array.isArray(record.supportedReasoningEfforts)
              ? record.supportedReasoningEfforts
                  .map((option) => {
                    const candidate = option as Record<string, unknown>;
                    const reasoningEffort = normalizeReasoningEffort(candidate.reasoningEffort);
                    if (!reasoningEffort) {
                      return null;
                    }
                    return {
                      reasoningEffort,
                      description: String(candidate.description || ""),
                    };
                  })
                  .filter((option): option is { reasoningEffort: ReasoningEffort; description: string } => Boolean(option))
              : [],
            upgrade: typeof record.upgrade === "string" && record.upgrade ? record.upgrade : null,
          };
        })
        .filter((model: { id: string; hidden: boolean }) => model.id && !model.hidden),
      collaborationModes: (Array.isArray((collaborationModesResult as { data?: unknown[] })?.data)
        ? (collaborationModesResult as { data: unknown[] }).data
        : []
      ).map((mode) => {
        const record = mode as Record<string, unknown>;
        return {
          name: String(record.name || record.mode || "Mode"),
          mode: String(record.mode || "default"),
          model: typeof record.model === "string" && record.model ? record.model : null,
          reasoningEffort: normalizeReasoningEffort(record.reasoning_effort),
        };
      }),
      account:
        accountResult && typeof accountResult === "object"
          ? {
              accountType:
                (accountResult as { account?: { type?: unknown } }).account?.type
                && typeof (accountResult as { account?: { type?: unknown } }).account?.type === "string"
                  ? String((accountResult as { account?: { type?: unknown } }).account?.type)
                  : null,
              requiresOpenaiAuth: Boolean((accountResult as { requiresOpenaiAuth?: unknown }).requiresOpenaiAuth),
            }
          : null,
      rateLimitsError,
    };
    return response;
  }

  if (command.type === "thread:rename") {
    await resumeThread(client, command.threadId);
    await client.request("thread/name/set", {
      threadId: command.threadId,
      name: command.name,
    });
    const response: ThreadMutationResult = { ok: true };
    return response;
  }

  if (command.type === "thread:archive") {
    await resumeThread(client, command.threadId);
    await client.request("thread/archive", {
      threadId: command.threadId,
    });
    const response: ThreadMutationResult = { ok: true };
    return response;
  }

  if (command.type === "thread:unarchive") {
    await client.request("thread/unarchive", {
      threadId: command.threadId,
    });
    const response: ThreadMutationResult = { ok: true };
    return response;
  }

  if (command.type === "thread:fork") {
    await resumeThread(client, command.threadId);
    let params: Record<string, unknown> = {
      threadId: command.threadId,
    };

    if (command.cwd) {
      params.cwd = command.cwd;
    }
    if (command.model) {
      params.model = command.model;
    }
    if (command.modelProvider) {
      params.modelProvider = command.modelProvider;
    }
    if (command.sandbox) {
      params.sandbox = toSandboxMode(command.sandbox);
    }
    if (command.serviceTier) {
      params.serviceTier = command.serviceTier;
    }

    let result: any;
    try {
      result = await client.request("thread/fork", params);
    } catch (error) {
      if (!isUnsupportedThreadForkOverrideError(error)) {
        throw error;
      }
      result = await client.request("thread/fork", {
        threadId: command.threadId,
      });
    }

    const response: ThreadForkResult = {
      thread: normalizeThreadSnapshot(result.thread as Record<string, unknown>),
    };
    return response;
  }

  if (command.type === "turn:start") {
    let threadId = command.threadId || null;
    if (!threadId) {
      const startParams: Record<string, unknown> = {
        model: command.model || "gpt-5.4",
        cwd: command.cwd || process.cwd(),
        approvalPolicy: command.approvalPolicy || "on-request",
        sandbox: toSandboxMode(command.sandbox),
        experimentalRawEvents: false,
      };
      if (command.serviceTier) {
        startParams.serviceTier = command.serviceTier;
      }

      let created: any;
      try {
        created = await client.request("thread/start", startParams);
      } catch (error) {
        if (!command.serviceTier || !isUnsupportedServiceTierError(error)) {
          throw error;
        }
        delete startParams.serviceTier;
        created = await client.request("thread/start", startParams);
      }
      threadId = String(created.thread.id);
    } else {
      await client.request("thread/resume", {
        threadId,
      });
    }

    const turnParams: Record<string, unknown> = {
      threadId,
      input: buildTurnInputItems(command.input, command.attachments),
      cwd: command.cwd || undefined,
      approvalPolicy: command.approvalPolicy || undefined,
      model: command.model || undefined,
      effort: command.reasoningEffort || undefined,
    };
    if (command.serviceTier) {
      turnParams.serviceTier = command.serviceTier;
    }
    const collaborationMode = buildCollaborationModePayload(command);
    if (collaborationMode) {
      turnParams.collaborationMode = collaborationMode;
    }

    let turnResult: any;
    while (true) {
      try {
        turnResult = await client.request("turn/start", turnParams);
        break;
      } catch (error) {
        if (turnParams.serviceTier && isUnsupportedServiceTierError(error)) {
          delete turnParams.serviceTier;
          continue;
        }
        if (turnParams.collaborationMode && isUnsupportedCollaborationModeError(error)) {
          delete turnParams.collaborationMode;
          continue;
        }
        throw error;
      }
    }

    const response: TurnStartResult = {
      threadId,
      turnId: turnResult.turn?.id ? String(turnResult.turn.id) : null,
    };
    return response;
  }

  if (command.type === "turn:steer") {
    const params: Record<string, unknown> = {
      threadId: command.threadId,
      expectedTurnId: command.turnId,
      input: buildTurnInputItems(command.input, command.attachments),
    };
    const collaborationMode = buildCollaborationModePayload(command);
    if (collaborationMode) {
      params.collaborationMode = collaborationMode;
    }

    let result: any;
    while (true) {
      try {
        result = await client.request("turn/steer", params);
        break;
      } catch (error) {
        if (params.collaborationMode && isUnsupportedCollaborationModeError(error)) {
          delete params.collaborationMode;
          continue;
        }
        throw error;
      }
    }

    const response: TurnSteerResult = {
      turnId: result.turnId ? String(result.turnId) : null,
    };
    return response;
  }

  if (command.type === "review:start") {
    await resumeThread(client, command.threadId);
    const result = await client.request("review/start", {
      threadId: command.threadId,
      delivery: "inline",
      target:
        command.target === "uncommitted-changes"
          ? { type: "uncommittedChanges" }
          : { type: "baseBranch", branch: command.baseBranch || "" },
    });
    const response: ReviewStartResult = {
      threadId: command.threadId,
      turnId: result.turn?.id ? String(result.turn.id) : null,
    };
    return response;
  }

  if (command.type === "git:inspect") {
    const response: GitInspectResult = await inspectGitRepository(command.cwd);
    return response;
  }

  if (command.type === "git:commit") {
    const response: GitInspectResult = await commitGitRepository(command.cwd, command.message);
    return response;
  }

  if (command.type === "git:push") {
    const response: GitInspectResult = await pushGitRepository(command.cwd);
    return response;
  }

  if (command.type === "git:pull") {
    const response: GitInspectResult = await pullGitRepository(command.cwd);
    return response;
  }

  if (command.type === "git:checkout") {
    const response: GitInspectResult = await checkoutGitBranch(command.cwd, command.branch);
    return response;
  }

  if (command.type === "git:create-branch") {
    const response: GitInspectResult = await createGitBranch(command.cwd, command.branch);
    return response;
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

export type ApprovalPolicy = "never" | "on-request" | "untrusted";
export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface BrowserDeviceSummary {
  id: string;
  name: string;
  trustedAt: string;
  lastSeenAt: string;
}

export interface HostSummary {
  id: string;
  displayName: string;
  platform: string;
  agentVersion: string;
  paired: boolean;
  online: boolean;
  lastSeenAt: string | null;
  ownerUserId: string | null;
}

export interface PairingQrPayload {
  v: 1;
  kind: "pocket-codex-pairing";
  token: string;
  hostId: string;
  displayName: string;
  expiresAt: string;
}

export interface ThreadSummary {
  id: string;
  preview: string;
  name: string | null;
  cwd: string | null;
  updatedAt: number;
  createdAt: number;
  status: string;
  source: string | null;
}

export type TimelineItem =
  | {
      kind: "user-message";
      id: string;
      text: string;
    }
  | {
      kind: "assistant-message";
      id: string;
      text: string;
      phase: string | null;
    }
  | {
      kind: "reasoning";
      id: string;
      text: string;
    }
  | {
      kind: "command";
      id: string;
      title: string;
      output: string;
    }
  | {
      kind: "tool";
      id: string;
      title: string;
      output: string;
    }
  | {
      kind: "file-change";
      id: string;
      title: string;
      output: string;
    }
  | {
      kind: "event";
      id: string;
      label: string;
      detail: string;
    };

export interface TurnSnapshot {
  id: string;
  status: string;
  error: string | null;
  items: TimelineItem[];
}

export interface ThreadSnapshot extends ThreadSummary {
  turns: TurnSnapshot[];
}

export interface RawCodexNotification {
  method: string;
  params: Record<string, unknown>;
}

export type CodexRelayEvent =
  | {
      kind: "notification";
      notification: RawCodexNotification;
    }
  | {
      kind: "log";
      level: "info" | "error";
      message: string;
    };

export type AgentCommand =
  | {
      type: "threads:list";
      hostId: string;
    }
  | {
      type: "thread:read";
      hostId: string;
      threadId: string;
    }
  | {
      type: "turn:start";
      hostId: string;
      threadId?: string | null;
      input: string;
      cwd?: string | null;
      model?: string | null;
      approvalPolicy?: ApprovalPolicy | null;
      sandbox?: SandboxMode | null;
    }
  | {
      type: "turn:steer";
      hostId: string;
      threadId: string;
      input: string;
    }
  | {
      type: "turn:interrupt";
      hostId: string;
      threadId: string;
      turnId?: string | null;
    };

export interface RelayEnvelope {
  alg: "A256GCM";
  iv: string;
  ciphertext: string;
}

export interface RelaySessionSummary {
  id: string;
  hostId: string;
  browserDeviceId: string;
  browserName: string;
  createdAt: string;
  agentPublicKey: JsonWebKey;
}

export type SecureRelayPayload =
  | {
      kind: "request";
      requestId: string;
      command: AgentCommand;
    }
  | {
      kind: "response";
      requestId: string;
      ok: boolean;
      data?: unknown;
      error?: string;
    }
  | {
      kind: "event";
      event: CodexRelayEvent;
    };

export type AgentOutboundMessage =
  | {
      type: "agent:hello";
      hostId: string;
      hostSecret: string;
      displayName: string;
      platform: string;
      agentVersion: string;
    }
  | {
      type: "agent:pairing:create";
    }
  | {
      type: "agent:session:ready";
      requestId: string;
      session: RelaySessionSummary;
    }
  | {
      type: "agent:session:message";
      sessionId: string;
      body: RelayEnvelope;
    }
  | {
      type: "agent:response";
      requestId: string;
      ok: boolean;
      data?: unknown;
      error?: string;
    }
  | {
      type: "agent:event";
      event: CodexRelayEvent;
    };

export type AgentInboundMessage =
  | {
      type: "agent:hello:ack";
      host: HostSummary;
    }
  | {
      type: "agent:pairing:created";
      token: string;
      expiresAt: string;
      payload: string;
    }
  | {
      type: "agent:pairing:claimed";
      host: HostSummary;
    }
  | {
      type: "agent:session:init";
      requestId: string;
      hostId: string;
      browserDevice: BrowserDeviceSummary;
      browserPublicKey: JsonWebKey;
    }
  | {
      type: "agent:session:message";
      sessionId: string;
      body: RelayEnvelope;
    }
  | {
      type: "agent:request";
      requestId: string;
      command: AgentCommand;
    }
  | {
      type: "agent:error";
      message: string;
    };

export type BrowserOutboundMessage =
  | {
      type: "browser:subscribe";
      token: string;
    }
  | {
      type: "host:list";
      requestId: string;
    }
  | {
      type: "host:session:init";
      requestId: string;
      hostId: string;
      browserDeviceId: string;
      browserName: string;
      browserPublicKey: JsonWebKey;
    }
  | {
      type: "session:message";
      hostId: string;
      sessionId: string;
      body: RelayEnvelope;
    }
  | {
      type: "host:threads:list";
      requestId: string;
      hostId: string;
    }
  | {
      type: "host:thread:read";
      requestId: string;
      hostId: string;
      threadId: string;
    }
  | {
      type: "host:turn:start";
      requestId: string;
      hostId: string;
      threadId?: string | null;
      input: string;
      cwd?: string | null;
      model?: string | null;
      approvalPolicy?: ApprovalPolicy | null;
      sandbox?: SandboxMode | null;
    }
  | {
      type: "host:turn:steer";
      requestId: string;
      hostId: string;
      threadId: string;
      input: string;
    }
  | {
      type: "host:turn:interrupt";
      requestId: string;
      hostId: string;
      threadId: string;
      turnId?: string | null;
    };

export type BrowserInboundMessage =
  | {
      type: "browser:ready";
      user: UserProfile;
    }
  | {
      type: "host:list";
      hosts: HostSummary[];
    }
  | {
      type: "host:status";
      host: HostSummary;
    }
  | {
      type: "session:ready";
      requestId: string;
      session: RelaySessionSummary;
    }
  | {
      type: "session:message";
      hostId: string;
      sessionId: string;
      body: RelayEnvelope;
    }
  | {
      type: "response";
      requestId: string;
      ok: boolean;
      data?: unknown;
      error?: string;
    }
  | {
      type: "codex:event";
      hostId: string;
      event: CodexRelayEvent;
    }
  | {
      type: "browser:error";
      message: string;
    };

function joinTextParts(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object" && "text" in part) {
        return String((part as { text?: unknown }).text || "");
      }
      return "";
    })
    .join("");
}

function stringifyDetail(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function createRequestId(prefix = "req"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function normalizeTimelineItem(item: Record<string, unknown>): TimelineItem {
  const type = String(item.type || "event");
  const id = String(item.id || createRequestId("item"));

  if (type === "userMessage") {
    return {
      kind: "user-message",
      id,
      text: joinTextParts(item.content),
    };
  }

  if (type === "agentMessage") {
    return {
      kind: "assistant-message",
      id,
      text: String(item.text || ""),
      phase: item.phase ? String(item.phase) : null,
    };
  }

  if (type === "reasoning") {
    return {
      kind: "reasoning",
      id,
      text: joinTextParts(item.summary) || stringifyDetail(item.content),
    };
  }

  if (type === "commandExecution") {
    return {
      kind: "command",
      id,
      title: String(item.command || item.title || "Command"),
      output: stringifyDetail(item.output || item.stdout || item.stderr),
    };
  }

  if (type === "toolCall") {
    return {
      kind: "tool",
      id,
      title: String(item.title || item.name || item.toolName || "Tool"),
      output: stringifyDetail(item.output || item.result),
    };
  }

  if (type === "fileChange") {
    return {
      kind: "file-change",
      id,
      title: String(item.path || item.filePath || item.title || "File change"),
      output: stringifyDetail(item.diff || item.patch || item.output),
    };
  }

  return {
    kind: "event",
    id,
    label: type,
    detail: stringifyDetail(item),
  };
}

export function normalizeTurnSnapshot(turn: Record<string, unknown>): TurnSnapshot {
  const items = Array.isArray(turn.items) ? turn.items : [];

  return {
    id: String(turn.id || ""),
    status: String(turn.status || "idle"),
    error: turn.error ? String(turn.error) : null,
    items: items.map((item) => normalizeTimelineItem(item as Record<string, unknown>)),
  };
}

export function normalizeThreadSummary(thread: Record<string, unknown>): ThreadSummary {
  const status =
    thread.status && typeof thread.status === "object" && "type" in thread.status
      ? String((thread.status as { type?: unknown }).type || "idle")
      : String(thread.status || "idle");

  return {
    id: String(thread.id || ""),
    preview: String(thread.preview || ""),
    name: thread.name ? String(thread.name) : null,
    cwd: thread.cwd ? String(thread.cwd) : null,
    updatedAt: Number(thread.updatedAt || 0),
    createdAt: Number(thread.createdAt || 0),
    status,
    source: thread.source ? String(thread.source) : null,
  };
}

export function normalizeThreadSnapshot(thread: Record<string, unknown>): ThreadSnapshot {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];

  return {
    ...normalizeThreadSummary(thread),
    turns: turns.map((turn) => normalizeTurnSnapshot(turn as Record<string, unknown>)),
  };
}

export function normalizeRelayEventToTimelineItem(event: CodexRelayEvent): TimelineItem {
  if (event.kind === "log") {
    return {
      kind: "event",
      id: createRequestId("log"),
      label: event.level,
      detail: event.message,
    };
  }

  const params = event.notification.params || {};
  const maybeItem = params.item;
  if (maybeItem && typeof maybeItem === "object" && !Array.isArray(maybeItem)) {
    return normalizeTimelineItem(maybeItem as Record<string, unknown>);
  }

  if (event.notification.method === "item/delta" && typeof params.delta === "string") {
    return {
      kind: "assistant-message",
      id: createRequestId("delta"),
      text: params.delta,
      phase: "stream",
    };
  }

  return {
    kind: "event",
    id: createRequestId("evt"),
    label: event.notification.method,
    detail: stringifyDetail(params),
  };
}

export type ApprovalPolicy = "never" | "on-request" | "untrusted";
export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type ServiceTier = "fast";
export type CollaborationMode = "default" | "plan";

export interface ThreadGitInfo {
  branch: string | null;
  sha: string | null;
  originUrl: string | null;
}

export interface ModelReasoningOption {
  reasoningEffort: ReasoningEffort;
  description: string;
}

export interface ModelOption {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportsPersonality: boolean;
  isDefault: boolean;
  inputModalities: string[];
  defaultReasoningEffort: ReasoningEffort | null;
  supportedReasoningEfforts: ModelReasoningOption[];
  upgrade: string | null;
}

export interface CollaborationModeOption {
  name: string;
  mode: string;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
}

export interface RuntimeAccountSummary {
  accountType: string | null;
  requiresOpenaiAuth: boolean;
}

export interface RuntimeConfigResult {
  models: ModelOption[];
  collaborationModes: CollaborationModeOption[];
  account: RuntimeAccountSummary | null;
  rateLimitsError: string | null;
}

export interface GitBranchSummary {
  name: string;
  current: boolean;
}

export interface GitInspectResult {
  cwd: string | null;
  root: string | null;
  branch: string | null;
  clean: boolean;
  ahead: number;
  behind: number;
  branches: GitBranchSummary[];
  statusText: string;
  diffText: string;
}

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
  path: string | null;
  updatedAt: number;
  createdAt: number;
  status: string;
  source: string | null;
  model: string | null;
  modelProvider: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  parentThreadId: string | null;
  forkedFromThreadId: string | null;
  gitInfo: ThreadGitInfo | null;
}

export interface UserAttachmentSummary {
  kind: "image" | "file";
  label: string;
}

export type TimelineItem =
  | {
      kind: "user-message";
      id: string;
      text: string;
      attachments?: UserAttachmentSummary[];
    }
  | {
      kind: "assistant-message";
      id: string;
      text: string;
      phase: string | null;
    }
  | {
      kind: "plan";
      id: string;
      text: string;
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

export interface ThreadsListResult {
  threads: ThreadSummary[];
}

export interface ThreadReadResult {
  thread: ThreadSnapshot;
}

export interface TurnStartResult {
  threadId: string;
  turnId: string | null;
}

export interface TurnSteerResult {
  turnId: string | null;
}

export interface ThreadMutationResult {
  ok: true;
}

export interface ThreadForkResult {
  thread: ThreadSnapshot;
}

export interface ReviewStartResult {
  threadId: string;
  turnId: string | null;
}

export type BrowserAttachment =
  | {
      kind: "text";
      name: string;
      mimeType: string;
      content: string;
    }
  | {
      kind: "image";
      name: string;
      mimeType: string;
      url: string;
    }
  | {
      kind: "binary";
      name: string;
      mimeType: string;
    };

export interface RelayEventTarget {
  threadId: string | null;
  turnId: string | null;
  itemId: string | null;
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
      archived?: boolean | null;
    }
  | {
      type: "thread:read";
      hostId: string;
      threadId: string;
    }
  | {
      type: "runtime:config";
      hostId: string;
    }
  | {
      type: "thread:rename";
      hostId: string;
      threadId: string;
      name: string;
    }
  | {
      type: "thread:archive";
      hostId: string;
      threadId: string;
    }
  | {
      type: "thread:unarchive";
      hostId: string;
      threadId: string;
    }
  | {
      type: "thread:fork";
      hostId: string;
      threadId: string;
      cwd?: string | null;
      model?: string | null;
      modelProvider?: string | null;
      sandbox?: SandboxMode | null;
      serviceTier?: ServiceTier | null;
    }
  | {
      type: "turn:start";
      hostId: string;
      threadId?: string | null;
      input: string;
      attachments?: BrowserAttachment[] | null;
      cwd?: string | null;
      model?: string | null;
      reasoningEffort?: ReasoningEffort | null;
      approvalPolicy?: ApprovalPolicy | null;
      sandbox?: SandboxMode | null;
      serviceTier?: ServiceTier | null;
      collaborationMode?: CollaborationMode | null;
    }
  | {
      type: "turn:steer";
      hostId: string;
      threadId: string;
      turnId: string;
      input: string;
      attachments?: BrowserAttachment[] | null;
      collaborationMode?: CollaborationMode | null;
    }
  | {
      type: "turn:interrupt";
      hostId: string;
      threadId: string;
      turnId?: string | null;
    }
  | {
      type: "review:start";
      hostId: string;
      threadId: string;
      target: "uncommitted-changes";
      baseBranch?: string | null;
    }
  | {
      type: "git:inspect";
      hostId: string;
      cwd: string;
    }
  | {
      type: "git:commit";
      hostId: string;
      cwd: string;
      message?: string | null;
    }
  | {
      type: "git:push";
      hostId: string;
      cwd: string;
    }
  | {
      type: "git:pull";
      hostId: string;
      cwd: string;
    }
  | {
      type: "git:checkout";
      hostId: string;
      cwd: string;
      branch: string;
    }
  | {
      type: "git:create-branch";
      hostId: string;
      cwd: string;
      branch: string;
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
      attachments?: BrowserAttachment[] | null;
      cwd?: string | null;
      model?: string | null;
      reasoningEffort?: ReasoningEffort | null;
      approvalPolicy?: ApprovalPolicy | null;
      sandbox?: SandboxMode | null;
    }
  | {
      type: "host:turn:steer";
      requestId: string;
      hostId: string;
      threadId: string;
      turnId: string;
      input: string;
      attachments?: BrowserAttachment[] | null;
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

function readUserAttachmentSummaries(content: unknown): UserAttachmentSummary[] {
  if (!Array.isArray(content)) {
    return [];
  }

  const summaries: UserAttachmentSummary[] = [];

  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }

    const type = typeof (part as { type?: unknown }).type === "string" ? String((part as { type?: unknown }).type) : "";
    if (type === "image") {
      summaries.push({ kind: "image", label: "Image attached" });
      continue;
    }

    if (type === "localImage") {
      summaries.push({ kind: "image", label: "Local image attached" });
      continue;
    }

    if (type === "text") {
      continue;
    }

    summaries.push({ kind: "file", label: `${type || "Attachment"} attached` });
  }

  return summaries;
}

function hasStructuredContent(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
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

function readString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function mergeFileChangeOutput(changes: unknown): string {
  if (!Array.isArray(changes)) {
    return "";
  }

  return changes
    .map((change) => {
      if (!change || typeof change !== "object") {
        return "";
      }

      const path = readString((change as { path?: unknown }).path) || "file";
      const diff = stringifyDetail((change as { diff?: unknown }).diff);
      return diff ? `${path}\n${diff}` : path;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function createRequestId(prefix = "req"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function parsePairingQrPayload(value: string): PairingQrPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<PairingQrPayload>;
    if (
      parsed.v === 1 &&
      parsed.kind === "pocket-codex-pairing" &&
      typeof parsed.token === "string" &&
      typeof parsed.hostId === "string" &&
      typeof parsed.displayName === "string" &&
      typeof parsed.expiresAt === "string"
    ) {
      return parsed as PairingQrPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeTimelineItem(item: Record<string, unknown>): TimelineItem {
  const type = String(item.type || "event");
  const id = String(item.id || createRequestId("item"));

  if (type === "userMessage") {
    return {
      kind: "user-message",
      id,
      text: joinTextParts(item.content),
      attachments: readUserAttachmentSummaries(item.content),
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

  if (type === "plan") {
    return {
      kind: "plan",
      id,
      text: String(item.text || ""),
    };
  }

  if (type === "reasoning") {
    const summaryText = joinTextParts(item.summary);
    const contentText = joinTextParts(item.content);
    return {
      kind: "reasoning",
      id,
      text:
        summaryText ||
        contentText ||
        (hasStructuredContent(item.content) ? stringifyDetail(item.content) : ""),
    };
  }

  if (type === "commandExecution") {
    return {
      kind: "command",
      id,
      title: String(item.command || item.title || "Command"),
      output: stringifyDetail(item.aggregatedOutput || item.output || item.stdout || item.stderr),
    };
  }

  if (type === "fileChange") {
    const mergedOutput = mergeFileChangeOutput(item.changes);
    const firstChange =
      Array.isArray(item.changes) && item.changes[0] && typeof item.changes[0] === "object"
        ? (item.changes[0] as { path?: unknown })
        : null;

    return {
      kind: "file-change",
      id,
      title: readString(firstChange?.path) || String(item.path || item.filePath || item.title || "File change"),
      output: mergedOutput || stringifyDetail(item.diff || item.patch || item.output),
    };
  }

  if (type === "mcpToolCall") {
    return {
      kind: "tool",
      id,
      title: `${String(item.server || "mcp")}/${String(item.tool || "tool")}`,
      output: stringifyDetail(item.result || item.error || item.arguments),
    };
  }

  if (type === "dynamicToolCall") {
    return {
      kind: "tool",
      id,
      title: String(item.tool || "Dynamic tool"),
      output: stringifyDetail(item.contentItems || item.arguments),
    };
  }

  if (type === "collabAgentToolCall") {
    return {
      kind: "tool",
      id,
      title: `Collab ${String(item.tool || "agent")}`,
      output: stringifyDetail(item.prompt || item.agentsStates || item.receiverThreadIds),
    };
  }

  if (type === "webSearch") {
    return {
      kind: "tool",
      id,
      title: "Web search",
      output: String(item.query || ""),
    };
  }

  if (type === "imageGeneration") {
    return {
      kind: "tool",
      id,
      title: "Image generation",
      output: stringifyDetail(item.result || item.savedPath),
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
    error: turn.error ? stringifyDetail(turn.error) : null,
    items: items.map((item) => normalizeTimelineItem(item as Record<string, unknown>)),
  };
}

export function normalizeThreadSummary(thread: Record<string, unknown>): ThreadSummary {
  const status =
    thread.status && typeof thread.status === "object" && "type" in thread.status
      ? String((thread.status as { type?: unknown }).type || "idle")
      : String(thread.status || "idle");
  const gitInfo =
    thread.gitInfo && typeof thread.gitInfo === "object" && !Array.isArray(thread.gitInfo)
      ? (thread.gitInfo as Record<string, unknown>)
      : null;

  return {
    id: String(thread.id || ""),
    preview: String(thread.preview || ""),
    name: thread.name ? String(thread.name) : null,
    cwd: thread.cwd ? String(thread.cwd) : null,
    path: thread.path ? String(thread.path) : null,
    updatedAt: Number(thread.updatedAt || 0),
    createdAt: Number(thread.createdAt || 0),
    status,
    source: thread.source ? String(thread.source) : null,
    model: thread.model ? String(thread.model) : null,
    modelProvider: thread.modelProvider ? String(thread.modelProvider) : null,
    agentNickname: thread.agentNickname ? String(thread.agentNickname) : null,
    agentRole: thread.agentRole ? String(thread.agentRole) : null,
    parentThreadId: thread.parentThreadId ? String(thread.parentThreadId) : null,
    forkedFromThreadId: thread.forkedFromThreadId ? String(thread.forkedFromThreadId) : null,
    gitInfo: gitInfo
      ? {
          branch: readString(gitInfo.branch),
          sha: readString(gitInfo.sha),
          originUrl: readString(gitInfo.originUrl),
        }
      : null,
  };
}

export function normalizeThreadSnapshot(thread: Record<string, unknown>): ThreadSnapshot {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];

  return {
    ...normalizeThreadSummary(thread),
    turns: turns.map((turn) => normalizeTurnSnapshot(turn as Record<string, unknown>)),
  };
}

export function getRelayEventTarget(event: CodexRelayEvent): RelayEventTarget {
  if (event.kind === "log") {
    return {
      threadId: null,
      turnId: null,
      itemId: null,
    };
  }

  const params = event.notification.params || {};
  const thread = params.thread && typeof params.thread === "object" ? (params.thread as { id?: unknown }) : null;
  const turn = params.turn && typeof params.turn === "object" ? (params.turn as { id?: unknown; threadId?: unknown }) : null;
  const item = params.item && typeof params.item === "object" ? (params.item as { id?: unknown }) : null;

  return {
    threadId: readString(params.threadId) || readString(turn?.threadId) || readString(thread?.id),
    turnId: readString(params.turnId) || readString(turn?.id),
    itemId: readString(params.itemId) || readString(item?.id),
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

  const { method, params } = event.notification;
  const target = getRelayEventTarget(event);
  const maybeItem = params.item;

  if (maybeItem && typeof maybeItem === "object" && !Array.isArray(maybeItem)) {
    return normalizeTimelineItem(maybeItem as Record<string, unknown>);
  }

  if (method === "item/agentMessage/delta" && typeof params.delta === "string") {
    return {
      kind: "assistant-message",
      id: target.itemId || createRequestId("delta"),
      text: params.delta,
      phase: "stream",
    };
  }

  if (method === "item/plan/delta" && typeof params.delta === "string") {
    return {
      kind: "plan",
      id: target.itemId || createRequestId("plan"),
      text: params.delta,
    };
  }

  if (method === "item/commandExecution/outputDelta" && typeof params.delta === "string") {
    return {
      kind: "command",
      id: target.itemId || createRequestId("cmd"),
      title: "Command",
      output: params.delta,
    };
  }

  if (method === "item/fileChange/outputDelta" && typeof params.delta === "string") {
    return {
      kind: "file-change",
      id: target.itemId || createRequestId("patch"),
      title: "File change",
      output: params.delta,
    };
  }

  if (
    (method === "item/reasoning/summaryTextDelta" || method === "item/reasoning/textDelta") &&
    typeof params.delta === "string"
  ) {
    return {
      kind: "reasoning",
      id: target.itemId || createRequestId("reasoning"),
      text: params.delta,
    };
  }

  return {
    kind: "event",
    id: createRequestId("evt"),
    label: method,
    detail: stringifyDetail(params),
  };
}

"use client";

import {
  createDeviceId,
  decryptRelayMessage,
  deriveSessionKey,
  encryptRelayMessage,
  generateSessionKeyPair,
} from "@pocket-codex/crypto";
import {
  createRequestId,
  type CollaborationMode,
  getRelayEventTarget,
  type ModelOption,
  normalizeRelayEventToTimelineItem,
  parsePairingQrPayload,
  type AgentCommand,
  type ApprovalPolicy,
  type BrowserDeviceSummary,
  type BrowserInboundMessage,
  type BrowserOutboundMessage,
  type CodexRelayEvent,
  type HostSummary,
  type ReasoningEffort,
  type ReviewStartResult,
  type SandboxMode,
  type SecureRelayPayload,
  type ServiceTier,
  type ThreadReadResult,
  type ThreadForkResult,
  type ThreadMutationResult,
  type ThreadSnapshot,
  type ThreadSummary,
  type ThreadsListResult,
  type TimelineItem,
  type TurnSnapshot,
  type TurnStartResult,
  type TurnSteerResult,
  type UserAttachmentSummary,
  type UserProfile,
  type RuntimeConfigResult,
} from "@pocket-codex/protocol";
import {
  startTransition,
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  ChatInput,
  EmptyConversation,
  LiveTurnIndicator,
  MessageBubble,
} from "./pocket-codex-chat";
import { Icons } from "./pocket-codex-icons";
import { AppShell, ChatLayout, PanelModal, Sidebar, TopBar } from "./pocket-codex-shell";
import { ActionButton, StatusBadge } from "./pocket-codex-ui";

const GATEWAY_HTTP_URL = process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL || "http://localhost:8787";
const GATEWAY_WS_URL = process.env.NEXT_PUBLIC_GATEWAY_WS_URL || "ws://localhost:8787/ws/browser";

const AUTH_TOKEN_KEY = "pocket-codex.auth-token";
const BROWSER_DEVICE_ID_KEY = "pocket-codex.browser-device-id";
const BROWSER_NAME_KEY = "pocket-codex.browser-name";
const SELECTED_HOST_KEY = "pocket-codex.selected-host-id";
const NOTIFICATIONS_KEY = "pocket-codex.notifications";
const THEME_KEY = "pocket-codex.theme";

const TERMINAL_TURN_STATUSES = new Set([
  "aborted",
  "cancelled",
  "completed",
  "error",
  "errored",
  "failed",
  "finished",
  "interrupted",
  "rejected",
  "stopped",
]);

const NON_RENDERED_RELAY_METHODS = new Set([
  "account/rateLimits/updated",
  "thread/tokenUsage/updated",
  "thread/status/changed",
  "thread/started",
  "turn/started",
  "turn/completed",
  "turn/failed",
]);

const AUTH_STAGE_PILLS = [
  "Encrypted relay",
  "Local runtime",
  "Trusted devices",
];

const AUTH_STAGE_FEATURES = [
  {
    id: "pair",
    title: "Pair Once",
    detail: "Bind a browser to your local host with a short-lived QR payload and keep the runtime on your machine.",
  },
  {
    id: "relay",
    title: "Relay Securely",
    detail: "The gateway handles control-plane data while session keys are negotiated between browser and agent.",
  },
  {
    id: "threads",
    title: "Keep Threads Local",
    detail: "Conversation history and workspace context stay with Codex instead of being copied into the product database.",
  },
];

type AuthMode = "login" | "register";
type ConnectionState = "idle" | "connecting" | "authenticating" | "connected" | "reconnecting" | "error";
type SecureState = "idle" | "handshaking" | "ready" | "error";
type PanelMode = "setup" | "controls" | "new-chat" | "rename";
type ThemeMode = "dark" | "light";

type SecureSessionState = {
  id: string;
  hostId: string;
  key: CryptoKey;
  createdAt: string;
  browserDeviceId: string;
  browserName: string;
};

type PendingSecureRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timerId: number;
};

type PendingSessionInit = {
  requestId: string;
  hostId: string;
  privateKey: CryptoKey;
  timerId: number;
};

type AuthResponse = {
  token: string;
  user: UserProfile;
};

type MeResponse = {
  user: UserProfile;
  hosts: HostSummary[];
  browserDevices: BrowserDeviceSummary[];
};

type PairingClaimResponse = {
  host: HostSummary;
  browserDevice: BrowserDeviceSummary | null;
};

type AttachmentDraft = {
  id: string;
  name: string;
  kind: "text" | "image" | "binary";
  mimeType: string;
  textContent?: string | null;
  url?: string | null;
};

type QueuedDraft = {
  id: string;
  input: string;
  text: string;
  attachmentSummaries: UserAttachmentSummary[];
  preparedAttachments: Array<
    | { kind: "text"; name: string; mimeType: string; content: string }
    | { kind: "image"; name: string; mimeType: string; url: string }
    | { kind: "binary"; name: string; mimeType: string }
  >;
  collaborationMode: CollaborationMode | null;
};

function attachmentSummaryLabel(attachment: AttachmentDraft): UserAttachmentSummary {
  if (attachment.kind === "image") {
    return { kind: "image", label: attachment.name };
  }
  return { kind: "file", label: attachment.name };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function buildBrowserName(): string {
  if (typeof navigator === "undefined") {
    return "Pocket Codex Browser";
  }
  return `Pocket Codex Browser · ${navigator.platform || "Web"}`;
}

function summarizeAttachments(attachments: AttachmentDraft[]): string {
  if (attachments.length === 0) {
    return "";
  }

  if (attachments.length === 1) {
    const attachment = attachments[0] as AttachmentDraft;
    return `Attached ${attachment.kind}: ${attachment.name}`;
  }

  return `Attached ${attachments.length} files`;
}

function formatTime(value: string | number | null | undefined): string {
  if (value == null) {
    return "Never";
  }
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function modelTitle(model: string): string {
  switch (model.trim().toLowerCase()) {
    case "gpt-5.4":
      return "GPT-5.4";
    case "gpt-5.3-codex":
      return "GPT-5.3-Codex";
    case "gpt-5.2-codex":
      return "GPT-5.2-Codex";
    case "gpt-5.2":
      return "GPT-5.2";
    case "gpt-5.1-codex-max":
      return "GPT-5.1-Codex-Max";
    case "gpt-5.1-codex-mini":
      return "GPT-5.1-Codex-Mini";
    default:
      return model;
  }
}

function reasoningLabel(effort: ReasoningEffort): string {
  switch (effort) {
    case "minimal":
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Extra High";
    case "none":
      return "None";
    default:
      return effort;
  }
}

function accountLabel(accountType: string | null | undefined): string {
  if (!accountType) {
    return "Unknown account";
  }

  if (accountType === "apiKey") {
    return "API key";
  }

  return accountType;
}

function threadMetaSummary(thread: ThreadSummary): string | null {
  const parts = [
    thread.model ? modelTitle(thread.model) : thread.modelProvider,
    thread.gitInfo?.branch || null,
    thread.forkedFromThreadId ? "Forked" : null,
    thread.parentThreadId ? "Subagent" : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" · ") : null;
}

function describeThreadFork(): string {
  return "Fork duplicates the current conversation into a new thread so you can continue along a separate path without overwriting this one.";
}

function themeLabel(theme: ThemeMode): string {
  return theme === "light" ? "Light" : "Dark";
}

function truncateText(value: string, limit = 90): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}...`;
}

function describeThreadGroupDirectory(cwd: string, archived?: boolean): {
  label: string;
  sublabel: string | null;
} {
  if (archived) {
    return {
      label: "Archived",
      sublabel: "Stored conversations",
    };
  }

  const trimmed = cwd.trim();
  if (!trimmed || trimmed === "No directory") {
    return {
      label: "No directory",
      sublabel: "Threads without a working directory",
    };
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) {
    return {
      label: trimmed,
      sublabel: null,
    };
  }

  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return {
      label: normalized,
      sublabel: null,
    };
  }

  const label = normalized.slice(lastSlash + 1) || normalized;
  let sublabel = normalized.slice(0, lastSlash);

  if (!sublabel && normalized.startsWith("/")) {
    sublabel = "/";
  }

  return {
    label,
    sublabel: sublabel || null,
  };
}

function shouldRenderRelayEvent(event: CodexRelayEvent): boolean {
  if (event.kind === "log") {
    return event.level === "error";
  }
  return !NON_RENDERED_RELAY_METHODS.has(event.notification.method);
}

function itemTextValue(item: TimelineItem): string {
  switch (item.kind) {
    case "assistant-message":
    case "plan":
    case "reasoning":
    case "user-message":
      return item.text;
    case "command":
    case "tool":
    case "file-change":
      return item.output;
    case "event":
      return `${item.label} ${item.detail}`.trim();
    default:
      return "";
  }
}

async function toAttachmentDraft(file: File): Promise<AttachmentDraft> {
  if (file.type.startsWith("image/")) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image file."));
      reader.readAsDataURL(file);
    });

    return {
      id: createRequestId("att"),
      name: file.name,
      kind: "image",
      mimeType: file.type,
      url: dataUrl,
    };
  }

  throw new Error("Pocket Codex currently supports image attachments only.");
}

function latestPreviewFromTurns(turns: TurnSnapshot[]): string {
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    if (!turn) {
      continue;
    }

    for (let itemIndex = turn.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = turn.items[itemIndex];
      if (!item) {
        continue;
      }
      const text = itemTextValue(item).trim();
      if (text) {
        return truncateText(text, 120);
      }
    }
  }

  return "";
}

function normalizeTurnStatusValue(value: unknown): string | null {
  if (typeof value === "string" && value) {
    return value;
  }
  if (value && typeof value === "object" && "type" in value) {
    const type = (value as { type?: unknown }).type;
    return typeof type === "string" && type ? type : null;
  }
  return null;
}

function extractTurnStatusFromEvent(event: CodexRelayEvent): string | null {
  if (event.kind === "log") {
    return null;
  }

  const { method, params } = event.notification;
  const directStatus = normalizeTurnStatusValue(params.status);
  if (directStatus) {
    return directStatus;
  }

  if (params.turn && typeof params.turn === "object") {
    const nestedStatus = normalizeTurnStatusValue((params.turn as { status?: unknown }).status);
    if (nestedStatus) {
      return nestedStatus;
    }
  }

  if (method.endsWith("/completed")) {
    return "completed";
  }
  if (method.endsWith("/failed")) {
    return "failed";
  }
  if (method.includes("interrupt")) {
    return "interrupted";
  }
  if (method.includes("start") || method.includes("delta")) {
    return "running";
  }

  return null;
}

function extractTurnErrorFromEvent(event: CodexRelayEvent): string | null {
  if (event.kind === "log") {
    return event.level === "error" ? event.message : null;
  }
  const error = event.notification.params.error;
  if (typeof error === "string" && error) {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" && message ? message : null;
  }
  return null;
}

function mergeTimelineItem(existing: TimelineItem, incoming: TimelineItem): TimelineItem {
  if (existing.kind !== incoming.kind) {
    return incoming;
  }

  if (incoming.kind === "assistant-message" && existing.kind === "assistant-message") {
    return {
      ...incoming,
      text: `${existing.text}${incoming.text}`,
      phase: incoming.phase || existing.phase,
    };
  }

  if (incoming.kind === "reasoning" && existing.kind === "reasoning") {
    return {
      ...incoming,
      text: `${existing.text}${incoming.text}`,
    };
  }

  if (incoming.kind === "plan" && existing.kind === "plan") {
    return {
      ...incoming,
      text: `${existing.text}${incoming.text}`,
    };
  }

  if (incoming.kind === "command" && existing.kind === "command") {
    return {
      ...incoming,
      output: `${existing.output}${incoming.output}`,
    };
  }

  if (incoming.kind === "file-change" && existing.kind === "file-change") {
    return {
      ...incoming,
      output: `${existing.output}${incoming.output}`,
    };
  }

  if (incoming.kind === "tool" && existing.kind === "tool") {
    return {
      ...incoming,
      output: incoming.output || existing.output,
    };
  }

  if (incoming.kind === "event" && existing.kind === "event") {
    return {
      ...incoming,
      detail: incoming.detail || existing.detail,
    };
  }

  return incoming;
}

function upsertTimelineItem(items: TimelineItem[], incoming: TimelineItem): TimelineItem[] {
  const index = items.findIndex((candidate) => candidate.id === incoming.id);
  if (index === -1) {
    return [...items, incoming];
  }

  const next = [...items];
  next[index] = mergeTimelineItem(items[index] as TimelineItem, incoming);
  return next;
}

function applyRelayEventToSnapshot(snapshot: ThreadSnapshot, event: CodexRelayEvent): ThreadSnapshot {
  const target = getRelayEventTarget(event);
  const shouldRender = shouldRenderRelayEvent(event);
  const incomingItem = shouldRender ? normalizeRelayEventToTimelineItem(event) : null;
  const turns = [...snapshot.turns];

  let turnIndex = target.turnId ? turns.findIndex((turn) => turn.id === target.turnId) : turns.length - 1;
  if (turnIndex < 0) {
    turns.push({
      id: target.turnId || createRequestId("turn"),
      status: extractTurnStatusFromEvent(event) || "running",
      error: extractTurnErrorFromEvent(event),
      items: [],
    });
    turnIndex = turns.length - 1;
  }

  const currentTurn = turns[turnIndex] as TurnSnapshot;
  const nextTurn: TurnSnapshot = {
    ...currentTurn,
    status: extractTurnStatusFromEvent(event) || currentTurn.status,
    error: extractTurnErrorFromEvent(event) || currentTurn.error,
    items: incomingItem ? upsertTimelineItem(currentTurn.items, incomingItem) : currentTurn.items,
  };

  turns[turnIndex] = nextTurn;

  return {
    ...snapshot,
    status: nextTurn.status || snapshot.status,
    updatedAt: Date.now(),
    preview: incomingItem ? latestPreviewFromTurns(turns) || snapshot.preview : snapshot.preview,
    turns,
  };
}

function appendOptimisticUserMessage(
  snapshot: ThreadSnapshot,
  text: string,
  attachments?: UserAttachmentSummary[],
): ThreadSnapshot {
  const turns = [...snapshot.turns];
  const lastTurn = turns.at(-1);

  if (!lastTurn || TERMINAL_TURN_STATUSES.has(lastTurn.status.toLowerCase())) {
    turns.push({
      id: createRequestId("local-turn"),
      status: "running",
      error: null,
      items: [
        {
          kind: "user-message",
          id: createRequestId("local-item"),
          text,
          attachments,
        },
      ],
    });
  } else {
    turns[turns.length - 1] = {
      ...lastTurn,
      items: [
        ...lastTurn.items,
        {
          kind: "user-message",
          id: createRequestId("local-item"),
          text,
          attachments,
        },
      ],
    };
  }

  return {
    ...snapshot,
    preview: truncateText(text, 120),
    updatedAt: Date.now(),
    turns,
  };
}

function getActiveTurn(snapshot: ThreadSnapshot | null): TurnSnapshot | null {
  if (!snapshot) {
    return null;
  }

  for (let index = snapshot.turns.length - 1; index >= 0; index -= 1) {
    const turn = snapshot.turns[index];
    if (turn && !TERMINAL_TURN_STATUSES.has(turn.status.toLowerCase())) {
      return turn;
    }
  }

  return null;
}

function getPendingTurnIndicatorMode(turn: TurnSnapshot | null): "thinking" | "tools" | "running" | null {
  if (!turn) {
    return null;
  }

  if (turn.items.some((item) => item.kind === "assistant-message" && item.text.trim())) {
    return null;
  }

  if (turn.items.some((item) => item.kind === "plan" && item.text.trim())) {
    return null;
  }

  if (turn.items.some((item) => item.kind === "reasoning" && item.text.trim())) {
    return null;
  }

  if (turn.items.some((item) => item.kind === "command" || item.kind === "file-change")) {
    return null;
  }

  if (turn.items.some((item) => item.kind === "reasoning")) {
    return "thinking";
  }

  if (turn.items.some((item) => item.kind === "tool")) {
    return "tools";
  }

  return "running";
}

function hostStatusLabel(host: HostSummary | null): string {
  if (!host) {
    return "No host";
  }
  if (!host.paired) {
    return "Waiting for pairing";
  }
  return host.online ? "Online" : "Offline";
}

async function requestJson<T>(path: string, init: RequestInit, token?: string | null): Promise<T> {
  const response = await fetch(`${GATEWAY_HTTP_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload as T;
}

export function PocketCodexApp() {
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pendingSecureRequestsRef = useRef(new Map<string, PendingSecureRequest>());
  const pendingSessionInitRef = useRef<PendingSessionInit | null>(null);
  const secureSessionRef = useRef<SecureSessionState | null>(null);
  const selectedHostIdRef = useRef<string | null>(null);
  const selectedThreadIdRef = useRef<string | null>(null);
  const browserNameRef = useRef("");
  const browserDeviceIdRef = useRef("");
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queueDispatchRef = useRef(false);
  const turnStatusRef = useRef<Record<string, string>>({});

  const [hydrated, setHydrated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [secureState, setSecureState] = useState<SecureState>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [hosts, setHosts] = useState<HostSummary[]>([]);
  const [browserDevices, setBrowserDevices] = useState<BrowserDeviceSummary[]>([]);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<ThreadSummary[]>([]);
  const [threadSnapshots, setThreadSnapshots] = useState<Record<string, ThreadSnapshot>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadSearch, setThreadSearch] = useState("");
  const [browserName, setBrowserName] = useState("Pocket Codex Browser");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [pairingInput, setPairingInput] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [composer, setComposer] = useState("");
  const [composerBusy, setComposerBusy] = useState(false);
  const [queuedDraftsByThread, setQueuedDraftsByThread] = useState<Record<string, QueuedDraft[]>>({});
  const [appError, setAppError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [model, setModel] = useState("gpt-5.4");
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [availableCollaborationModes, setAvailableCollaborationModes] = useState<Array<{ mode: string; name: string }>>([]);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [requiresOpenaiAuth, setRequiresOpenaiAuth] = useState(false);
  const [rateLimitsError, setRateLimitsError] = useState<string | null>(null);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [serviceTier, setServiceTier] = useState<ServiceTier | null>(null);
  const [collaborationMode, setCollaborationMode] = useState<CollaborationMode | null>(null);
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicy>("on-request");
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>("workspace-write");
  const [cwd, setCwd] = useState("");
  const [activePanel, setActivePanel] = useState<PanelMode | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    setHydrated(true);

    if (typeof window === "undefined") {
      return;
    }

    const storedToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
    const storedBrowserName = window.localStorage.getItem(BROWSER_NAME_KEY) || buildBrowserName();
    const storedBrowserDeviceId = window.localStorage.getItem(BROWSER_DEVICE_ID_KEY) || createDeviceId("browser");
    const storedHostId = window.localStorage.getItem(SELECTED_HOST_KEY);
    const storedNotifications = window.localStorage.getItem(NOTIFICATIONS_KEY) === "enabled";
    const storedTheme = window.localStorage.getItem(THEME_KEY);

    window.localStorage.setItem(BROWSER_NAME_KEY, storedBrowserName);
    window.localStorage.setItem(BROWSER_DEVICE_ID_KEY, storedBrowserDeviceId);

    browserNameRef.current = storedBrowserName;
    browserDeviceIdRef.current = storedBrowserDeviceId;
    selectedHostIdRef.current = storedHostId;

    setToken(storedToken);
    setBrowserName(storedBrowserName);
    setSelectedHostId(storedHostId);
    setNotificationsEnabled(storedNotifications);
    setTheme(storedTheme === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    browserNameRef.current = browserName;
    if (hydrated && typeof window !== "undefined") {
      window.localStorage.setItem(BROWSER_NAME_KEY, browserName);
    }
  }, [browserName, hydrated]);

  useEffect(() => {
    selectedHostIdRef.current = selectedHostId;
    if (hydrated && typeof window !== "undefined") {
      if (selectedHostId) {
        window.localStorage.setItem(SELECTED_HOST_KEY, selectedHostId);
      } else {
        window.localStorage.removeItem(SELECTED_HOST_KEY);
      }
    }
  }, [hydrated, selectedHostId]);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }, [hydrated, token]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(NOTIFICATIONS_KEY, notificationsEnabled ? "enabled" : "disabled");
  }, [hydrated, notificationsEnabled]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.pcTheme = theme;
  }, [hydrated, theme]);

  const selectedHost = useMemo(
    () => hosts.find((host) => host.id === selectedHostId) || null,
    [hosts, selectedHostId],
  );

  const selectedThread = useMemo(
    () => (selectedThreadId ? threadSnapshots[selectedThreadId] || null : null),
    [selectedThreadId, threadSnapshots],
  );

  const activeTurn = useMemo(() => getActiveTurn(selectedThread), [selectedThread]);
  const pendingTurnIndicatorMode = useMemo(() => getPendingTurnIndicatorMode(activeTurn), [activeTurn]);

  const pairingPreview = useMemo(() => parsePairingQrPayload(pairingInput.trim()), [pairingInput]);

  const flattenedTimeline = useMemo(() => {
    if (!selectedThread) {
      return [];
    }

    const items: TimelineItem[] = [];
    for (const turn of selectedThread.turns) {
      for (const item of turn.items) {
        if (item.kind === "tool") {
          continue;
        }

        if (item.kind === "reasoning" && !item.text.trim()) {
          continue;
        }

        items.push(item);
      }
      if (turn.error) {
        items.push({
          kind: "event",
          id: `${turn.id}_error`,
          label: "Error",
          detail: turn.error,
        });
      }
    }

    return items;
  }, [selectedThread]);

  const trustedBrowser = useMemo(
    () => browserDevices.find((device) => device.id === browserDeviceIdRef.current) || null,
    [browserDevices],
  );

  const threadSearchNeedle = useMemo(() => threadSearch.trim().toLowerCase(), [threadSearch]);

  const threadGroups = useMemo(() => {
    const grouped = new Map<
      string,
      Array<{
        id: string;
        label: string;
        preview: string;
        meta?: string | null;
        active: boolean;
      }>
    >();

    for (const thread of threads) {
      const searchable = [
        thread.name || "",
        thread.preview || "",
        thread.cwd || "",
        thread.modelProvider || "",
        thread.model || "",
        thread.gitInfo?.branch || "",
      ].join("\n").toLowerCase();

      if (threadSearchNeedle && !searchable.includes(threadSearchNeedle)) {
        continue;
      }

      const key = thread.cwd || "No directory";
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)?.push({
        id: thread.id,
        label: thread.name || truncateText(thread.preview || "New chat", 30),
        preview: thread.preview || "No preview yet",
        meta: threadMetaSummary(thread),
        active: selectedThreadId === thread.id,
      });
    }

    const liveGroups = Array.from(grouped.entries()).map(([cwdPath, groupedThreads]) => {
      const display = describeThreadGroupDirectory(cwdPath);
      return {
        cwd: cwdPath,
        label: display.label,
        sublabel: display.sublabel,
        threads: groupedThreads,
      };
    });

    const archivedMatches = archivedThreads
      .filter((thread) => {
        if (!threadSearchNeedle) {
          return true;
        }

        const searchable = [
          thread.name || "",
          thread.preview || "",
          thread.cwd || "",
          thread.modelProvider || "",
          thread.model || "",
          thread.gitInfo?.branch || "",
          "archived",
        ].join("\n").toLowerCase();

        return searchable.includes(threadSearchNeedle);
      })
      .map((thread) => ({
        id: thread.id,
        label: thread.name || truncateText(thread.preview || "Archived chat", 30),
        preview: thread.preview || "Stored locally",
        meta: threadMetaSummary(thread),
        active: selectedThreadId === thread.id,
      }));

    return archivedMatches.length > 0
      ? [
        ...liveGroups,
        {
          cwd: "Archived",
          archived: true,
          label: "Archived",
          sublabel: "Stored conversations",
          threads: archivedMatches,
        },
      ]
      : liveGroups;
  }, [archivedThreads, selectedThreadId, threadSearchNeedle, threads]);

  const queuedDrafts = useMemo(
    () => (selectedThreadId ? queuedDraftsByThread[selectedThreadId] || [] : []),
    [queuedDraftsByThread, selectedThreadId],
  );

  const selectedModelMeta = useMemo(
    () => availableModels.find((option) => option.model === model) || null,
    [availableModels, model],
  );

  const reasoningOptions = useMemo(() => {
    if (!selectedModelMeta || selectedModelMeta.supportedReasoningEfforts.length === 0) {
      return [
        { effort: "minimal" as const, label: "Low" },
        { effort: "low" as const, label: "Low" },
        { effort: "medium" as const, label: "Medium" },
        { effort: "high" as const, label: "High" },
        { effort: "xhigh" as const, label: "Extra High" },
      ];
    }

    return selectedModelMeta.supportedReasoningEfforts.map((option) => ({
      effort: option.reasoningEffort,
      label: reasoningLabel(option.reasoningEffort),
    }));
  }, [selectedModelMeta]);

  useEffect(() => {
    if (reasoningOptions.some((option) => option.effort === reasoningEffort)) {
      return;
    }

    const fallback = selectedModelMeta?.defaultReasoningEffort || reasoningOptions[0]?.effort || "medium";
    setReasoningEffort(fallback);
  }, [reasoningEffort, reasoningOptions, selectedModelMeta]);

  const availableDirectories = useMemo(() => {
    const values = new Set<string>();
    if (cwd.trim()) {
      values.add(cwd.trim());
    }
    for (const thread of [...threads, ...archivedThreads]) {
      if (thread.cwd) {
        values.add(thread.cwd);
      }
    }
    return Array.from(values);
  }, [archivedThreads, cwd, threads]);

  function rejectPendingSecureRequests(message: string): void {
    for (const [requestId, pending] of pendingSecureRequestsRef.current.entries()) {
      window.clearTimeout(pending.timerId);
      pending.reject(new Error(message));
      pendingSecureRequestsRef.current.delete(requestId);
    }
  }

  function clearSession(reason?: string): void {
    const pendingInit = pendingSessionInitRef.current;
    if (pendingInit) {
      window.clearTimeout(pendingInit.timerId);
      pendingSessionInitRef.current = null;
    }

    secureSessionRef.current = null;
    setSessionError(reason || null);
    setSecureState(reason ? "error" : "idle");
  }

  async function refreshProfile(nextToken: string): Promise<void> {
    try {
      const data = await requestJson<MeResponse>("/api/me", { method: "GET" }, nextToken);
      startTransition(() => {
        setUser(data.user);
        setHosts(data.hosts);
        setBrowserDevices(data.browserDevices);
        setAppError(null);
        if (!selectedHostIdRef.current || !data.hosts.some((host) => host.id === selectedHostIdRef.current)) {
          setSelectedHostId(data.hosts[0]?.id || null);
        }
      });
    } catch (error) {
      startTransition(() => {
        setAppError(getErrorMessage(error));
        setToken(null);
        setUser(null);
        setHosts([]);
        setBrowserDevices([]);
      });
    }
  }

  async function initializeSecureSession(hostId: string): Promise<void> {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    if (secureSessionRef.current?.hostId === hostId || pendingSessionInitRef.current?.hostId === hostId) {
      return;
    }

    clearSession();
    setSecureState("handshaking");
    setSessionError(null);

    try {
      const keyPair = await generateSessionKeyPair();
      const requestId = createRequestId("session");
      const timerId = window.setTimeout(() => {
        if (pendingSessionInitRef.current?.requestId === requestId) {
          pendingSessionInitRef.current = null;
          setSecureState("error");
          setSessionError("Timed out waiting for the local host to establish the secure relay.");
        }
      }, 15000);

      pendingSessionInitRef.current = {
        requestId,
        hostId,
        privateKey: keyPair.privateKey,
        timerId,
      };

      socketRef.current.send(
        JSON.stringify({
          type: "host:session:init",
          requestId,
          hostId,
          browserDeviceId: browserDeviceIdRef.current,
          browserName: browserNameRef.current,
          browserPublicKey: keyPair.publicKey,
        } satisfies BrowserOutboundMessage),
      );
    } catch (error) {
      setSecureState("error");
      setSessionError(getErrorMessage(error));
    }
  }

  async function sendSecureCommand<T>(command: AgentCommand): Promise<T> {
    const session = secureSessionRef.current;
    const socket = socketRef.current;
    if (!session || !socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Secure relay is not ready.");
    }

    const requestId = createRequestId("cmd");
    const body = await encryptRelayMessage(session.key, {
      kind: "request",
      requestId,
      command,
    });

    return new Promise<T>((resolve, reject) => {
      const timerId = window.setTimeout(() => {
        pendingSecureRequestsRef.current.delete(requestId);
        reject(new Error("The host did not respond before the request timed out."));
      }, 30000);

      pendingSecureRequestsRef.current.set(requestId, {
        resolve,
        reject,
        timerId,
      });

      socket.send(
        JSON.stringify({
          type: "session:message",
          hostId: session.hostId,
          sessionId: session.id,
          body,
        } satisfies BrowserOutboundMessage),
      );
    });
  }

  async function loadRuntimeConfig(): Promise<void> {
    const session = secureSessionRef.current;
    if (!session) {
      return;
    }

    try {
      const result = await sendSecureCommand<RuntimeConfigResult>({
        type: "runtime:config",
        hostId: session.hostId,
      });

      startTransition(() => {
        setAvailableModels(result.models);
        setAvailableCollaborationModes(result.collaborationModes.map((mode) => ({ mode: mode.mode, name: mode.name })));
        setAccountType(result.account?.accountType || null);
        setRequiresOpenaiAuth(Boolean(result.account?.requiresOpenaiAuth));
        setRateLimitsError(result.rateLimitsError);

        const defaultModel =
          result.models.find((candidate) => candidate.isDefault)?.model
          || result.models[0]?.model
          || null;

        if (defaultModel && !result.models.some((candidate) => candidate.model === model)) {
          setModel(defaultModel);
        }
      });
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  }

  async function loadThreads(selectFirst = true): Promise<void> {
    const session = secureSessionRef.current;
    if (!session) {
      return;
    }

    try {
      const [result, archivedResult] = await Promise.all([
        sendSecureCommand<ThreadsListResult>({
          type: "threads:list",
          hostId: session.hostId,
        }),
        sendSecureCommand<ThreadsListResult>({
          type: "threads:list",
          hostId: session.hostId,
          archived: true,
        }),
      ]);

      startTransition(() => {
        setThreads(result.threads);
        setArchivedThreads(archivedResult.threads);
      });

      const combinedThreads = [...result.threads, ...archivedResult.threads];
      const currentSelection = selectedThreadIdRef.current;
      const nextThreadId =
        currentSelection && combinedThreads.some((thread) => thread.id === currentSelection)
          ? currentSelection
          : selectFirst
            ? result.threads[0]?.id || archivedResult.threads[0]?.id || null
            : null;

      if (nextThreadId) {
        await loadThread(nextThreadId);
      }
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  }

  async function loadThread(threadId: string): Promise<void> {
    const session = secureSessionRef.current;
    if (!session) {
      return;
    }

    try {
      const result = await sendSecureCommand<ThreadReadResult>({
        type: "thread:read",
        hostId: session.hostId,
        threadId,
      });

      startTransition(() => {
        setThreadSnapshots((current) => ({
          ...current,
          [threadId]: result.thread,
        }));
        setSelectedThreadId(threadId);
        if (!cwd && result.thread.cwd) {
          setCwd(result.thread.cwd);
        }
      });
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  }

  async function renameSelectedThread(): Promise<void> {
    if (!selectedHost || !selectedThreadId || !renameValue.trim()) {
      return;
    }

    setRenameBusy(true);
    try {
      await sendSecureCommand<ThreadMutationResult>({
        type: "thread:rename",
        hostId: selectedHost.id,
        threadId: selectedThreadId,
        name: renameValue.trim(),
      });
      setActivePanel(null);
      await loadThreads(false);
      await loadThread(selectedThreadId);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setRenameBusy(false);
    }
  }

  async function toggleSelectedThreadArchive(isArchivedThread: boolean): Promise<void> {
    if (!selectedHost || !selectedThreadId) {
      return;
    }

    try {
      await sendSecureCommand<ThreadMutationResult>({
        type: isArchivedThread ? "thread:unarchive" : "thread:archive",
        hostId: selectedHost.id,
        threadId: selectedThreadId,
      });

      if (!isArchivedThread) {
        setSelectedThreadId(null);
      }

      await loadThreads(!isArchivedThread);
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  }

  async function forkSelectedThread(): Promise<void> {
    if (!selectedHost || !selectedThreadId || !selectedThread) {
      return;
    }

    setComposerBusy(true);
    try {
      const result = await sendSecureCommand<ThreadForkResult>({
        type: "thread:fork",
        hostId: selectedHost.id,
        threadId: selectedThreadId,
        cwd: selectedThread.cwd,
        model: selectedThread.model || model,
        modelProvider: selectedThread.modelProvider,
        sandbox: sandboxMode,
        serviceTier,
      });

      setThreadSnapshots((current) => ({
        ...current,
        [result.thread.id]: result.thread,
      }));
      setSelectedThreadId(result.thread.id);
      await loadThreads(false);
      await loadThread(result.thread.id);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setComposerBusy(false);
    }
  }

  async function startReview(): Promise<void> {
    if (!selectedHost || !selectedThreadId) {
      return;
    }

    setComposerBusy(true);
    try {
      const result = await sendSecureCommand<ReviewStartResult>({
        type: "review:start",
        hostId: selectedHost.id,
        threadId: selectedThreadId,
        target: "uncommitted-changes",
      });

      if (result.threadId) {
        await loadThread(result.threadId);
      }
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setComposerBusy(false);
    }
  }

  async function handlePairingClaim(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) {
      return;
    }

    const raw = pairingInput.trim();
    if (!raw) {
      setPairingError("Paste a QR payload or token first.");
      return;
    }

    const parsed = parsePairingQrPayload(raw);
    const pairingToken = parsed?.token || raw;

    setPairingBusy(true);
    setPairingError(null);

    try {
      await requestJson<PairingClaimResponse>(
        "/api/pairings/claim",
        {
          method: "POST",
          body: JSON.stringify({
            token: pairingToken,
            browserDeviceId: browserDeviceIdRef.current,
            browserName: browserNameRef.current,
          }),
        },
        token,
      );

      setPairingInput("");
      await refreshProfile(token);
      setActivePanel(null);
    } catch (error) {
      setPairingError(getErrorMessage(error));
    } finally {
      setPairingBusy(false);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAppError(null);

    try {
      const nextAuth = await requestJson<AuthResponse>(
        authMode === "login" ? "/api/auth/login" : "/api/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            email: authEmail,
            password: authPassword,
            name: authName,
          }),
        },
      );

      setToken(nextAuth.token);
      setUser(nextAuth.user);
      setAuthPassword("");
    } catch (error) {
      setAppError(getErrorMessage(error));
    }
  }

  function buildComposerPayload(): {
    input: string;
    userVisibleInput: string;
    attachmentSummaries: UserAttachmentSummary[];
    preparedAttachments: NonNullable<AgentCommand["type"]> extends never ? never : Array<
      | { kind: "text"; name: string; mimeType: string; content: string }
      | { kind: "image"; name: string; mimeType: string; url: string }
      | { kind: "binary"; name: string; mimeType: string }
    >;
  } | null {
    const input = composer.trim();
    if (!input && attachments.length === 0) {
      return null;
    }

    return {
      input,
      userVisibleInput: input || summarizeAttachments(attachments),
      attachmentSummaries: attachments.map((attachment) => attachmentSummaryLabel(attachment)),
      preparedAttachments: attachments.map((attachment) =>
        attachment.kind === "text"
          ? {
              kind: "text" as const,
              name: attachment.name,
              mimeType: attachment.mimeType,
              content: attachment.textContent || "",
            }
          : attachment.kind === "image"
            ? {
                kind: "image" as const,
                name: attachment.name,
                mimeType: attachment.mimeType,
                url: attachment.url || "",
              }
            : {
                kind: "binary" as const,
                name: attachment.name,
                mimeType: attachment.mimeType,
              },
      ),
    };
  }

  async function startTurnNow(payload: NonNullable<ReturnType<typeof buildComposerPayload>>): Promise<void> {
    if (!selectedHost || !secureSessionRef.current) {
      return;
    }

    const targetThreadId = selectedThreadArchived ? null : selectedThreadId;

    setComposerBusy(true);
    setAppError(null);

    try {
      if (targetThreadId) {
        setThreadSnapshots((current) => {
          const snapshot = current[targetThreadId];
          if (!snapshot) {
            return current;
          }
          return {
            ...current,
            [targetThreadId]: appendOptimisticUserMessage(
              snapshot,
              payload.userVisibleInput,
              payload.attachmentSummaries,
            ),
          };
        });
      }

      const result = await sendSecureCommand<TurnStartResult>({
        type: "turn:start",
        hostId: selectedHost.id,
        threadId: targetThreadId,
        input: payload.input,
        attachments: payload.preparedAttachments,
        cwd: cwd.trim() || null,
        model,
        reasoningEffort,
        approvalPolicy,
        sandbox: sandboxMode,
        serviceTier,
        collaborationMode,
      });

      setComposer("");
      setAttachments([]);
      setCollaborationMode(null);
      if (result.threadId) {
        setSelectedThreadId(result.threadId);
        void loadThread(result.threadId);
      }
      void loadThreads(false);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setComposerBusy(false);
    }
  }

  async function handleComposerSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const payload = buildComposerPayload();
    if (!payload) {
      return;
    }

    if (selectedThreadId && activeTurn) {
      const nextDraft: QueuedDraft = {
        id: createRequestId("queue"),
        input: payload.input,
        text: payload.userVisibleInput,
        attachmentSummaries: payload.attachmentSummaries,
        preparedAttachments: payload.preparedAttachments,
        collaborationMode,
      };

      setQueuedDraftsByThread((current) => ({
        ...current,
        [selectedThreadId]: [...(current[selectedThreadId] || []), nextDraft],
      }));
      setComposer("");
      setAttachments([]);
      setCollaborationMode(null);
      return;
    }

    await startTurnNow(payload);
  }

  async function handleSteerSubmit(): Promise<void> {
    if (!selectedHost || !selectedThreadId || !activeTurn || !secureSessionRef.current) {
      return;
    }

    const payload = buildComposerPayload();
    if (!payload) {
      return;
    }

    setComposerBusy(true);
    setAppError(null);

    try {
      setThreadSnapshots((current) => {
        const snapshot = current[selectedThreadId];
        if (!snapshot) {
          return current;
        }
        return {
          ...current,
          [selectedThreadId]: appendOptimisticUserMessage(
            snapshot,
            payload.userVisibleInput,
            payload.attachmentSummaries,
          ),
        };
      });

      await sendSecureCommand<TurnSteerResult>({
        type: "turn:steer",
        hostId: selectedHost.id,
        threadId: selectedThreadId,
        turnId: activeTurn.id,
        input: payload.input,
        attachments: payload.preparedAttachments,
        collaborationMode,
      });

      setComposer("");
      setAttachments([]);
      setCollaborationMode(null);
      void loadThread(selectedThreadId);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setComposerBusy(false);
    }
  }

  function handleRemoveQueuedDraft(draftId: string): void {
    if (!selectedThreadId) {
      return;
    }

    setQueuedDraftsByThread((current) => {
      const next = (current[selectedThreadId] || []).filter((draft) => draft.id !== draftId);
      if (next.length === 0) {
        const { [selectedThreadId]: _removed, ...rest } = current;
        return rest;
      }
      return {
        ...current,
        [selectedThreadId]: next,
      };
    });
  }

  function handleInsertSubagentsPrompt(): void {
    setComposer((current) => {
      const prefix = current.trim() ? `${current.trim()}\n\n` : "";
      return `${prefix}/subagents`;
    });
  }

  function handleToggleNotifications(): void {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setAppError("Browser notifications are not supported here.");
      return;
    }

    if (Notification.permission === "granted") {
      setNotificationsEnabled((current) => !current);
      return;
    }

    void Notification.requestPermission().then((permission) => {
      setNotificationsEnabled(permission === "granted");
      if (permission !== "granted") {
        setAppError("Notification permission was not granted.");
      }
    });
  }

  async function dispatchQueuedDraft(threadId: string, draft: QueuedDraft): Promise<void> {
    if (!selectedHost || !secureSessionRef.current) {
      return;
    }

    setComposerBusy(true);
    setAppError(null);

    try {
      setThreadSnapshots((current) => {
        const snapshot = current[threadId];
        if (!snapshot) {
          return current;
        }
        return {
          ...current,
          [threadId]: appendOptimisticUserMessage(snapshot, draft.text, draft.attachmentSummaries),
        };
      });

      await sendSecureCommand<TurnStartResult>({
        type: "turn:start",
        hostId: selectedHost.id,
        threadId,
        input: draft.input,
        attachments: draft.preparedAttachments,
        cwd: cwd.trim() || null,
        model,
        reasoningEffort,
        approvalPolicy,
        sandbox: sandboxMode,
        serviceTier,
        collaborationMode: draft.collaborationMode,
      });

      setQueuedDraftsByThread((current) => {
        const remaining = (current[threadId] || []).filter((candidate) => candidate.id !== draft.id);
        if (remaining.length === 0) {
          const { [threadId]: _removed, ...rest } = current;
          return rest;
        }
        return {
          ...current,
          [threadId]: remaining,
        };
      });

      void loadThread(threadId);
      void loadThreads(false);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setComposerBusy(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    composerFormRef.current?.requestSubmit();
  }

  async function handleChooseFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) {
      return;
    }

    setAttachmentBusy(true);
    try {
      const nextAttachments = await Promise.all(Array.from(fileList).map((file) => toAttachmentDraft(file)));
      setAttachments((current) => [...current, ...nextAttachments]);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setAttachmentBusy(false);
      event.target.value = "";
    }
  }

  function handleRemoveAttachment(attachmentId: string): void {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function handleOpenFileDialog(): void {
    fileInputRef.current?.click();
  }

  async function handleInterrupt(): Promise<void> {
    if (!selectedHost || !selectedThreadId || !activeTurn) {
      return;
    }

    setComposerBusy(true);
    try {
      await sendSecureCommand<void>({
        type: "turn:interrupt",
        hostId: selectedHost.id,
        threadId: selectedThreadId,
        turnId: activeTurn.id,
      });
      await loadThread(selectedThreadId);
    } catch (error) {
      setAppError(getErrorMessage(error));
    } finally {
      setComposerBusy(false);
    }
  }

  function handleLogout(): void {
    setToken(null);
    setUser(null);
    setHosts([]);
    setBrowserDevices([]);
    setSelectedHostId(null);
    setThreads([]);
    setArchivedThreads([]);
    setThreadSnapshots({});
    setSelectedThreadId(null);
    setThreadSearch("");
    setPairingInput("");
    setPairingError(null);
    setAttachments([]);
    setQueuedDraftsByThread({});
    setAppError(null);
    setSessionError(null);
    setAvailableModels([]);
    setAvailableCollaborationModes([]);
    setAccountType(null);
    setRequiresOpenaiAuth(false);
    setRateLimitsError(null);
    setActivePanel(null);
    clearSession();
  }

  useEffect(() => {
    if (!hydrated || !token) {
      return;
    }
    void refreshProfile(token);
  }, [hydrated, token]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!token) {
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      socketRef.current?.close();
      socketRef.current = null;
      rejectPendingSecureRequests("Signed out.");
      clearSession();
      setConnectionState("idle");
      return;
    }

    let cancelled = false;
    let reconnectAttempt = 0;

    const connect = (): void => {
      if (cancelled) {
        return;
      }

      setConnectionState(reconnectAttempt === 0 ? "connecting" : "reconnecting");
      const socket = new WebSocket(GATEWAY_WS_URL);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (cancelled) {
          return;
        }
        setConnectionState("authenticating");
        socket.send(JSON.stringify({ type: "browser:subscribe", token } satisfies BrowserOutboundMessage));
      });

      socket.addEventListener("message", (event) => {
        void (async () => {
          try {
            const message = JSON.parse(String(event.data)) as BrowserInboundMessage;

            if (message.type === "browser:ready") {
              setConnectionState("connected");
              setUser(message.user);
              return;
            }

            if (message.type === "host:list") {
              setHosts(message.hosts);
              return;
            }

            if (message.type === "host:status") {
              setHosts((current) => {
                const index = current.findIndex((host) => host.id === message.host.id);
                if (index === -1) {
                  return [...current, message.host];
                }
                const next = [...current];
                next[index] = message.host;
                return next;
              });
              return;
            }

            if (message.type === "session:ready") {
              const pendingInit = pendingSessionInitRef.current;
              if (!pendingInit || pendingInit.requestId !== message.requestId) {
                return;
              }

              window.clearTimeout(pendingInit.timerId);
              pendingSessionInitRef.current = null;
              const key = await deriveSessionKey(pendingInit.privateKey, message.session.agentPublicKey);
              secureSessionRef.current = {
                id: message.session.id,
                hostId: message.session.hostId,
                key,
                createdAt: message.session.createdAt,
                browserDeviceId: message.session.browserDeviceId,
                browserName: message.session.browserName,
              };
              setSecureState("ready");
              setSessionError(null);
              await loadThreads();
              return;
            }

            if (message.type === "session:message") {
              const session = secureSessionRef.current;
              if (!session || message.sessionId !== session.id || message.hostId !== session.hostId) {
                return;
              }

              const payload = await decryptRelayMessage<SecureRelayPayload>(session.key, message.body);

              if (payload.kind === "response") {
                const pending = pendingSecureRequestsRef.current.get(payload.requestId);
                if (!pending) {
                  return;
                }
                pendingSecureRequestsRef.current.delete(payload.requestId);
                window.clearTimeout(pending.timerId);
                if (!payload.ok) {
                  pending.reject(new Error(payload.error || "Host request failed."));
                } else {
                  pending.resolve(payload.data);
                }
                return;
              }

              if (payload.kind === "event") {
                const target = getRelayEventTarget(payload.event);
                if (!target.threadId) {
                  return;
                }

                setThreadSnapshots((current) => {
                  const snapshot = current[target.threadId as string];
                  if (!snapshot) {
                    return current;
                  }
                  return {
                    ...current,
                    [target.threadId as string]: applyRelayEventToSnapshot(snapshot, payload.event),
                  };
                });
              }
              return;
            }

            if (message.type === "browser:error") {
              setAppError(message.message);
            }
          } catch (error) {
            setAppError(getErrorMessage(error));
          }
        })();
      });

      socket.addEventListener("close", () => {
        if (cancelled) {
          return;
        }
        socketRef.current = null;
        rejectPendingSecureRequests("Gateway connection closed.");
        clearSession();
        setConnectionState("reconnecting");
        reconnectAttempt += 1;
        const delay = Math.min(5000, 1000 * reconnectAttempt);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      });

      socket.addEventListener("error", () => {
        if (!cancelled) {
          setConnectionState("error");
        }
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [hydrated, token]);

  useEffect(() => {
    if (!selectedHostId || connectionState !== "connected" || secureState !== "idle") {
      return;
    }
    const host = hosts.find((candidate) => candidate.id === selectedHostId);
    if (!host?.online || !host.paired) {
      return;
    }
    void initializeSecureSession(selectedHostId);
  }, [connectionState, hosts, secureState, selectedHostId]);

  useEffect(() => {
    if (secureState !== "ready") {
      return;
    }

    void loadRuntimeConfig();
  }, [secureState]);

  useEffect(() => {
    if (!timelineRef.current) {
      return;
    }
    timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [flattenedTimeline, pendingTurnIndicatorMode]);

  useEffect(() => {
    setThreads([]);
    setArchivedThreads([]);
    setThreadSnapshots({});
    setSelectedThreadId(null);
    setAvailableModels([]);
    setAvailableCollaborationModes([]);
    setAccountType(null);
    setRequiresOpenaiAuth(false);
    setRateLimitsError(null);
    clearSession();
  }, [selectedHostId]);

  useEffect(() => {
    if (!selectedThreadId || activeTurn || composerBusy || queueDispatchRef.current) {
      return;
    }

    const nextDraft = queuedDraftsByThread[selectedThreadId]?.[0];
    if (!nextDraft) {
      return;
    }

    queueDispatchRef.current = true;
    void dispatchQueuedDraft(selectedThreadId, nextDraft).finally(() => {
      queueDispatchRef.current = false;
    });
  }, [activeTurn, composerBusy, dispatchQueuedDraft, queuedDraftsByThread, selectedThreadId]);

  useEffect(() => {
    const nextStatuses: Record<string, string> = {};

    for (const thread of Object.values(threadSnapshots)) {
      const turn = thread.turns.at(-1);
      if (!turn) {
        continue;
      }

      const key = `${thread.id}:${turn.id}`;
      nextStatuses[key] = turn.status;
      const previousStatus = turnStatusRef.current[key];
      const isTerminal = TERMINAL_TURN_STATUSES.has(turn.status.toLowerCase());

      if (
        notificationsEnabled
        && typeof document !== "undefined"
        && document.hidden
        && typeof window !== "undefined"
        && "Notification" in window
        && Notification.permission === "granted"
        && previousStatus
        && previousStatus !== turn.status
        && isTerminal
      ) {
        const threadTitle = thread.name || truncateText(thread.preview || "Conversation", 42);
        const body = turn.error || `Turn ${turn.status.toLowerCase()}.`;
        new Notification(threadTitle, { body });
      }
    }

    turnStatusRef.current = nextStatuses;
  }, [notificationsEnabled, threadSnapshots]);

  const selectedThreadSummary = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || archivedThreads.find((thread) => thread.id === selectedThreadId) || null,
    [archivedThreads, selectedThreadId, threads],
  );

  const selectedThreadArchived = useMemo(
    () => archivedThreads.some((thread) => thread.id === selectedThreadId),
    [archivedThreads, selectedThreadId],
  );

  const statusBadges = [
    ...(serviceTier === "fast" ? [{ id: "service-tier", label: "fast", tone: "warning" as const }] : []),
    ...(collaborationMode === "plan" ? [{ id: "collaboration-mode", label: "plan", tone: "accent" as const }] : []),
    {
      id: "host-status",
      label: hostStatusLabel(selectedHost),
      tone: selectedHost?.online ? "success" as const : "neutral" as const,
    },
    {
      id: "secure-state",
      label: secureState,
      tone: secureState === "ready" ? "accent" as const : "neutral" as const,
    },
    {
      id: "connection-state",
      label: connectionState,
      tone: connectionState === "connected" ? "success" as const : "neutral" as const,
    },
  ];

  const setupModal = (
    <PanelModal eyebrow="Pairing" title="Connect a local host" onClose={() => setActivePanel(null)}>
      <form className="pc-form-stack" onSubmit={(event) => void handlePairingClaim(event)}>
        <label className="pc-field">
          <span>Browser name</span>
          <input value={browserName} onChange={(event) => setBrowserName(event.target.value)} />
        </label>

        <label className="pc-field">
          <span>Selected host</span>
          <select value={selectedHostId || ""} onChange={(event) => setSelectedHostId(event.target.value || null)}>
            <option value="">Choose host</option>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="pc-field">
          <span>QR payload or token</span>
          <textarea
            value={pairingInput}
            onChange={(event) => setPairingInput(event.target.value)}
            placeholder='Paste the raw JSON payload printed by the local agent after "scan this QR code"'
          />
        </label>

        {pairingPreview ? (
          <div className="pc-mini-card">
            <strong>{pairingPreview.displayName}</strong>
            <span>Expires {formatTime(pairingPreview.expiresAt)}</span>
          </div>
        ) : null}

        {trustedBrowser ? (
          <div className="pc-mini-card">
            <strong>{trustedBrowser.name}</strong>
            <span>Trusted {formatTime(trustedBrowser.trustedAt)}</span>
          </div>
        ) : null}

        {pairingError ? <div className="pc-inline-alert is-danger">{pairingError}</div> : null}

        <div className="pc-form-actions">
          <ActionButton variant="surface" type="button" onClick={() => token && void refreshProfile(token)}>
            Refresh Hosts
          </ActionButton>
          <ActionButton variant="primary" type="submit" disabled={pairingBusy}>
            {pairingBusy ? "Binding..." : "Bind Host"}
          </ActionButton>
        </div>
      </form>
    </PanelModal>
  );

  const controlsModal = (
    <PanelModal eyebrow="Runtime" title="Model and execution controls" onClose={() => setActivePanel(null)}>
      <div className="pc-form-stack">
        <div className="pc-control-grid">
          <label className="pc-field">
            <span>Model</span>
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {availableModels.length === 0 ? <option value={model}>{modelTitle(model)}</option> : null}
              {availableModels.map((option) => (
                <option key={option.id} value={option.model}>
                  {option.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="pc-field">
            <span>Reasoning</span>
            <select
              value={reasoningEffort}
              onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}
            >
              {reasoningOptions.map((option) => (
                <option key={option.effort} value={option.effort}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="pc-field">
            <span>Mode</span>
            <select
              value={collaborationMode || "default"}
              onChange={(event) =>
                setCollaborationMode(event.target.value === "default" ? null : (event.target.value as CollaborationMode))
              }
            >
              <option value="default">Default</option>
              {availableCollaborationModes
                .filter((mode) => mode.mode !== "default")
                .map((mode) => (
                  <option key={mode.mode} value={mode.mode}>
                    {mode.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="pc-field">
            <span>Speed</span>
            <select
              value={serviceTier || "default"}
              onChange={(event) => setServiceTier(event.target.value === "default" ? null : "fast")}
            >
              <option value="default">Default</option>
              <option value="fast">Fast mode</option>
            </select>
          </label>

          <label className="pc-field">
            <span>Approval</span>
            <select
              value={approvalPolicy}
              onChange={(event) => setApprovalPolicy(event.target.value as ApprovalPolicy)}
            >
              <option value="on-request">on-request</option>
              <option value="never">never</option>
              <option value="untrusted">untrusted</option>
            </select>
          </label>

          <label className="pc-field">
            <span>Sandbox</span>
            <select
              value={sandboxMode}
              onChange={(event) => setSandboxMode(event.target.value as SandboxMode)}
            >
              <option value="read-only">read-only</option>
              <option value="workspace-write">workspace-write</option>
              <option value="danger-full-access">danger-full-access</option>
            </select>
          </label>
        </div>

        <div className="pc-mini-card">
          <strong>{selectedHost ? selectedHost.displayName : "No host selected"}</strong>
          <span>{hostStatusLabel(selectedHost)}</span>
          <span>{secureState === "ready" ? "Secure relay ready" : "Secure relay idle"}</span>
          {selectedModelMeta ? <span>{selectedModelMeta.description}</span> : null}
          <span>{describeThreadFork()}</span>
        </div>

        <div className="pc-mini-card">
          <strong>{accountLabel(accountType)}</strong>
          <span>{requiresOpenaiAuth ? "OpenAI auth required for some runtime routes" : "Runtime auth is ready"}</span>
          {rateLimitsError ? <span>{rateLimitsError}</span> : null}
          <span>{notificationsEnabled ? "Browser notifications enabled" : "Browser notifications disabled"}</span>
        </div>

        <div className="pc-form-actions">
          <ActionButton
            variant="surface"
            type="button"
            disabled={!selectedHost?.online}
            onClick={() => {
              if (!selectedHost) {
                return;
              }
              clearSession();
              void initializeSecureSession(selectedHost.id);
            }}
          >
            Reconnect Relay
          </ActionButton>
          <ActionButton
            variant="surface"
            type="button"
            disabled={!activeTurn}
            onClick={() => void handleInterrupt()}
          >
            Interrupt Turn
          </ActionButton>
          <ActionButton variant="surface" type="button" onClick={handleToggleNotifications}>
            {notificationsEnabled ? "Disable Notifications" : "Enable Notifications"}
          </ActionButton>
        </div>
      </div>
    </PanelModal>
  );

  const newChatModal = (
    <PanelModal eyebrow="New Chat" title="Start a new Codex session" onClose={() => setActivePanel(null)}>
      <div className="pc-form-stack">
        <div className="pc-control-grid">
          <label className="pc-field">
            <span>Model</span>
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {availableModels.length === 0 ? <option value={model}>{modelTitle(model)}</option> : null}
              {availableModels.map((option) => (
                <option key={option.id} value={option.model}>
                  {option.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="pc-field">
            <span>Reasoning</span>
            <select
              value={reasoningEffort}
              onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}
            >
              {reasoningOptions.map((option) => (
                <option key={option.effort} value={option.effort}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="pc-field">
            <span>Mode</span>
            <select
              value={collaborationMode || "default"}
              onChange={(event) =>
                setCollaborationMode(event.target.value === "default" ? null : (event.target.value as CollaborationMode))
              }
            >
              <option value="default">Default</option>
              {availableCollaborationModes
                .filter((mode) => mode.mode !== "default")
                .map((mode) => (
                  <option key={mode.mode} value={mode.mode}>
                    {mode.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="pc-field">
            <span>Speed</span>
            <select
              value={serviceTier || "default"}
              onChange={(event) => setServiceTier(event.target.value === "default" ? null : "fast")}
            >
              <option value="default">Default</option>
              <option value="fast">Fast mode</option>
            </select>
          </label>

          <label className="pc-field">
            <span>Approval</span>
            <select
              value={approvalPolicy}
              onChange={(event) => setApprovalPolicy(event.target.value as ApprovalPolicy)}
            >
              <option value="on-request">on-request</option>
              <option value="never">never</option>
              <option value="untrusted">untrusted</option>
            </select>
          </label>

          <label className="pc-field">
            <span>Sandbox</span>
            <select
              value={sandboxMode}
              onChange={(event) => setSandboxMode(event.target.value as SandboxMode)}
            >
              <option value="read-only">read-only</option>
              <option value="workspace-write">workspace-write</option>
              <option value="danger-full-access">danger-full-access</option>
            </select>
          </label>
        </div>

        <label className="pc-field">
          <span>Working directory</span>
          <select value={cwd} onChange={(event) => setCwd(event.target.value)}>
            {availableDirectories.length === 0 ? <option value="">No known directory</option> : null}
            {availableDirectories.map((directory) => (
              <option key={directory} value={directory}>
                {directory}
              </option>
            ))}
          </select>
        </label>

        <div className="pc-form-actions">
          <ActionButton variant="surface" type="button" onClick={() => setActivePanel(null)}>
            Cancel
          </ActionButton>
          <ActionButton
            variant="primary"
            type="button"
            onClick={() => {
              setSelectedThreadId(null);
              setComposer("");
              setAttachments([]);
              setActivePanel(null);
            }}
          >
            Start Empty Chat
          </ActionButton>
        </div>
      </div>
    </PanelModal>
  );

  const renameModal = (
    <PanelModal eyebrow="Thread" title="Rename conversation" onClose={() => setActivePanel(null)}>
      <div className="pc-form-stack">
        <label className="pc-field">
          <span>Conversation title</span>
          <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
        </label>

        <div className="pc-form-actions">
          <ActionButton variant="surface" type="button" onClick={() => setActivePanel(null)}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" type="button" disabled={renameBusy || !renameValue.trim()} onClick={() => void renameSelectedThread()}>
            {renameBusy ? "Saving..." : "Save Title"}
          </ActionButton>
        </div>
      </div>
    </PanelModal>
  );

  if (!token || !user) {
    return (
      <main className="pc-auth-shell">
        <section className="pc-auth-layout">
          <section className="pc-auth-stage">
            <div className="pc-auth-stage-backdrop" aria-hidden="true">
              <span className="pc-auth-aurora is-primary" />
              <span className="pc-auth-aurora is-secondary" />
              <span className="pc-auth-aurora is-tertiary" />
              <span className="pc-auth-stage-grid" />
              <span className="pc-auth-stage-orbit is-large" />
              <span className="pc-auth-stage-orbit is-small" />
            </div>

            <div className="pc-auth-stage-copy">
              <span className="pc-auth-eyebrow">Pocket Codex</span>
              <h1>Encrypted control plane for your local Codex runtime</h1>
              <p>
                Pair the browser with your machine, keep thread content local, and route account and relay metadata through the DB-backed gateway.
              </p>
            </div>

            <div className="pc-auth-stage-pills">
              {AUTH_STAGE_PILLS.map((pill) => (
                <span key={pill}>{pill}</span>
              ))}
            </div>

            <div className="pc-auth-feature-grid">
              {AUTH_STAGE_FEATURES.map((feature) => (
                <article key={feature.id} className="pc-auth-feature-card">
                  <span className="pc-auth-feature-number">{feature.id}</span>
                  <strong>{feature.title}</strong>
                  <p>{feature.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="pc-auth-card">
            <div className="pc-auth-brand">
              <img className="pc-brand-image is-large" src="/pocketcodex-mark.svg" alt="Pocket Codex" />
              <div>
                <span className="pc-auth-eyebrow">{authMode === "login" ? "Welcome back" : "Create your access"}</span>
                <strong>Remote workspace for your local runtime</strong>
              </div>
            </div>

            <div className="pc-auth-copy">
              <h1>{authMode === "login" ? "Sign in on the right host, keep the work on yours" : "Create an account for your paired browsers"}</h1>
              <p>
                {authMode === "login"
                  ? "Use your Pocket Codex account to reconnect trusted browsers, hosts, and secure relay sessions."
                  : "Start with an account record in the control-plane database while your actual Codex work remains on the local agent."}
              </p>
            </div>

            <form className="pc-form-stack" onSubmit={(event) => void handleAuthSubmit(event)}>
              {authMode === "register" ? (
                <label className="pc-field">
                  <span>Name</span>
                  <input value={authName} onChange={(event) => setAuthName(event.target.value)} />
                </label>
              ) : null}

              <label className="pc-field">
                <span>Email</span>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              <label className="pc-field">
                <span>Password</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </label>

              {appError ? <div className="pc-inline-alert is-danger">{appError}</div> : null}

              <ActionButton variant="primary" type="submit">
                {authMode === "login" ? "Sign In" : "Create Account"}
              </ActionButton>
            </form>

            <button
              className="pc-auth-switch"
              type="button"
              onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}
            >
              {authMode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
            </button>
          </section>
        </section>
      </main>
    );
  }

  return (
    <AppShell
      sidebar={
        <Sidebar
          hostLabel={selectedHost ? selectedHost.displayName : "Select or pair a host"}
          userLabel={user.name}
          searchValue={threadSearch}
          groups={threadGroups}
          onChangeSearch={setThreadSearch}
          onNewChat={() => setActivePanel("new-chat")}
          onSelectThread={(threadId) => void loadThread(threadId)}
          onSetup={() => setActivePanel("setup")}
          onControls={() => setActivePanel("controls")}
          onLogout={handleLogout}
        />
      }
      topBar={
        <TopBar
          title={selectedThreadSummary?.name || truncateText(selectedThread?.preview || "New conversation", 48)}
          subtitle={
            selectedHost
              ? `${selectedHost.displayName} · ${hostStatusLabel(selectedHost)}`
              : "Pair a local host to start using Pocket Codex"
          }
          pathLabel={selectedThread?.cwd || cwd || null}
          actions={
            <>
              <ActionButton
                icon={theme === "light" ? <Icons.Moon /> : <Icons.Sun />}
                variant="surface"
                size="sm"
                onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              >
                {themeLabel(theme)}
              </ActionButton>
              {selectedThreadId ? (
              <>
                <ActionButton
                  icon={<Icons.Pencil />}
                  variant="surface"
                  size="sm"
                  onClick={() => {
                    setRenameValue(selectedThreadSummary?.name || "");
                    setActivePanel("rename");
                  }}
                >
                  Rename
                </ActionButton>
                <ActionButton
                  icon={<Icons.Branch />}
                  variant="surface"
                  size="sm"
                  disabled={Boolean(activeTurn)}
                  onClick={() => void forkSelectedThread()}
                >
                  Fork
                </ActionButton>
                <ActionButton
                  icon={<Icons.Search />}
                  variant="surface"
                  size="sm"
                  disabled={selectedThreadArchived || Boolean(activeTurn)}
                  onClick={() => void startReview()}
                >
                  Review
                </ActionButton>
                <ActionButton
                  icon={<Icons.Archive />}
                  variant="surface"
                  size="sm"
                  disabled={Boolean(activeTurn)}
                  onClick={() => void toggleSelectedThreadArchive(selectedThreadArchived)}
                >
                  {selectedThreadArchived ? "Unarchive" : "Archive"}
                </ActionButton>
              </>
              ) : null}
            </>
          }
        />
      }
      modal={
        activePanel === "setup"
          ? setupModal
          : activePanel === "controls"
            ? controlsModal
            : activePanel === "new-chat"
              ? newChatModal
              : activePanel === "rename"
                ? renameModal
              : null
      }
    >
      <ChatLayout
        alerts={
          appError || sessionError || selectedThreadArchived ? (
            <>
              {appError ? <div className="pc-inline-alert is-danger">{appError}</div> : null}
              {sessionError ? <div className="pc-inline-alert is-warning">{sessionError}</div> : null}
              {selectedThreadArchived ? (
                <div className="pc-inline-alert is-warning">
                  Archived means the conversation is hidden from the live list but history is kept. Sending a new message starts a continuation thread.
                </div>
              ) : null}
            </>
          ) : undefined
        }
        statusRail={
          <>
            {statusBadges.map((status) => (
              <StatusBadge key={status.id} tone={status.tone}>
                {status.label}
              </StatusBadge>
            ))}
          </>
        }
        timeline={
          <div ref={timelineRef} className="pc-conversation-scroll">
            {!selectedHost ? (
              <EmptyConversation
                title="Pair your first host"
                body="Open Setup, paste the pairing payload from the local agent, and bind the machine to this account."
                action={
                  <ActionButton variant="primary" onClick={() => setActivePanel("setup")}>
                    Open Setup
                  </ActionButton>
                }
              />
            ) : !selectedHost.online ? (
              <EmptyConversation
                title={`${selectedHost.displayName} is offline`}
                body="Start the local agent again, or refresh the host list after the machine reconnects."
                action={
                  <ActionButton variant="surface" onClick={() => token && void refreshProfile(token)}>
                    Refresh Hosts
                  </ActionButton>
                }
              />
            ) : secureState !== "ready" ? (
              <EmptyConversation
                title="Establishing the secure relay"
                body="The browser is waiting for the local agent to finish the encrypted session handshake."
                action={
                  <ActionButton
                    variant="primary"
                    onClick={() => {
                      if (!selectedHost) {
                        return;
                      }
                      clearSession();
                      void initializeSecureSession(selectedHost.id);
                    }}
                  >
                    Reconnect
                  </ActionButton>
                }
              />
            ) : flattenedTimeline.length === 0 ? (
              pendingTurnIndicatorMode ? (
                <LiveTurnIndicator mode={pendingTurnIndicatorMode} />
              ) : (
                <EmptyConversation
                  title="Start a new conversation"
                  body="Ask Codex to inspect files, edit code, run commands, or continue your current work."
                />
              )
            ) : (
              <>
                {flattenedTimeline.map((item) => <MessageBubble key={item.id} item={item} />)}
                {pendingTurnIndicatorMode && activeTurn ? (
                  <LiveTurnIndicator mode={pendingTurnIndicatorMode} key={`${activeTurn.id}_live`} />
                ) : null}
              </>
            )}
          </div>
        }
        composer={
          <ChatInput
            activeTurn={Boolean(activeTurn)}
            approvalPolicy={approvalPolicy}
            attachments={attachments.map((attachment) => ({
              id: attachment.id,
              name: attachment.name,
              kind: attachment.kind,
            }))}
            attachmentBusy={attachmentBusy}
            collaborationMode={collaborationMode}
            composer={composer}
            composerBusy={composerBusy}
            fileInputRef={fileInputRef}
            formRef={composerFormRef}
            model={model}
            models={availableModels}
            onChangeApprovalPolicy={setApprovalPolicy}
            onChangeCollaborationMode={setCollaborationMode}
            onChangeComposer={setComposer}
            onChangeModel={setModel}
            onChangeReasoningEffort={setReasoningEffort}
            onChangeServiceTier={setServiceTier}
            onChangeSandboxMode={setSandboxMode}
            onChooseFiles={(event) => void handleChooseFiles(event)}
            onInsertSubagentsPrompt={handleInsertSubagentsPrompt}
            onKeyDown={handleComposerKeyDown}
            onOpenFileDialog={handleOpenFileDialog}
            onRemoveQueuedDraft={handleRemoveQueuedDraft}
            onRemoveAttachment={handleRemoveAttachment}
            onSendSteer={() => void handleSteerSubmit()}
            onSubmit={(event) => void handleComposerSubmit(event)}
            queuedDrafts={queuedDrafts}
            reasoningOptions={reasoningOptions}
            reasoningEffort={reasoningEffort}
            sandboxMode={sandboxMode}
            serviceTier={serviceTier}
          />
        }
      />
    </AppShell>
  );
}

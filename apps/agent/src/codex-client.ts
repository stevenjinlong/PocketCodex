import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { ThreadSnapshot, ThreadSummary, TimelineItem, TurnSnapshot } from "@pocket-codex/protocol";

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

function joinTextParts(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => (typeof part === "object" && part && "text" in part ? String((part as { text?: unknown }).text || "") : ""))
    .join("");
}

function stringifyDetail(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function normalizeTimelineItem(item: Record<string, unknown>): TimelineItem {
  const type = String(item.type || "event");
  const id = String(item.id || `item_${Math.random().toString(36).slice(2, 8)}`);

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
    const summary = Array.isArray(item.summary)
      ? item.summary
          .map((part) => {
            if (typeof part === "string") {
              return part;
            }
            if (part && typeof part === "object" && "text" in part) {
              return String((part as { text?: unknown }).text || "");
            }
            return "";
          })
          .filter(Boolean)
          .join("\n")
      : "";
    return {
      kind: "reasoning",
      id,
      text: summary || stringifyDetail(item.content),
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

export function normalizeThreadSummary(thread: Record<string, unknown>): ThreadSummary {
  const statusValue = thread.status && typeof thread.status === "object" && "type" in thread.status
    ? String((thread.status as { type?: unknown }).type || "idle")
    : String(thread.status || "idle");

  return {
    id: String(thread.id || ""),
    preview: String(thread.preview || ""),
    name: thread.name ? String(thread.name) : null,
    cwd: thread.cwd ? String(thread.cwd) : null,
    updatedAt: Number(thread.updatedAt || 0),
    createdAt: Number(thread.createdAt || 0),
    status: statusValue,
    source: thread.source ? String(thread.source) : null,
  };
}

export function normalizeThreadSnapshot(thread: Record<string, unknown>): ThreadSnapshot {
  const summary = normalizeThreadSummary(thread);
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  return {
    ...summary,
    turns: turns.map((turn) => normalizeTurnSnapshot(turn as Record<string, unknown>)),
  };
}

function normalizeTurnSnapshot(turn: Record<string, unknown>): TurnSnapshot {
  const items = Array.isArray(turn.items) ? turn.items : [];
  return {
    id: String(turn.id || ""),
    status: String(turn.status || "idle"),
    error: turn.error ? String(turn.error) : null,
    items: items.map((item) => normalizeTimelineItem(item as Record<string, unknown>)),
  };
}

export class CodexClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;

  private buffer = "";

  private pending = new Map<number, PendingRequest>();

  private nextRequestId = 1;

  private readyPromise: Promise<void> | null = null;

  async request(method: string, params: Record<string, unknown>): Promise<any> {
    await this.ensureReady();
    const requestId = this.nextRequestId++;
    const payload = JSON.stringify({ id: requestId, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.child?.stdin.write(`${payload}\n`);
    });
  }

  private async ensureReady(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve, reject) => {
      this.child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.child.stdout.on("data", (chunk) => {
        this.buffer += chunk.toString("utf8");
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          this.handleMessage(line, resolve, reject);
        }
      });

      this.child.stderr.on("data", (chunk) => {
        this.emit("log", chunk.toString("utf8"));
      });

      this.child.on("close", () => {
        for (const pendingRequest of this.pending.values()) {
          pendingRequest.reject(new Error("codex app-server closed unexpectedly."));
        }
        this.pending.clear();
        this.child = null;
        this.readyPromise = null;
      });

      this.child.stdin.write(
        `${JSON.stringify({
          id: 1,
          method: "initialize",
          params: {
            clientInfo: {
              name: "pocket_codex_agent",
              title: "Pocket Codex Agent",
              version: "0.1.0",
            },
          },
        })}\n`,
      );
    });

    return this.readyPromise;
  }

  private handleMessage(line: string, resolveReady: () => void, rejectReady: (error: Error) => void): void {
    const parsed = JSON.parse(line) as {
      id?: number;
      result?: unknown;
      error?: { message?: string };
      method?: string;
      params?: Record<string, unknown>;
    };

    if (parsed.id === 1 && parsed.result) {
      this.child?.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
      resolveReady();
      return;
    }

    if (parsed.id === 1 && parsed.error) {
      rejectReady(new Error(parsed.error.message || "Failed to initialize codex app-server."));
      return;
    }

    if (typeof parsed.id === "number") {
      const pendingRequest = this.pending.get(parsed.id);
      if (!pendingRequest) {
        return;
      }
      this.pending.delete(parsed.id);
      if (parsed.error) {
        pendingRequest.reject(new Error(parsed.error.message || "App-server request failed."));
        return;
      }
      pendingRequest.resolve(parsed.result);
      return;
    }

    if (parsed.method) {
      this.emit("notification", {
        method: parsed.method,
        params: parsed.params || {},
      });
    }
  }
}

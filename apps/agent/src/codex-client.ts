import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import {
  normalizeThreadSnapshot,
  normalizeThreadSummary,
  type ThreadSnapshot,
  type ThreadSummary,
} from "@pocket-codex/protocol";

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

export { normalizeThreadSnapshot, normalizeThreadSummary } from "@pocket-codex/protocol";

export class CodexClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;

  private buffer = "";

  private pending = new Map<number, PendingRequest>();

  private nextRequestId = 2;

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

      this.child.on("error", (error) => {
        for (const pendingRequest of this.pending.values()) {
          pendingRequest.reject(error instanceof Error ? error : new Error("Failed to start codex app-server."));
        }
        this.pending.clear();
        reject(error instanceof Error ? error : new Error("Failed to start codex app-server."));
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
            capabilities: {
              experimentalApi: true,
            },
          },
        })}\n`,
      );
    });

    return this.readyPromise;
  }

  private handleMessage(line: string, resolveReady: () => void, rejectReady: (error: Error) => void): void {
    let parsed: {
      id?: number;
      result?: unknown;
      error?: { message?: string };
      method?: string;
      params?: Record<string, unknown>;
    };

    try {
      parsed = JSON.parse(line) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
        method?: string;
        params?: Record<string, unknown>;
      };
    } catch {
      this.emit("log", `Unparseable app-server payload: ${line}`);
      return;
    }

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

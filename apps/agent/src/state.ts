import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AgentState {
  hostId: string;
  hostSecret: string;
  displayName: string;
}

const DATA_DIR = process.env.POCKET_CODEX_AGENT_DIR || path.join(os.homedir(), ".pocket-codex");
const DATA_FILE = path.join(DATA_DIR, "agent.json");

export function loadOrCreateAgentState(displayName: string): AgentState {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as AgentState;
  }

  const state: AgentState = {
    hostId: randomUUID(),
    hostSecret: randomBytes(24).toString("base64url"),
    displayName,
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  return state;
}

export function resetAgentState(): void {
  if (fs.existsSync(DATA_FILE)) {
    fs.unlinkSync(DATA_FILE);
  }
}

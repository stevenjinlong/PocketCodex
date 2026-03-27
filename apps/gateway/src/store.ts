import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  BrowserDeviceSummary,
  HostSummary,
  PairingQrPayload,
  RelaySessionSummary,
  UserProfile,
} from "@pocket-codex/protocol";

interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

interface StoredBrowserDevice {
  id: string;
  ownerUserId: string;
  name: string;
  trustedAt: string;
  lastSeenAt: string;
}

interface StoredHost {
  id: string;
  displayName: string;
  platform: string;
  agentVersion: string;
  hostSecretHash: string;
  ownerUserId: string | null;
  pairedAt: string | null;
  online: boolean;
  lastSeenAt: string | null;
}

interface StoredPairing {
  token: string;
  hostId: string;
  expiresAt: string;
  claimedAt: string | null;
  claimedByUserId: string | null;
  claimedByDeviceId: string | null;
}

interface StoredRelaySession {
  id: string;
  hostId: string;
  ownerUserId: string;
  browserDeviceId: string;
  browserName: string;
  browserPublicKey: JsonWebKey;
  agentPublicKey: JsonWebKey;
  createdAt: string;
  lastSeenAt: string;
  endedAt: string | null;
}

interface StoredDatabase {
  serverSecret: string;
  users: StoredUser[];
  browserDevices: StoredBrowserDevice[];
  hosts: StoredHost[];
  pairings: StoredPairing[];
  relaySessions: StoredRelaySession[];
}

const DATA_DIR = process.env.POCKET_CODEX_DATA_DIR || path.join(os.homedir(), ".pocket-codex");
const DATA_FILE = path.join(DATA_DIR, "gateway-db.json");

function createEmptyDatabase(): StoredDatabase {
  return {
    serverSecret: randomBytes(32).toString("hex"),
    users: [],
    browserDevices: [],
    hosts: [],
    pairings: [],
    relaySessions: [],
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

function hashHostSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export class GatewayStore {
  private database: StoredDatabase;

  constructor() {
    this.database = this.readDatabase();
  }

  get serverSecret(): string {
    return this.database.serverSecret;
  }

  private readDatabase(): StoredDatabase {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
      const empty = createEmptyDatabase();
      fs.writeFileSync(DATA_FILE, JSON.stringify(empty, null, 2));
      return empty;
    }

    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Partial<StoredDatabase>;
    return {
      serverSecret: raw.serverSecret || randomBytes(32).toString("hex"),
      users: raw.users || [],
      browserDevices: raw.browserDevices || [],
      hosts: raw.hosts || [],
      pairings: raw.pairings || [],
      relaySessions: raw.relaySessions || [],
    };
  }

  private persist(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.database, null, 2));
  }

  registerUser(email: string, password: string, name: string): UserProfile {
    const normalizedEmail = normalizeEmail(email);
    if (this.database.users.some((user) => user.email === normalizedEmail)) {
      throw new Error("An account already exists for that email.");
    }

    const createdAt = new Date().toISOString();
    const user: StoredUser = {
      id: randomId("usr"),
      email: normalizedEmail,
      name: name.trim() || normalizedEmail.split("@")[0] || "Pocket Codex User",
      passwordHash: hashPassword(password),
      createdAt,
    };
    this.database.users.push(user);
    this.persist();
    return this.toUserProfile(user);
  }

  authenticateUser(email: string, password: string): UserProfile {
    const normalizedEmail = normalizeEmail(email);
    const user = this.database.users.find((candidate) => candidate.email === normalizedEmail);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error("Invalid email or password.");
    }
    return this.toUserProfile(user);
  }

  findUserById(userId: string): UserProfile | null {
    const user = this.database.users.find((candidate) => candidate.id === userId);
    return user ? this.toUserProfile(user) : null;
  }

  upsertBrowserDevice(input: {
    ownerUserId: string;
    browserDeviceId: string;
    browserName: string;
  }): BrowserDeviceSummary {
    const now = new Date().toISOString();
    const existing = this.database.browserDevices.find(
      (device) => device.id === input.browserDeviceId && device.ownerUserId === input.ownerUserId,
    );

    if (existing) {
      existing.name = input.browserName.trim() || existing.name;
      existing.lastSeenAt = now;
      this.persist();
      return this.toBrowserDeviceSummary(existing);
    }

    const created: StoredBrowserDevice = {
      id: input.browserDeviceId,
      ownerUserId: input.ownerUserId,
      name: input.browserName.trim() || "Pocket Codex Browser",
      trustedAt: now,
      lastSeenAt: now,
    };
    this.database.browserDevices.push(created);
    this.persist();
    return this.toBrowserDeviceSummary(created);
  }

  getBrowserDevice(ownerUserId: string, browserDeviceId: string): BrowserDeviceSummary | null {
    const device = this.database.browserDevices.find(
      (candidate) => candidate.id === browserDeviceId && candidate.ownerUserId === ownerUserId,
    );
    return device ? this.toBrowserDeviceSummary(device) : null;
  }

  listBrowserDevicesForUser(ownerUserId: string): BrowserDeviceSummary[] {
    return this.database.browserDevices
      .filter((device) => device.ownerUserId === ownerUserId)
      .map((device) => this.toBrowserDeviceSummary(device))
      .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt));
  }

  registerHost(input: {
    hostId: string;
    hostSecret: string;
    displayName: string;
    platform: string;
    agentVersion: string;
  }): HostSummary {
    const now = new Date().toISOString();
    const secretHash = hashHostSecret(input.hostSecret);
    const existing = this.database.hosts.find((host) => host.id === input.hostId);

    if (existing) {
      if (existing.hostSecretHash !== secretHash) {
        throw new Error("Host secret mismatch.");
      }
      existing.displayName = input.displayName.trim() || existing.displayName;
      existing.platform = input.platform;
      existing.agentVersion = input.agentVersion;
      existing.online = true;
      existing.lastSeenAt = now;
      this.persist();
      return this.toHostSummary(existing);
    }

    const host: StoredHost = {
      id: input.hostId,
      displayName: input.displayName.trim() || "Pocket Codex Host",
      platform: input.platform,
      agentVersion: input.agentVersion,
      hostSecretHash: secretHash,
      ownerUserId: null,
      pairedAt: null,
      online: true,
      lastSeenAt: now,
    };
    this.database.hosts.push(host);
    this.persist();
    return this.toHostSummary(host);
  }

  markHostOffline(hostId: string): HostSummary | null {
    const host = this.getHostRecord(hostId);
    if (!host) {
      return null;
    }
    host.online = false;
    host.lastSeenAt = new Date().toISOString();
    this.persist();
    return this.toHostSummary(host);
  }

  createPairing(hostId: string): { token: string; expiresAt: string; payload: string } {
    const host = this.getHostRecord(hostId);
    if (!host) {
      throw new Error("Unknown host.");
    }

    const token = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    this.database.pairings = this.database.pairings.filter(
      (pairing) => pairing.hostId !== hostId || pairing.claimedAt,
    );

    this.database.pairings.push({
      token,
      hostId,
      expiresAt,
      claimedAt: null,
      claimedByUserId: null,
      claimedByDeviceId: null,
    });
    this.persist();

    const payload: PairingQrPayload = {
      v: 1,
      kind: "pocket-codex-pairing",
      token,
      hostId,
      displayName: host.displayName,
      expiresAt,
    };

    return { token, expiresAt, payload: JSON.stringify(payload) };
  }

  claimPairing(input: {
    userId: string;
    token: string;
    browserDeviceId?: string | null;
    browserName?: string | null;
  }): { host: HostSummary; browserDevice: BrowserDeviceSummary | null } {
    const pairing = this.database.pairings.find((candidate) => candidate.token === input.token);
    if (!pairing) {
      throw new Error("That pairing code was not found.");
    }
    if (pairing.claimedAt) {
      throw new Error("That pairing code has already been used.");
    }
    if (Date.parse(pairing.expiresAt) < Date.now()) {
      throw new Error("That pairing code has expired.");
    }

    const host = this.getHostRecord(pairing.hostId);
    if (!host) {
      throw new Error("The host for that pairing code no longer exists.");
    }
    if (host.ownerUserId && host.ownerUserId !== input.userId) {
      throw new Error("That host is already paired to another account.");
    }

    host.ownerUserId = input.userId;
    host.pairedAt = new Date().toISOString();
    pairing.claimedAt = host.pairedAt;
    pairing.claimedByUserId = input.userId;

    let browserDevice: BrowserDeviceSummary | null = null;
    if (input.browserDeviceId) {
      browserDevice = this.upsertBrowserDevice({
        ownerUserId: input.userId,
        browserDeviceId: input.browserDeviceId,
        browserName: input.browserName?.trim() || "Pocket Codex Browser",
      });
      pairing.claimedByDeviceId = browserDevice.id;
    }

    this.persist();
    return {
      host: this.toHostSummary(host),
      browserDevice,
    };
  }

  createRelaySession(input: {
    sessionId: string;
    hostId: string;
    ownerUserId: string;
    browserDeviceId: string;
    browserName: string;
    browserPublicKey: JsonWebKey;
    agentPublicKey: JsonWebKey;
    createdAt?: string;
  }): RelaySessionSummary {
    const now = input.createdAt || new Date().toISOString();
    const session: StoredRelaySession = {
      id: input.sessionId,
      hostId: input.hostId,
      ownerUserId: input.ownerUserId,
      browserDeviceId: input.browserDeviceId,
      browserName: input.browserName,
      browserPublicKey: input.browserPublicKey,
      agentPublicKey: input.agentPublicKey,
      createdAt: now,
      lastSeenAt: now,
      endedAt: null,
    };
    this.database.relaySessions.push(session);
    this.persist();
    return this.toRelaySessionSummary(session);
  }

  getRelaySession(sessionId: string): RelaySessionSummary | null {
    const session = this.getRelaySessionRecord(sessionId);
    if (!session || session.endedAt) {
      return null;
    }
    return this.toRelaySessionSummary(session);
  }

  touchRelaySession(sessionId: string): RelaySessionSummary | null {
    const session = this.getRelaySessionRecord(sessionId);
    if (!session || session.endedAt) {
      return null;
    }
    session.lastSeenAt = new Date().toISOString();
    this.persist();
    return this.toRelaySessionSummary(session);
  }

  validateRelaySession(input: {
    sessionId: string;
    hostId: string;
    ownerUserId: string;
    browserDeviceId?: string | null;
  }): RelaySessionSummary | null {
    const session = this.getRelaySessionRecord(input.sessionId);
    if (!session || session.endedAt) {
      return null;
    }
    if (session.hostId !== input.hostId || session.ownerUserId !== input.ownerUserId) {
      return null;
    }
    if (input.browserDeviceId && session.browserDeviceId !== input.browserDeviceId) {
      return null;
    }
    return this.toRelaySessionSummary(session);
  }

  listHostsForUser(userId: string): HostSummary[] {
    return this.database.hosts
      .filter((host) => host.ownerUserId === userId)
      .map((host) => this.toHostSummary(host))
      .sort((left, right) => {
        const leftTime = left.lastSeenAt ? Date.parse(left.lastSeenAt) : 0;
        const rightTime = right.lastSeenAt ? Date.parse(right.lastSeenAt) : 0;
        return rightTime - leftTime;
      });
  }

  getHostSummary(hostId: string): HostSummary | null {
    const host = this.getHostRecord(hostId);
    return host ? this.toHostSummary(host) : null;
  }

  getHostOwner(hostId: string): string | null {
    return this.getHostRecord(hostId)?.ownerUserId || null;
  }

  private getHostRecord(hostId: string): StoredHost | undefined {
    return this.database.hosts.find((candidate) => candidate.id === hostId);
  }

  private getRelaySessionRecord(sessionId: string): StoredRelaySession | undefined {
    return this.database.relaySessions.find((candidate) => candidate.id === sessionId);
  }

  private toUserProfile(user: StoredUser): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }

  private toBrowserDeviceSummary(device: StoredBrowserDevice): BrowserDeviceSummary {
    return {
      id: device.id,
      name: device.name,
      trustedAt: device.trustedAt,
      lastSeenAt: device.lastSeenAt,
    };
  }

  private toHostSummary(host: StoredHost): HostSummary {
    return {
      id: host.id,
      displayName: host.displayName,
      platform: host.platform,
      agentVersion: host.agentVersion,
      paired: Boolean(host.ownerUserId),
      online: host.online,
      lastSeenAt: host.lastSeenAt,
      ownerUserId: host.ownerUserId,
    };
  }

  private toRelaySessionSummary(session: StoredRelaySession): RelaySessionSummary {
    return {
      id: session.id,
      hostId: session.hostId,
      browserDeviceId: session.browserDeviceId,
      browserName: session.browserName,
      createdAt: session.createdAt,
      agentPublicKey: session.agentPublicKey,
    };
  }
}

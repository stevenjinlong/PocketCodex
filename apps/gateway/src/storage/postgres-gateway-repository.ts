import { and, desc, eq, isNull } from "drizzle-orm";
import {
  browserDevices,
  createDatabase,
  gatewayConfig,
  hosts,
  pairings,
  relaySessions,
  users,
  type DatabaseClient,
} from "@pocket-codex/db";
import type {
  BrowserDeviceSummary,
  HostSummary,
  PairingQrPayload,
  RelaySessionSummary,
  UserProfile,
} from "@pocket-codex/protocol";

import {
  hashHostSecret,
  hashPassword,
  normalizeEmail,
  randomId,
  verifyPassword,
} from "./shared.js";
import type { GatewayRepository } from "./types.js";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function requireRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }
  return row;
}

export class PostgresGatewayRepository implements GatewayRepository {
  private readonly client: DatabaseClient;

  private serverSecret: string | null = null;

  constructor(connectionString = process.env.DATABASE_URL) {
    this.client = createDatabase(connectionString);
  }

  async init(): Promise<void> {
    await this.ensureControlPlaneTables();
    const existing = await this.client.db.select().from(gatewayConfig).where(eq(gatewayConfig.key, "server_secret")).limit(1);
    if (existing[0]?.value) {
      this.serverSecret = existing[0].value;
      return;
    }

    const secret = randomId("srv");
    await this.client.db.insert(gatewayConfig).values({
      key: "server_secret",
      value: secret,
    });
    this.serverSecret = secret;
  }

  async getServerSecret(): Promise<string> {
    if (!this.serverSecret) {
      await this.init();
    }
    return this.serverSecret as string;
  }

  async registerUser(email: string, password: string, name: string): Promise<UserProfile> {
    const normalized = normalizeEmail(email);
    const existing = await this.client.db.select().from(users).where(eq(users.email, normalized)).limit(1);
    if (existing[0]) {
      throw new Error("An account already exists for that email.");
    }

    const id = randomId("usr");
    const [created] = await this.client.db.insert(users).values({
      id,
      email: normalized,
      name: name.trim() || normalized.split("@")[0] || "Pocket Codex User",
      passwordHash: hashPassword(password),
    }).returning();

    return this.toUserProfile(requireRow(created, "Failed to create user."));
  }

  async authenticateUser(email: string, password: string): Promise<UserProfile> {
    const normalized = normalizeEmail(email);
    const [user] = await this.client.db.select().from(users).where(eq(users.email, normalized)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error("Invalid email or password.");
    }
    return this.toUserProfile(user);
  }

  async findUserById(userId: string): Promise<UserProfile | null> {
    const [user] = await this.client.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user ? this.toUserProfile(user) : null;
  }

  async upsertBrowserDevice(input: {
    ownerUserId: string;
    browserDeviceId: string;
    browserName: string;
  }): Promise<BrowserDeviceSummary> {
    const now = new Date();
    const [existing] = await this.client.db.select().from(browserDevices).where(
      and(
        eq(browserDevices.id, input.browserDeviceId),
        eq(browserDevices.ownerUserId, input.ownerUserId),
      ),
    ).limit(1);

    if (existing) {
      const [updated] = await this.client.db.update(browserDevices).set({
        name: input.browserName.trim() || existing.name,
        lastSeenAt: now,
      }).where(eq(browserDevices.id, existing.id)).returning();
      return this.toBrowserDeviceSummary(requireRow(updated, "Failed to update browser device."));
    }

    const [created] = await this.client.db.insert(browserDevices).values({
      id: input.browserDeviceId,
      ownerUserId: input.ownerUserId,
      name: input.browserName.trim() || "Pocket Codex Browser",
      trustedAt: now,
      lastSeenAt: now,
    }).returning();

    return this.toBrowserDeviceSummary(requireRow(created, "Failed to create browser device."));
  }

  async getBrowserDevice(ownerUserId: string, browserDeviceId: string): Promise<BrowserDeviceSummary | null> {
    const [device] = await this.client.db.select().from(browserDevices).where(
      and(
        eq(browserDevices.id, browserDeviceId),
        eq(browserDevices.ownerUserId, ownerUserId),
      ),
    ).limit(1);
    return device ? this.toBrowserDeviceSummary(device) : null;
  }

  async listBrowserDevicesForUser(ownerUserId: string): Promise<BrowserDeviceSummary[]> {
    const rows = await this.client.db.select().from(browserDevices)
      .where(eq(browserDevices.ownerUserId, ownerUserId))
      .orderBy(desc(browserDevices.lastSeenAt));
    return rows.map((row) => this.toBrowserDeviceSummary(row));
  }

  async registerHost(input: {
    hostId: string;
    hostSecret: string;
    displayName: string;
    platform: string;
    agentVersion: string;
  }): Promise<HostSummary> {
    const now = new Date();
    const secretHash = hashHostSecret(input.hostSecret);
    const [existing] = await this.client.db.select().from(hosts).where(eq(hosts.id, input.hostId)).limit(1);

    if (existing) {
      if (existing.hostSecretHash !== secretHash) {
        throw new Error("Host secret mismatch.");
      }

      const [updated] = await this.client.db.update(hosts).set({
        displayName: input.displayName.trim() || existing.displayName,
        platform: input.platform,
        agentVersion: input.agentVersion,
        online: true,
        lastSeenAt: now,
      }).where(eq(hosts.id, existing.id)).returning();

      return this.toHostSummary(requireRow(updated, "Failed to update host."));
    }

    const [created] = await this.client.db.insert(hosts).values({
      id: input.hostId,
      displayName: input.displayName.trim() || "Pocket Codex Host",
      platform: input.platform,
      agentVersion: input.agentVersion,
      hostSecretHash: secretHash,
      ownerUserId: null,
      pairedAt: null,
      online: true,
      lastSeenAt: now,
    }).returning();

    return this.toHostSummary(requireRow(created, "Failed to create host."));
  }

  async markHostOffline(hostId: string): Promise<HostSummary | null> {
    const [updated] = await this.client.db.update(hosts).set({
      online: false,
      lastSeenAt: new Date(),
    }).where(eq(hosts.id, hostId)).returning();
    return updated ? this.toHostSummary(updated) : null;
  }

  async createPairing(hostId: string): Promise<{ token: string; expiresAt: string; payload: string }> {
    const [host] = await this.client.db.select().from(hosts).where(eq(hosts.id, hostId)).limit(1);
    if (!host) {
      throw new Error("Unknown host.");
    }

    const token = randomId("pair");
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.client.db.delete(pairings).where(
      and(
        eq(pairings.hostId, hostId),
        isNull(pairings.claimedAt),
      ),
    );

    const qrPayload: PairingQrPayload = {
      v: 1,
      kind: "pocket-codex-pairing",
      token,
      hostId,
      displayName: host.displayName,
      expiresAt: expiresAt.toISOString(),
    };

    await this.client.db.insert(pairings).values({
      token,
      hostId,
      createdAt: new Date(),
      expiresAt,
      claimedAt: null,
      claimedByUserId: null,
      claimedByDeviceId: null,
      qrPayload,
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      payload: JSON.stringify(qrPayload),
    };
  }

  async claimPairing(input: {
    userId: string;
    token: string;
    browserDeviceId?: string | null;
    browserName?: string | null;
  }): Promise<{ host: HostSummary; browserDevice: BrowserDeviceSummary | null }> {
    return this.client.db.transaction(async (tx) => {
      const [pairing] = await tx.select().from(pairings).where(eq(pairings.token, input.token)).limit(1);
      if (!pairing) {
        throw new Error("That pairing code was not found.");
      }
      if (pairing.claimedAt) {
        throw new Error("That pairing code has already been used.");
      }
      if (pairing.expiresAt.getTime() < Date.now()) {
        throw new Error("That pairing code has expired.");
      }

      const [host] = await tx.select().from(hosts).where(eq(hosts.id, pairing.hostId)).limit(1);
      if (!host) {
        throw new Error("The host for that pairing code no longer exists.");
      }
      if (host.ownerUserId && host.ownerUserId !== input.userId) {
        throw new Error("That host is already paired to another account.");
      }

      const claimedAt = new Date();
      const [updatedHost] = await tx.update(hosts).set({
        ownerUserId: input.userId,
        pairedAt: claimedAt,
      }).where(eq(hosts.id, host.id)).returning();

      let browserDevice: BrowserDeviceSummary | null = null;
      let browserDeviceId: string | null = null;

      if (input.browserDeviceId) {
        const [existingDevice] = await tx.select().from(browserDevices).where(
          and(
            eq(browserDevices.id, input.browserDeviceId),
            eq(browserDevices.ownerUserId, input.userId),
          ),
        ).limit(1);

        if (existingDevice) {
          const [updatedDevice] = await tx.update(browserDevices).set({
            name: input.browserName?.trim() || existingDevice.name,
            lastSeenAt: claimedAt,
          }).where(eq(browserDevices.id, existingDevice.id)).returning();
          browserDevice = this.toBrowserDeviceSummary(requireRow(updatedDevice, "Failed to update browser device."));
        } else {
          const [createdDevice] = await tx.insert(browserDevices).values({
            id: input.browserDeviceId,
            ownerUserId: input.userId,
            name: input.browserName?.trim() || "Pocket Codex Browser",
            trustedAt: claimedAt,
            lastSeenAt: claimedAt,
          }).returning();
          browserDevice = this.toBrowserDeviceSummary(requireRow(createdDevice, "Failed to create browser device."));
        }

        browserDeviceId = browserDevice.id;
      }

      await tx.update(pairings).set({
        claimedAt,
        claimedByUserId: input.userId,
        claimedByDeviceId: browserDeviceId,
      }).where(eq(pairings.token, pairing.token));

      return {
        host: this.toHostSummary(requireRow(updatedHost, "Failed to pair host.")),
        browserDevice,
      };
    });
  }

  async createRelaySession(input: {
    sessionId: string;
    hostId: string;
    ownerUserId: string;
    browserDeviceId: string;
    browserName: string;
    browserPublicKey: JsonWebKey;
    agentPublicKey: JsonWebKey;
    createdAt?: string;
  }): Promise<RelaySessionSummary> {
    const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();
    const [created] = await this.client.db.insert(relaySessions).values({
      id: input.sessionId,
      hostId: input.hostId,
      ownerUserId: input.ownerUserId,
      browserDeviceId: input.browserDeviceId,
      browserName: input.browserName,
      status: "active",
      browserPublicKey: input.browserPublicKey,
      agentPublicKey: input.agentPublicKey,
      createdAt,
      lastSeenAt: createdAt,
      endedAt: null,
    }).returning();

    return this.toRelaySessionSummary(requireRow(created, "Failed to create relay session."));
  }

  async getRelaySession(sessionId: string): Promise<RelaySessionSummary | null> {
    const [session] = await this.client.db.select().from(relaySessions).where(
      and(
        eq(relaySessions.id, sessionId),
        eq(relaySessions.status, "active"),
        isNull(relaySessions.endedAt),
      ),
    ).limit(1);
    return session ? this.toRelaySessionSummary(session) : null;
  }

  async touchRelaySession(sessionId: string): Promise<RelaySessionSummary | null> {
    const [updated] = await this.client.db.update(relaySessions).set({
      lastSeenAt: new Date(),
    }).where(
      and(
        eq(relaySessions.id, sessionId),
        eq(relaySessions.status, "active"),
        isNull(relaySessions.endedAt),
      ),
    ).returning();
    return updated ? this.toRelaySessionSummary(updated) : null;
  }

  async validateRelaySession(input: {
    sessionId: string;
    hostId: string;
    ownerUserId: string;
    browserDeviceId?: string | null;
  }): Promise<RelaySessionSummary | null> {
    const conditions = [
      eq(relaySessions.id, input.sessionId),
      eq(relaySessions.hostId, input.hostId),
      eq(relaySessions.ownerUserId, input.ownerUserId),
      eq(relaySessions.status, "active"),
      isNull(relaySessions.endedAt),
    ];
    if (input.browserDeviceId) {
      conditions.push(eq(relaySessions.browserDeviceId, input.browserDeviceId));
    }

    const [session] = await this.client.db.select().from(relaySessions).where(and(...conditions)).limit(1);
    return session ? this.toRelaySessionSummary(session) : null;
  }

  async listHostsForUser(userId: string): Promise<HostSummary[]> {
    const rows = await this.client.db.select().from(hosts)
      .where(eq(hosts.ownerUserId, userId))
      .orderBy(desc(hosts.lastSeenAt));
    return rows.map((row) => this.toHostSummary(row));
  }

  async getHostSummary(hostId: string): Promise<HostSummary | null> {
    const [host] = await this.client.db.select().from(hosts).where(eq(hosts.id, hostId)).limit(1);
    return host ? this.toHostSummary(host) : null;
  }

  async getHostOwner(hostId: string): Promise<string | null> {
    const [host] = await this.client.db.select({ ownerUserId: hosts.ownerUserId }).from(hosts).where(eq(hosts.id, hostId)).limit(1);
    return host?.ownerUserId || null;
  }

  async close(): Promise<void> {
    await this.client.pool.end();
  }

  private async ensureControlPlaneTables(): Promise<void> {
    await this.client.pool.query(`
      DO $$ BEGIN
        CREATE TYPE relay_session_status AS ENUM ('active', 'closed', 'revoked');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS gateway_config (
        key text PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        email text NOT NULL UNIQUE,
        name text NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS browser_devices (
        id text PRIMARY KEY,
        owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        trusted_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS browser_devices_owner_idx ON browser_devices(owner_user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS browser_devices_owner_name_key ON browser_devices(owner_user_id, name);

      CREATE TABLE IF NOT EXISTS hosts (
        id text PRIMARY KEY,
        owner_user_id text REFERENCES users(id) ON DELETE SET NULL,
        display_name text NOT NULL,
        platform text NOT NULL,
        agent_version text NOT NULL,
        host_secret_hash text NOT NULL,
        paired_at timestamptz,
        online boolean NOT NULL DEFAULT false,
        last_seen_at timestamptz
      );

      CREATE INDEX IF NOT EXISTS hosts_owner_idx ON hosts(owner_user_id);

      CREATE TABLE IF NOT EXISTS pairings (
        token text PRIMARY KEY,
        host_id text NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        claimed_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
        claimed_by_device_id text REFERENCES browser_devices(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        claimed_at timestamptz,
        qr_payload jsonb NOT NULL
      );

      CREATE INDEX IF NOT EXISTS pairings_host_idx ON pairings(host_id);

      CREATE TABLE IF NOT EXISTS relay_sessions (
        id text PRIMARY KEY,
        host_id text NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        browser_device_id text NOT NULL REFERENCES browser_devices(id) ON DELETE CASCADE,
        browser_name text NOT NULL DEFAULT 'Pocket Codex Browser',
        status relay_session_status NOT NULL DEFAULT 'active',
        browser_public_key jsonb NOT NULL,
        agent_public_key jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        ended_at timestamptz
      );

      CREATE INDEX IF NOT EXISTS relay_sessions_host_idx ON relay_sessions(host_id);
      CREATE INDEX IF NOT EXISTS relay_sessions_owner_idx ON relay_sessions(owner_user_id);
      CREATE INDEX IF NOT EXISTS relay_sessions_device_idx ON relay_sessions(browser_device_id);

      ALTER TABLE relay_sessions ADD COLUMN IF NOT EXISTS browser_name text NOT NULL DEFAULT 'Pocket Codex Browser';
    `);
  }

  private toUserProfile(row: typeof users.$inferSelect): UserProfile {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: toIso(row.createdAt) || new Date(0).toISOString(),
    };
  }

  private toBrowserDeviceSummary(row: typeof browserDevices.$inferSelect): BrowserDeviceSummary {
    return {
      id: row.id,
      name: row.name,
      trustedAt: toIso(row.trustedAt) || new Date(0).toISOString(),
      lastSeenAt: toIso(row.lastSeenAt) || new Date(0).toISOString(),
    };
  }

  private toHostSummary(row: typeof hosts.$inferSelect): HostSummary {
    return {
      id: row.id,
      displayName: row.displayName,
      platform: row.platform,
      agentVersion: row.agentVersion,
      paired: Boolean(row.ownerUserId),
      online: row.online,
      lastSeenAt: toIso(row.lastSeenAt),
      ownerUserId: row.ownerUserId,
    };
  }

  private toRelaySessionSummary(row: typeof relaySessions.$inferSelect): RelaySessionSummary {
    return {
      id: row.id,
      hostId: row.hostId,
      browserDeviceId: row.browserDeviceId,
      browserName: row.browserName,
      createdAt: toIso(row.createdAt) || new Date(0).toISOString(),
      agentPublicKey: row.agentPublicKey as JsonWebKey,
    };
  }
}

import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { PairingQrPayload } from "@pocket-codex/protocol";

export const relaySessionStatusEnum = pgEnum("relay_session_status", [
  "active",
  "closed",
  "revoked",
]);

export const gatewayConfig = pgTable("gateway_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_key").on(table.email)],
);

export const browserDevices = pgTable(
  "browser_devices",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trustedAt: timestamp("trusted_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("browser_devices_owner_idx").on(table.ownerUserId),
    uniqueIndex("browser_devices_owner_name_key").on(table.ownerUserId, table.name),
  ],
);

export const hosts = pgTable(
  "hosts",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    platform: text("platform").notNull(),
    agentVersion: text("agent_version").notNull(),
    hostSecretHash: text("host_secret_hash").notNull(),
    pairedAt: timestamp("paired_at", { withTimezone: true }),
    online: boolean("online").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (table) => [index("hosts_owner_idx").on(table.ownerUserId)],
);

export const pairings = pgTable(
  "pairings",
  {
    token: text("token").primaryKey(),
    hostId: text("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    claimedByUserId: text("claimed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    claimedByDeviceId: text("claimed_by_device_id").references(() => browserDevices.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    qrPayload: jsonb("qr_payload").$type<PairingQrPayload>().notNull(),
  },
  (table) => [index("pairings_host_idx").on(table.hostId)],
);

export const relaySessions = pgTable(
  "relay_sessions",
  {
    id: text("id").primaryKey(),
    hostId: text("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    browserDeviceId: text("browser_device_id")
      .notNull()
      .references(() => browserDevices.id, { onDelete: "cascade" }),
    browserName: text("browser_name").notNull(),
    status: relaySessionStatusEnum("status").notNull().default("active"),
    browserPublicKey: jsonb("browser_public_key").$type<JsonWebKey>().notNull(),
    agentPublicKey: jsonb("agent_public_key").$type<JsonWebKey>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("relay_sessions_host_idx").on(table.hostId),
    index("relay_sessions_owner_idx").on(table.ownerUserId),
    index("relay_sessions_device_idx").on(table.browserDeviceId),
  ],
);

export const schema = {
  gatewayConfig,
  users,
  browserDevices,
  hosts,
  pairings,
  relaySessions,
};

export type PocketCodexSchema = typeof schema;

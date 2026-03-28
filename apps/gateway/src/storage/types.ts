import type {
  BrowserDeviceSummary,
  HostSummary,
  RelaySessionSummary,
  UserProfile,
} from "@pocket-codex/protocol";

export interface GatewayRepository {
  getServerSecret(): Promise<string>;
  registerUser(email: string, password: string, name: string): Promise<UserProfile>;
  authenticateUser(email: string, password: string): Promise<UserProfile>;
  findUserById(userId: string): Promise<UserProfile | null>;
  upsertBrowserDevice(input: {
    ownerUserId: string;
    browserDeviceId: string;
    browserName: string;
  }): Promise<BrowserDeviceSummary>;
  getBrowserDevice(ownerUserId: string, browserDeviceId: string): Promise<BrowserDeviceSummary | null>;
  listBrowserDevicesForUser(ownerUserId: string): Promise<BrowserDeviceSummary[]>;
  registerHost(input: {
    hostId: string;
    hostSecret: string;
    displayName: string;
    platform: string;
    agentVersion: string;
  }): Promise<HostSummary>;
  markHostOffline(hostId: string): Promise<HostSummary | null>;
  createPairing(hostId: string): Promise<{ token: string; expiresAt: string; payload: string }>;
  claimPairing(input: {
    userId: string;
    token: string;
    browserDeviceId?: string | null;
    browserName?: string | null;
  }): Promise<{ host: HostSummary; browserDevice: BrowserDeviceSummary | null }>;
  createRelaySession(input: {
    sessionId: string;
    hostId: string;
    ownerUserId: string;
    browserDeviceId: string;
    browserName: string;
    browserPublicKey: JsonWebKey;
    agentPublicKey: JsonWebKey;
    createdAt?: string;
  }): Promise<RelaySessionSummary>;
  getRelaySession(sessionId: string): Promise<RelaySessionSummary | null>;
  touchRelaySession(sessionId: string): Promise<RelaySessionSummary | null>;
  validateRelaySession(input: {
    sessionId: string;
    hostId: string;
    ownerUserId: string;
    browserDeviceId?: string | null;
  }): Promise<RelaySessionSummary | null>;
  listHostsForUser(userId: string): Promise<HostSummary[]>;
  getHostSummary(hostId: string): Promise<HostSummary | null>;
  getHostOwner(hostId: string): Promise<string | null>;
  close(): Promise<void>;
}

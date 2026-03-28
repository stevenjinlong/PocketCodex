import { JsonGatewayRepository } from "./json-gateway-repository.js";
import { PostgresGatewayRepository } from "./postgres-gateway-repository.js";
import type { GatewayRepository } from "./types.js";

export type GatewayStorageBackend = "json" | "postgres";
export const DEFAULT_LOCAL_DATABASE_URL = "postgres://pocket_codex:pocket_codex@localhost:5432/pocket_codex";

function resolveBackend(): GatewayStorageBackend {
  const configured = process.env.POCKET_CODEX_STORAGE_BACKEND;
  if (configured === "json" || configured === "postgres") {
    return configured;
  }

  return "postgres";
}

function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
}

export async function createGatewayRepository(): Promise<GatewayRepository> {
  const backend = resolveBackend();

  if (backend === "postgres") {
    const repository = new PostgresGatewayRepository(resolveDatabaseUrl());

    try {
      await repository.init();
      return repository;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown database error.";
      throw new Error(
        `Failed to initialize Postgres storage at ${resolveDatabaseUrl()}. Start the database with "npm run db:up", or set POCKET_CODEX_STORAGE_BACKEND=json to use the legacy JSON store. ${message}`,
      );
    }
  }

  return new JsonGatewayRepository();
}

export type { GatewayRepository } from "./types.js";

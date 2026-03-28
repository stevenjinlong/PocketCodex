import { JsonGatewayRepository } from "./json-gateway-repository.js";
import { PostgresGatewayRepository } from "./postgres-gateway-repository.js";
import type { GatewayRepository } from "./types.js";

export type GatewayStorageBackend = "json" | "postgres";

function resolveBackend(): GatewayStorageBackend {
  const configured = process.env.POCKET_CODEX_STORAGE_BACKEND;
  if (configured === "json" || configured === "postgres") {
    return configured;
  }

  return process.env.DATABASE_URL ? "postgres" : "json";
}

export async function createGatewayRepository(): Promise<GatewayRepository> {
  const backend = resolveBackend();

  if (backend === "postgres") {
    const repository = new PostgresGatewayRepository();
    await repository.init();
    return repository;
  }

  return new JsonGatewayRepository();
}

export type { GatewayRepository } from "./types.js";

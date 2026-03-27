import type { RelayEnvelope } from "@pocket-codex/protocol";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is unavailable in this runtime.");
  }
  return globalThis.crypto;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export interface SessionKeyPair {
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
}

export async function generateSessionKeyPair(): Promise<SessionKeyPair> {
  const cryptoApi = getWebCrypto();
  const pair = await cryptoApi.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey"],
  );

  return {
    publicKey: (await cryptoApi.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey,
    privateKey: pair.privateKey,
  };
}

export async function deriveSessionKey(
  privateKey: CryptoKey,
  peerPublicKey: JsonWebKey,
): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  const importedPeerKey = await cryptoApi.subtle.importKey(
    "jwk",
    peerPublicKey,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    [],
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: "ECDH",
      public: importedPeerKey,
    },
    privateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptRelayMessage(
  key: CryptoKey,
  payload: unknown,
): Promise<RelayEnvelope> {
  const cryptoApi = getWebCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const encoded = ENCODER.encode(JSON.stringify(payload));
  const ciphertext = await cryptoApi.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoded,
  );

  return {
    alg: "A256GCM",
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptRelayMessage<T>(
  key: CryptoKey,
  envelope: RelayEnvelope,
): Promise<T> {
  const cryptoApi = getWebCrypto();
  const iv = fromBase64Url(envelope.iv) as BufferSource;
  const ciphertext = fromBase64Url(envelope.ciphertext) as BufferSource;
  const plaintext = await cryptoApi.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    ciphertext,
  );

  return JSON.parse(DECODER.decode(plaintext)) as T;
}

export function createDeviceId(prefix = "device"): string {
  const cryptoApi = getWebCrypto();
  return `${prefix}_${cryptoApi.randomUUID()}`;
}

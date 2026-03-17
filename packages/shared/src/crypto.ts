/**
 * AES-256-GCM encryption utilities for game secrets.
 * Works in both Node 18+ (using globalThis.crypto) and browsers (Web Crypto API).
 *
 * Encrypted values are stored as: "enc:<base64(12-byte IV + ciphertext)>"
 */

const PREFIX = "enc:";

/** Returns true if the value looks like an encrypted blob. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Generate a new random AES-256-GCM key, returned as base64. */
export async function generateGameKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return _b64encode(raw);
}

/** Encrypt a plaintext string with the given base64 key. Returns "enc:<base64>". */
export async function encryptSecret(plaintext: string, base64Key: string): Promise<string> {
  const key = await _importKey(base64Key);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const iv = ivBytes.buffer.slice(ivBytes.byteOffset, ivBytes.byteOffset + ivBytes.byteLength) as ArrayBuffer;
  const data = _strToBuffer(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  // Pack IV + ciphertext into one buffer
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(ivBytes, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return PREFIX + _b64encode(combined.buffer);
}

/** Decrypt an "enc:<base64>" value with the given base64 key. */
export async function decryptSecret(encrypted: string, base64Key: string): Promise<string> {
  if (!isEncrypted(encrypted)) return encrypted;
  const combined = _b64decodeBuffer(encrypted.slice(PREFIX.length));
  const iv = combined.slice(0, 12) as ArrayBuffer;
  const ciphertext = combined.slice(12) as ArrayBuffer;
  const key = await _importKey(base64Key);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ─── Helpers ──────────────────────────────────────────────────

function _b64encode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function _b64decodeBuffer(b64: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function _strToBuffer(str: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(str);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

async function _importKey(base64Key: string): Promise<CryptoKey> {
  const keyBuffer = _b64decodeBuffer(base64Key);
  return crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// Symmetric encryption for secrets stored in the database (e.g. the Claude API key).
// AES-256-GCM with a key derived from SETTINGS_SECRET (falls back to AUTH_SECRET).
// The stored format is "iv:authTag:ciphertext", all base64.

import crypto from "node:crypto";

function secretKey(): Buffer {
  const secret =
    process.env.SETTINGS_SECRET || process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
  // Derive a fixed 32-byte key regardless of the source secret length.
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    // Wrong secret / corrupted payload — treat as "no key".
    return null;
  }
}

/** Mask a secret for display, keeping only the last 4 characters. */
export function maskSecret(last4?: string | null): string {
  return last4 ? `••••${last4}` : "—";
}

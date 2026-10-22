import { createHmac, randomBytes } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238: HMAC-SHA1, 30-second steps,
 * 6 digits), the format used by Google Authenticator, Microsoft
 * Authenticator, 1Password and similar apps.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totpAt(secretBase32: string, step: number): string {
  return hotp(base32Decode(secretBase32), step);
}

/**
 * Checks a code against the current step and one step either side (clock
 * drift). Returns the matching step, or null. Steps at or before `lastStep`
 * are refused, so an intercepted code cannot be replayed.
 */
export function verifyTotp(secretBase32: string, code: string, opts: { now?: Date; lastStep?: number | null } = {}): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = timeStep(opts.now);
  for (const step of [current - 1, current, current + 1]) {
    if (opts.lastStep != null && step <= opts.lastStep) continue;
    if (totpAt(secretBase32, step) === clean) return step;
  }
  return null;
}

export function otpauthUri(secretBase32: string, account: string, issuer = "AutoSutra"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}

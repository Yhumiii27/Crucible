import 'server-only';
// Secret tokens of the devices (CR-071) and of the calendar subscriptions (CR-072): 32 random bytes, shown once, kept only as
// their SHA-256 hash. A token is compared by hash lookup (unique index), never by string comparison of the secret.
import { createHash, randomBytes } from 'node:crypto';

/** "crd_…" or "crc_…": a prefix telling what the token opens, then 43 base64url characters. */
export function newToken(prefix: 'crd' | 'crc'): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

/** A token as sent: the expected prefix and length, else null (no lookup is made). */
export function readToken(raw: string | null | undefined, prefix: 'crd' | 'crc'): string | null {
  const s = (raw ?? '').trim();
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`).test(s) ? s : null;
}

/** The token of an `Authorization: Bearer …` header. */
export function bearerOf(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return m ? m[1] : null;
}

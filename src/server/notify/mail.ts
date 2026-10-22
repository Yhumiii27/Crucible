import 'server-only';
// E-mail of the notifications (F-8), run by the job worker: the notifications not e-mailed yet go to their recipient's address,
// in French (the default language), through the configured transport. `file` writes one RFC 822 message per notification in
// CRUCIBLE_MAIL_DIR (tests, or a relay that picks the files up); `none` sends nothing (the bell only). A message is marked sent
// only once written.
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { makeT } from '@/i18n/translate';
import { notifications, users } from '@/server/db/schema';
import type { DB } from '@/server/db/types';

export interface MailSettings {
  transport: 'none' | 'file';
  dir: string | null;
  from: string;
  /** Public address of Crucible, for the links (NEXT_PUBLIC_APP_URL); empty = relative links. */
  baseUrl?: string;
}

/** RFC 2047 encoded subject (UTF-8, base64). */
const subjectOf = (s: string) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;

export async function sendPendingMail(db: DB, m: MailSettings, now = new Date()): Promise<number> {
  if (m.transport !== 'file' || !m.dir) return 0;
  const rows = await db.select({ n: notifications, email: users.email, name: users.displayName }).from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId)).where(and(isNull(notifications.emailedAt), eq(users.active, true))).limit(500);
  if (!rows.length) return 0;
  await fs.mkdir(m.dir, { recursive: true });
  const t = makeT('fr');
  let sent = 0;
  for (const r of rows) {
    const title = r.n.title.split(' · ').map((x, i) => (i === 0 ? t(x) : x)).join(' · ');
    const link = r.n.href ? `${m.baseUrl ?? ''}${r.n.href}` : '';
    const body = [`Bonjour ${r.name},`, '', title, ...(link ? ['', link] : []), '', '— Crucible'].join('\r\n');
    const message = [
      `From: Crucible <${m.from}>`, `To: ${r.email}`, `Subject: ${subjectOf(`Crucible · ${title}`)}`, `Date: ${now.toUTCString()}`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', body, '',
    ].join('\r\n');
    await fs.writeFile(path.join(m.dir, `${now.getTime()}-${r.n.id}.eml`), message, 'utf8');
    await db.update(notifications).set({ emailedAt: now }).where(eq(notifications.id, r.n.id));
    sent++;
  }
  return sent;
}

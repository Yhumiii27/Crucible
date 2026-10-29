import 'server-only';
// E-mail of the notifications (F-8, CR-072, X-9), run by the job worker: the notifications not e-mailed yet go to their
// recipient's address, in French (the default language). A notification about a booking (confirmed, moved, cancelled) carries
// its calendar invitation (text/calendar, METHOD REQUEST or CANCEL), which Outlook — and so Teams — adds to, updates in or
// removes from the person's calendar. The message is composed once (MIME) and handed to the configured transport:
//   file   one .eml per message in CRUCIBLE_MAIL_DIR (tests, or a relay that picks the files up);
//   smtp   the group's relay, CRUCIBLE_SMTP_URL;
//   graph  Microsoft Graph sendMail from the CRUCIBLE_MAIL_FROM mailbox, the MIME message as is (application permission
//          Mail.Send, client credentials);
//   none   nothing (the bell only).
// A message is marked sent only once the transport accepted it; a failure is logged and retried at the next run; three
// failures in a row stop the run (a relay down is not hammered).
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { makeT } from '@/i18n/translate';
import { parisParts } from '@/lib/dates';
import { bookingInvitation } from '@/server/calendar';
import type { MailConfig } from '@/server/config/parse';
import { notifications, users } from '@/server/db/schema';
import type { DB } from '@/server/db/types';
import { log } from '@/server/log';

export interface MailSettings extends Omit<MailConfig, 'smtpUrl' | 'graph'> {
  smtpUrl?: MailConfig['smtpUrl'];
  graph?: MailConfig['graph'];
  /** Public address of Crucible, for the links; empty = relative links. */
  baseUrl?: string;
}

/** One message, before composition. */
export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  /** Calendar invitation (RFC 5546). */
  ics?: { method: 'REQUEST' | 'CANCEL'; content: string };
}

/** What the transports need from outside (replaced in tests). */
export interface MailDeps {
  fetch?: typeof fetch;
  /** SMTP delivery of a composed message (defaults to nodemailer on CRUCIBLE_SMTP_URL). */
  smtp?: (url: string, envelope: { from: string; to: string }, raw: Buffer) => Promise<void>;
}

const optionsOf = (from: string, m: OutgoingMail) => ({
  from: { name: 'Crucible', address: from },
  to: m.to,
  subject: m.subject,
  text: m.text,
  ...(m.ics ? { icalEvent: { method: m.ics.method, filename: 'invitation.ics', content: m.ics.content } } : {}),
});

/** The MIME message (RFC 5322, CRLF line ends), composed by nodemailer without sending it. */
export async function composeMail(from: string, m: OutgoingMail): Promise<Buffer> {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
  const info = await composer.sendMail(optionsOf(from, m));
  return info.message as Buffer;
}

const smtpTransports = new Map<string, ReturnType<typeof nodemailer.createTransport>>();

async function smtpSend(url: string, envelope: { from: string; to: string }, raw: Buffer): Promise<void> {
  let tr = smtpTransports.get(url);
  if (!tr) {
    tr = nodemailer.createTransport(url);
    smtpTransports.set(url, tr);
  }
  await tr.sendMail({ envelope, raw });
}

const graphTokens = new Map<string, { token: string; until: number }>();

/** An application token of Microsoft Graph (client credentials), kept until a minute before it expires. */
async function graphToken(g: NonNullable<MailConfig['graph']>, doFetch: typeof fetch): Promise<string> {
  const key = `${g.tenantId}:${g.clientId}`;
  const cached = graphTokens.get(key);
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await doFetch(`https://login.microsoftonline.com/${encodeURIComponent(g.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: g.clientId, client_secret: g.clientSecret, scope: 'https://graph.microsoft.com/.default' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Microsoft Graph token refused: ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Microsoft Graph token missing');
  graphTokens.set(key, { token: body.access_token, until: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 });
  return body.access_token;
}

/** Graph sendMail with the MIME message as is (base64), from the sending mailbox; 202 = accepted. */
async function graphSend(g: NonNullable<MailConfig['graph']>, from: string, raw: Buffer, doFetch: typeof fetch): Promise<void> {
  const token = await graphToken(g, doFetch);
  const res = await doFetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: raw.toString('base64'),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 202 && !res.ok) throw new Error(`Microsoft Graph sendMail refused: ${res.status}`);
}

/** Hands one composed message to the transport. */
async function deliver(m: MailSettings, id: string, to: string, raw: Buffer, now: Date, deps: MailDeps): Promise<void> {
  switch (m.transport) {
    case 'file':
      await fs.mkdir(m.dir!, { recursive: true });
      await fs.writeFile(path.join(m.dir!, `${now.getTime()}-${id}.eml`), raw);
      return;
    case 'smtp':
      await (deps.smtp ?? smtpSend)(m.smtpUrl!, { from: m.from, to }, raw);
      return;
    case 'graph':
      await graphSend(m.graph!, m.from, raw, deps.fetch ?? fetch);
      return;
    default:
      throw new Error(`No e-mail transport: ${m.transport}`);
  }
}

const ready = (m: MailSettings) =>
  (m.transport === 'file' && !!m.dir) || (m.transport === 'smtp' && !!m.smtpUrl) || (m.transport === 'graph' && !!m.graph);

export async function sendPendingMail(db: DB, m: MailSettings, now = new Date(), deps: MailDeps = {}): Promise<number> {
  if (!ready(m)) return 0;
  const rows = await db.select({ n: notifications, email: users.email, name: users.displayName }).from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId)).where(and(isNull(notifications.emailedAt), eq(users.active, true))).limit(500);
  if (!rows.length) return 0;
  const t = makeT('fr');
  const today = parisParts(now).iso;
  let sent = 0;
  let failures = 0;
  for (const r of rows) {
    const title = r.n.title.split(' · ').map((x, i) => (i === 0 ? t(x) : x)).join(' · ');
    const link = r.n.href ? `${m.baseUrl ?? ''}${r.n.href}` : '';
    const invitation = r.n.bookingId
      ? await bookingInvitation(db, r.n.bookingId, { userId: r.n.userId, email: r.email, name: r.name }, { from: m.from, baseUrl: m.baseUrl ?? '', now, today })
      : null;
    const text = [
      `Bonjour ${r.name},`, '', title, ...(link ? ['', link] : []),
      ...(invitation ? ['', invitation.method === 'CANCEL' ? t('The invitation attached removes the test from your calendar.') : t('The invitation attached adds the test to your calendar.')] : []),
      '', '— Crucible',
    ].join('\n');
    try {
      const mail: OutgoingMail = { to: r.email, subject: `Crucible · ${title}`, text, ...(invitation ? { ics: { method: invitation.method, content: invitation.ics } } : {}) };
      await deliver(m, r.n.id, r.email, await composeMail(m.from, mail), now, deps);
    } catch (e) {
      failures++;
      log.warn('E-mail not sent; retried at the next run', { component: 'mail', transport: m.transport, notification: r.n.id, error: e instanceof Error ? e.message : String(e) });
      if (failures >= 3) break;
      continue;
    }
    failures = 0;
    await db.transaction(async (tx) => {
      await tx.update(notifications).set({ emailedAt: now }).where(eq(notifications.id, r.n.id));
    });
    sent++;
  }
  return sent;
}

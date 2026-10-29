// iCalendar (RFC 5545) for Outlook and Teams (CR-072, X-9): the invitation attached to the e-mail of a confirmed, moved or
// cancelled booking (METHOD:REQUEST / CANCEL, RFC 5546), and the subscription feeds (no METHOD, refreshed hourly). One event per
// booking, its UID stable, its SEQUENCE growing with each change so that the calendar replaces the previous version. Pure.

export type IcsStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';

export interface IcsEvent {
  uid: string;
  /** Grows with each change of the booking. */
  sequence: number;
  /** Epoch ms. */
  start: number;
  end: number;
  summary: string;
  location?: string;
  description?: string;
  status: IcsStatus;
  url?: string;
}

/** Text value: backslash, semicolon, comma and line breaks escaped (RFC 5545 §3.3.11). */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** UTC date-time: 20261022T091500Z. */
export function icsTime(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const utf8 = new TextEncoder();

/** Lines longer than 75 octets folded with CRLF + space, never inside a UTF-8 character (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = utf8.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** SEQUENCE of a booking: seconds since 1 Jan 2026 of its last change (grows with each change, stays a 32-bit integer). */
export const sequenceOf = (updatedAt: number) => Math.max(0, Math.floor((updatedAt - Date.UTC(2026, 0, 1)) / 1000));

export interface IcsCalendar {
  /** Invitation (REQUEST, CANCEL) or none for a subscription feed. */
  method?: 'REQUEST' | 'CANCEL';
  /** Calendar name shown by Outlook (feeds). */
  name?: string;
  /** Organizer and attendee of an invitation (e-mail addresses). */
  organizer?: string;
  attendee?: { email: string; name: string };
  events: readonly IcsEvent[];
  /** DTSTAMP, epoch ms. */
  now: number;
}

export function icsCalendar(c: IcsCalendar): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EPC2I//Crucible//FR', 'CALSCALE:GREGORIAN'];
  if (c.method) lines.push(`METHOD:${c.method}`);
  if (c.name) lines.push(`X-WR-CALNAME:${icsText(c.name)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H');
  for (const e of c.events) {
    lines.push(
      'BEGIN:VEVENT', `UID:${e.uid}`, `SEQUENCE:${e.sequence}`, `DTSTAMP:${icsTime(c.now)}`, `DTSTART:${icsTime(e.start)}`, `DTEND:${icsTime(e.end)}`,
      `SUMMARY:${icsText(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.status}`, `TRANSP:${e.status === 'CANCELLED' ? 'TRANSPARENT' : 'OPAQUE'}`);
    if (c.organizer) lines.push(`ORGANIZER;CN=Crucible:mailto:${c.organizer}`);
    if (c.attendee) lines.push(`ATTENDEE;CN=${icsText(c.attendee.name).replace(/[:"]/g, '')};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${c.attendee.email}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** Calendar status of a booking status: a request is tentative; cancelled and not held are cancelled. */
export function icsStatusOf(status: string): IcsStatus {
  if (status === 'requested') return 'TENTATIVE';
  if (status === 'cancelled' || status === 'no_show') return 'CANCELLED';
  return 'CONFIRMED';
}

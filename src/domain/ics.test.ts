// iCalendar for Outlook and Teams (CR-072, X-9): escaping, folding at 75 octets, an invitation (REQUEST, CANCEL) with its
// organizer and attendee, a subscription feed without METHOD, and the statuses of the bookings.
import { describe, expect, it } from 'vitest';
import { foldLine, icsCalendar, icsStatusOf, icsText, icsTime, sequenceOf } from './ics';

const event = {
  uid: 'b1@crucible.epc2i', sequence: 7, start: Date.UTC(2026, 9, 27, 6), end: Date.UTC(2026, 9, 27, 16),
  summary: 'PDE-PIL · RD-ORION · Essai de tenue, phase 2', location: 'PDE · Pilote', description: 'Référence : B-2026-0011\nStatut : Confirmée', status: 'CONFIRMED' as const,
};

describe('values', () => {
  it('escapes text, writes UTC times, folds long lines without cutting a UTF-8 character', () => {
    expect(icsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    expect(icsTime(Date.UTC(2026, 9, 22, 9, 15))).toBe('20261022T091500Z');
    const long = `SUMMARY:${'é'.repeat(60)}`;
    const folded = foldLine(long).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
  });

  it('a request is tentative; cancelled and not held are cancelled; the sequence grows with the change', () => {
    expect(icsStatusOf('requested')).toBe('TENTATIVE');
    expect(icsStatusOf('confirmed')).toBe('CONFIRMED');
    expect(icsStatusOf('done')).toBe('CONFIRMED');
    expect(icsStatusOf('cancelled')).toBe('CANCELLED');
    expect(icsStatusOf('no_show')).toBe('CANCELLED');
    expect(sequenceOf(Date.UTC(2026, 9, 22))).toBeGreaterThan(sequenceOf(Date.UTC(2026, 9, 21)));
    expect(sequenceOf(Date.UTC(2025, 0, 1))).toBe(0);
  });
});

describe('icsCalendar', () => {
  it('an invitation: METHOD, organizer, attendee, CRLF line ends', () => {
    const raw = icsCalendar({ method: 'REQUEST', organizer: 'crucible@groupe.fr', attendee: { email: 'c.fabre@groupe.fr', name: 'Camille Fabre' }, events: [event], now: Date.UTC(2026, 9, 22, 9) });
    expect(raw).not.toMatch(/[^\r]\n/);
    const ics = raw.replace(/\r\n /g, '');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//EPC2I//Crucible//FR\r\nCALSCALE:GREGORIAN\r\nMETHOD:REQUEST\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('\r\nUID:b1@crucible.epc2i\r\nSEQUENCE:7\r\nDTSTAMP:20261022T090000Z\r\nDTSTART:20261027T060000Z\r\nDTEND:20261027T160000Z\r\n');
    expect(ics).toContain('SUMMARY:PDE-PIL · RD-ORION · Essai de tenue\\, phase 2\r\n');
    expect(ics).toContain('DESCRIPTION:Référence : B-2026-0011\\nStatut : Confirmée\r\n');
    expect(ics).toContain('STATUS:CONFIRMED\r\nTRANSP:OPAQUE\r\nORGANIZER;CN=Crucible:mailto:crucible@groupe.fr\r\n');
    expect(ics).toContain('ATTENDEE;CN=Camille Fabre;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:c.fabre@groupe.fr\r\n');
  });

  it('a cancellation is transparent; a feed has a name and a refresh interval, and no METHOD', () => {
    expect(icsCalendar({ method: 'CANCEL', events: [{ ...event, status: 'CANCELLED' }], now: 0 })).toContain('METHOD:CANCEL\r\n');
    expect(icsCalendar({ method: 'CANCEL', events: [{ ...event, status: 'CANCELLED' }], now: 0 })).toContain('STATUS:CANCELLED\r\nTRANSP:TRANSPARENT\r\n');
    const feed = icsCalendar({ name: 'Crucible · Mes essais', events: [event, { ...event, uid: 'b2@crucible.epc2i' }], now: 0 });
    expect(feed).not.toContain('METHOD:');
    expect(feed).toContain('X-WR-CALNAME:Crucible · Mes essais\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\nX-PUBLISHED-TTL:PT1H\r\n');
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(feed).not.toContain('ORGANIZER');
  });
});

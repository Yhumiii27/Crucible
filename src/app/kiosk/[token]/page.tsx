// The kiosk of a resource (CR-071, X-8): opened on a tablet at the entrance of the resource, at the secret address given when
// the device was added. No session: the token of the address is checked against the stored hash and opens this page for its
// resource only. It shows the running test and the next ones of the day — a confidential project is never named (U-3) — and
// two large buttons: Start and Stop, matched to the booking by src/server/occupancy.ts. Read again every minute.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardTitle } from '@/components/ds';
import { KioskButtons } from '@/features/measure/forms';
import { dataText } from '@/i18n/data-text';
import { fmtSlot } from '@/lib/format';
import { businessNow } from '@/server/clock';
import { readToken } from '@/server/http/tokens';
import { deviceOfToken, kioskView } from '@/server/occupancy';
import { getI18n } from '@/server/session';
import s from './kiosk.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Crucible', robots: { index: false, follow: false } };

export default async function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = readToken(raw, 'crd');
  const device = token ? await deviceOfToken(token) : null;
  if (!token || !device) notFound();
  const [{ t, lang }, now] = await Promise.all([getI18n(), businessNow()]);
  const view = await kioskView(device, now);
  const label = (b: { ref: string; label: string | null }) => (b.label ? `${b.ref} · ${dataText(b.label, lang)}` : `${b.ref} · ${t('Booked (confidential)')}`);
  return (
    <main className={s.page}>
      <Card className={s.card}>
        <p className={s.eyebrow}>{device.facilityCode} · {dataText(device.label, lang)}</p>
        <CardTitle>{device.resourceCode} · {dataText(device.resourceName, lang)}</CardTitle>
        <p className={s.now}>
          {view.running ? `${t('Running')} : ${label(view.running)}` : view.unbookedOpen ? t('In use without a booking') : t('Free')}
        </p>
        <KioskButtons token={token} running={!!view.running || view.unbookedOpen} />
        {view.next.length > 0 && (
          <ul className={s.next}>
            {view.next.map((b) => <li key={b.ref}>{fmtSlot(b.start, b.end, lang)} · {label(b)}</li>)}
          </ul>
        )}
      </Card>
    </main>
  );
}

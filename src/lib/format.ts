// Number and date display (pure). Amounts are k€ (N-2).
import type { Lang } from '@/i18n/translate';

const locale = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-GB');

/** "12 900 k€" / "12,900 k€". */
export const fmtKeur = (n: number | null | undefined, lang: Lang) => (n == null ? '—' : `${n.toLocaleString(locale(lang), { maximumFractionDigits: 1 })} k€`);

/** "22/10/2026" / "22 Oct 2026" from an ISO day or an instant (Paris day for an instant). */
export function fmtDate(v: string | Date | null | undefined, lang: Lang): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(`${v.slice(0, 10)}T12:00:00Z`) : v;
  return d.toLocaleDateString(locale(lang), { timeZone: 'Europe/Paris', day: '2-digit', month: lang === 'fr' ? '2-digit' : 'short', year: 'numeric' });
}

/** "22/10/2026 14:05". */
export const fmtInstant = (d: Date, lang: Lang) => `${fmtDate(d, lang)} ${d.toLocaleTimeString(locale(lang), { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`;

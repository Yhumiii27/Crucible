// Rows of the load heat map from the load forecast (delivery 5b): by facility, the exclusion rules first (one zone of the PDE at
// a time, P-2), then the resources; `from` weeks after this week, `count` weeks. Typed names through dataText.
import { dataText } from '@/i18n/data-text';
import type { Lang, T } from '@/i18n/translate';
import { fmtDate } from '@/lib/format';
import type { WeekLoad } from '@/domain/load';
import type { HeatRow } from './heat';

interface LoadData {
  facilities: { code: string; name: string }[];
  resources: { id: string; code: string; name: string; facilityCode: string }[];
  rules: { code: string; facilityCodes: string[] }[];
  forecast: { byResource: Map<string, WeekLoad[]>; byRule: Map<string, WeekLoad[]> };
}

export function heatGroups(data: LoadData, from: number, count: number, t: T, lang: Lang): { label: string; rows: HeatRow[] }[] {
  const nf = (n: number) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB');
  const cells = (rows: WeekLoad[] | undefined) =>
    (rows ?? []).slice(from, from + count).map((w) => ({
      ratio: w.ratio,
      title: `${t('Week of')} ${fmtDate(w.monday, lang)} — ${t('Capacity')} ${nf(w.capacityHours)} h · ${t('Booked')} ${nf(w.bookedHours)} h · ${t('Requested')} ${nf(w.requestedHours)} h · ${t('Needs not booked')} ${nf(w.forecastHours + w.requestHours)} h`,
    }));
  return data.facilities.map((f) => ({
    label: dataText(f.name, lang),
    rows: [
      ...data.rules.filter((r) => r.facilityCodes.includes(f.code)).map((r): HeatRow => ({ key: r.code, code: r.code, sub: t('Exclusion rule'), rule: true, cells: cells(data.forecast.byRule.get(r.code)), href: `/facilities/${encodeURIComponent(f.code)}` })),
      ...data.resources.filter((r) => r.facilityCode === f.code).map((r): HeatRow => ({ key: r.id, code: r.code, sub: dataText(r.name, lang), cells: cells(data.forecast.byResource.get(r.id)), href: `/facilities/${encodeURIComponent(f.code)}` })),
    ],
  })).filter((g) => g.rows.length);
}

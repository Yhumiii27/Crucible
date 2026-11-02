// A test result as shown on the project sheet and in My schedule (CR-081): conclusion, measurements, observations as typed, the
// Codex references with what Codex says of them, the ELN entry, and the versions kept.
import { CodexRef } from '@/components/app/CodexRef';
import { Tag } from '@/components/ds/Tag';
import { RESULT_OUTCOME_LABEL, RESULT_OUTCOME_TONE } from '@/domain/results';
import { dataText } from '@/i18n/data-text';
import type { Lang, T } from '@/i18n/translate';
import { fmtInstant } from '@/lib/format';
import type { CodexLookup } from '@/server/dal/codex';
import type { BookingResult } from '@/server/dal/results';

export function TestResult({ result, codex, t, lang }: { result: BookingResult; codex: CodexLookup; t: T; lang: Lang }) {
  const r = result.latest;
  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Tag size="sm" tone={RESULT_OUTCOME_TONE[r.outcome]}>{t(RESULT_OUTCOME_LABEL[r.outcome])}</Tag>
        <span className="text-muted">{`${dataText(r.recordedByName, lang)} · ${fmtInstant(r.recordedAt, lang)}${result.versions.length > 1 ? ` · ${t('version')} ${r.version}` : ''}`}</span>
      </div>
      {r.measurements.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {r.measurements.map((m, i) => <li key={i}>{dataText(`${m.name} : ${m.value}${m.unit ? ` ${m.unit}` : ''}`, lang)}</li>)}
        </ul>
      )}
      {r.observations && <div style={{ whiteSpace: 'pre-wrap' }}>{dataText(r.observations, lang)}</div>}
      {r.rawDataRef && <div>{t('Raw data')} : <CodexRef refText={r.rawDataRef} lookup={codex} t={t} /></div>}
      {r.notebookRef && <div>{t('Lab notebook')} : <CodexRef refText={r.notebookRef} lookup={codex} t={t} /></div>}
      {r.elnUrl && <div><a href={r.elnUrl} target="_blank" rel="noopener noreferrer">{t('ELN entry')}</a></div>}
      {r.reason && <div className="text-muted">{t('Corrected')} : {dataText(r.reason, lang)}</div>}
    </div>
  );
}

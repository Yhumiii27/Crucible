// People & skills (docs/spec/02 §4, decisions F-7, S-3; delivery 4): the people who run the tests, the facilities they work in,
// their skills with the last day of use, their absences to come. The coordinator and the facility managers keep the people of
// their facilities; the skill catalogue is kept by the coordinator and the R&D director, who may read the titles held from
// Cursus once its view is granted (skills mapped to a Cursus title, people with a matricule).
import { notFound } from 'next/navigation';
import { Folded } from '@/components/app/ActionForm';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { canEditSkills, peopleFacilities } from '@/domain/rights';
import { AbsenceForm, CursusSyncButton, PersonForm, PersonSkillForm, RemoveAbsenceButton, RemoveSkillButton, SkillForm } from '@/features/planning/forms';
import { dataText } from '@/i18n/data-text';
import { fmtDate } from '@/lib/format';
import { businessToday } from '@/server/clock';
import { referenceLists } from '@/server/dal/admin';
import { peopleScreen } from '@/server/dal/planning';
import { getI18n, getViewer } from '@/server/session';

export default async function PeoplePage() {
  const [{ t, lang }, viewer, today] = await Promise.all([getI18n(), getViewer(), businessToday()]);
  if (!canSee(viewer.role, 'people')) notFound();
  const [data, refs] = await Promise.all([peopleScreen(today), referenceLists()]);
  const mine = peopleFacilities(viewer.role, viewer.assignments);
  const skillName = new Map(data.skills.map((s) => [s.code, s.name]));
  const skillOpts = data.skills.filter((s) => s.active).map((s) => ({ value: s.code, label: `${s.code} · ${dataText(s.name, lang)}` }));
  return (
    <>
      <PageHeader screen="people"
        primary={mine.length > 0 ? (
          <Folded summary="Add a person" variant="primary" size="md">
            <PersonForm entities={refs.entities.map((e) => ({ value: e.code, label: dataText(e.name, lang) }))} facilities={mine.map((f) => ({ value: f, label: f }))} />
          </Folded>
        ) : undefined}
      />
      <SectionCard title={t('People who run the tests')} hint={String(data.people.length)} subtitle={t('The engine assigns people holding the skills a test type asks, present and on one test at a time (F-7).')} scroll>
        {data.people.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Name')}</Th>
                <Th>{t('Facilities')}</Th>
                <Th>{t('Skills')}</Th>
                <Th>{t('Absences')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => {
                const keeps = p.facilityCodes.some((f) => mine.includes(f));
                return (
                  <tr key={p.id}>
                    <Td valign="top">{p.name}{p.matricule && <div className="text-muted">{p.matricule}</div>}</Td>
                    <Td valign="top">{p.facilityCodes.join(', ')}</Td>
                    <Td valign="top">
                      {p.skills.map((s) => (
                        <div key={s.skillCode}>
                          {s.skillCode} · {dataText(skillName.get(s.skillCode) ?? '', lang)}
                          {s.validUntil && <span className="text-muted"> · {t('until')} {fmtDate(s.validUntil, lang)}</span>}
                          {s.validUntil && s.validUntil < today && <Tag tone="accent" size="xs" style={{ marginLeft: 6 }}>{t('Expired')}</Tag>}
                          {s.source === 'cursus' && <Tag tone="outline" size="xs" style={{ marginLeft: 6 }}>Cursus</Tag>}
                          {keeps && s.source !== 'cursus' && <> <RemoveSkillButton personId={p.id} skillCode={s.skillCode} /></>}
                        </div>
                      ))}
                      {keeps && <Folded summary="Give a skill" size="xs" variant="ghost"><PersonSkillForm personId={p.id} skills={skillOpts} /></Folded>}
                    </Td>
                    <Td valign="top">
                      {p.absences.map((a) => (
                        <div key={a.id}>
                          {fmtDate(a.fromOn, lang)} → {fmtDate(a.toOn, lang)}
                          {a.source === 'cursus' ? <> <Tag size="sm" tone="outline">Cursus</Tag></> : keeps && <> <RemoveAbsenceButton id={a.id} /></>}
                        </div>
                      ))}
                      {!p.absences.length && <span className="text-muted">—</span>}
                      {keeps && <Folded summary="Add an absence" size="xs" variant="ghost"><AbsenceForm personId={p.id} /></Folded>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No person yet.')}</EmptyState>
        )}
      </SectionCard>

      <SectionCard title={t('Skill catalogue')} hint={String(data.skills.length)} subtitle={t('A skill mapped to a Cursus title is read from Cursus for the people with a matricule (S-3).')}>
        <Table>
          <thead>
            <tr>
              <Th>{t('Code')}</Th>
              <Th>{t('Name')}</Th>
              <Th>{t('Cursus title')}</Th>
            </tr>
          </thead>
          <tbody>
            {data.skills.map((s) => (
              <tr key={s.code}>
                <Td>{s.code}</Td>
                <Td>{dataText(s.name, lang)}</Td>
                <Td tone="secondary">{s.cursusTitreId ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {canEditSkills(viewer.role) && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Folded summary="Add a skill"><SkillForm /></Folded>
              <CursusSyncButton />
            </div>
          </>
        )}
      </SectionCard>
    </>
  );
}

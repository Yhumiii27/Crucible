// Table of test needs (project sheet, "My test needs"): level, resource, window, length, how much is booked, late requests
// (F-5), the state in Codex of the protocol referenced (CR-060), and the change form for those who enter the project's needs.
import { CodexRef } from '@/components/app/CodexRef';
import { EmptyState } from '@/components/app/EmptyState';
import { Tag } from '@/components/ds/Tag';
import { Table, Td, Th } from '@/components/ds/Table';
import { NEED_LEVEL_LABEL, NEED_STATUS_LABEL } from '@/domain/needs';
import { dataText } from '@/i18n/data-text';
import { fmtDate } from '@/lib/format';
import { codexLookup } from '@/server/dal/codex';
import type { NeedRow } from '@/server/dal/needs';
import { getI18n } from '@/server/session';
import { EditNeed, type MilestoneRef, type ResourceRef, type TestTypeRef } from './forms';

const days = (hours: number, perHalfDay: number) => Math.round((hours / perHalfDay) * 5) / 10;

export async function NeedsTable({ needs, manage, edit, showProject }: {
  needs: NeedRow[];
  manage: boolean | ((n: NeedRow) => boolean);
  edit: { projects: { code: string; name: string }[]; milestones: MilestoneRef[]; resources: ResourceRef[]; testTypes: TestTypeRef[]; today: string };
  showProject?: boolean;
}) {
  const { t, lang } = await getI18n();
  if (!needs.length) return <EmptyState>{t('No test need yet.')}</EmptyState>;
  const codex = await codexLookup(needs.map((n) => n.codexRef));
  const canEdit = (n: NeedRow) => n.status === 'open' && (typeof manage === 'function' ? manage(n) : manage);
  return (
    <Table>
      <thead>
        <tr>
          <Th>{t('Need')}</Th>
          {showProject && <Th>{t('Project')}</Th>}
          <Th>{t('Tests needed')}</Th>
          <Th>{t('Resource')}</Th>
          <Th>{t('Window')}</Th>
          <Th align="right">{t('Days')}</Th>
          <Th align="right">{t('Booked')}</Th>
          <Th>{t('Status')}</Th>
        </tr>
      </thead>
      <tbody>
        {needs.map((n) => {
          const perHalf = n.spread && n.halfDays ? n.spread.askedHours / n.halfDays : 5;
          return (
            <tr key={n.id}>
              <Td valign="top">
                {n.ref}
                <div><Tag size="xs" tone={n.level === 'request' ? 'accent' : 'outline'}>{t(NEED_LEVEL_LABEL[n.level])}</Tag></div>
              </Td>
              {showProject && <Td valign="top">{n.projectCode}</Td>}
              <Td valign="top">
                {dataText(n.title, lang)}
                {n.milestoneLabel && <div className="text-muted">{t('Milestone')} · {dataText(n.milestoneLabel, lang)}</div>}
                {n.codexRef && <div className="text-muted">{t('Protocol')} · <CodexRef refText={n.codexRef} lookup={codex} t={t} /></div>}
                {canEdit(n) && (
                  <EditNeed {...edit} projects={edit.projects.filter((p) => p.code === n.projectCode)} need={{
                    id: n.id, projectCode: n.projectCode, level: n.level, title: n.title, resourceId: n.resourceId, halfDays: n.halfDays, earliestOn: n.earliestOn,
                    deadlineOn: n.deadlineOn, milestoneId: n.milestoneId, testTypeCode: n.testTypeCode, codexRef: n.codexRef, note: n.note,
                  }} />
                )}
              </Td>
              <Td valign="top">{n.resourceCode}</Td>
              <Td valign="top" nowrap>{fmtDate(n.earliestOn, lang)} → {fmtDate(n.deadlineOn, lang)}</Td>
              <Td valign="top" align="right" numeric>{n.halfDays / 2}</Td>
              <Td valign="top" align="right" numeric>{n.spread ? days(n.spread.coveredHours, perHalf) : '—'}</Td>
              <Td valign="top">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <Tag size="xs" tone={n.status === 'open' ? 'neutral' : 'outline'}>{t(NEED_STATUS_LABEL[n.status])}</Tag>
                  {n.late && <Tag size="xs" tone="accent">{t('Late request')}</Tag>}
                  {n.spread?.overdue && <Tag size="xs" tone="accent">{t('Overdue')}</Tag>}
                  {n.spread && n.spread.remainingHours === 0 && <Tag size="xs" tone="accent-2">{t('Fully booked')}</Tag>}
                </div>
                {n.withdrawnReason && <div className="text-muted">{n.withdrawnReason}</div>}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

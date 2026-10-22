// Facilities (docs/spec/05): the facilities the viewer sees — all of them for the people of the group, the shared ones for a
// partner (U-3). Each code opens the facility sheet (resources, calendars, inspections, rules).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/EmptyState';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { dataText } from '@/i18n/data-text';
import { visibleFacilities } from '@/server/dal/visibility';
import { getI18n, getViewer } from '@/server/session';

export default async function FacilitiesPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'facilities')) notFound();
  const rows = await visibleFacilities(viewer);
  return (
    <>
      <PageHeader screen="facilities" />
      <SectionCard title={t('Facilities')} hint={String(rows.length)} scroll>
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>{t('Code')}</Th>
                <Th>{t('Name')}</Th>
                <Th>{t('Site')}</Th>
                <Th>{t('Run by')}</Th>
                <Th>{t('Shared with')}</Th>
                <Th>{t('Description')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.code}>
                  <Td><Link href={`/facilities/${encodeURIComponent(f.code)}`}>{f.code}</Link></Td>
                  <Td>{dataText(f.name, lang)}</Td>
                  <Td>{dataText(f.siteName, lang)}</Td>
                  <Td>{dataText(f.operatorName, lang)}</Td>
                  <Td>{f.partnerEntityCodes.join(', ') || '—'}</Td>
                  <Td tone="secondary">{f.description ? dataText(f.description, lang) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>{t('No facility in your scope.')}</EmptyState>
        )}
      </SectionCard>
    </>
  );
}

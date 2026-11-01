// Entities, sites, facilities, projects (docs/spec/05): the organisation Crucible plans and isolates by, entered by the
// administrator until Matrix owns the sites and the entities (M-6); projects are also recorded by the R&D director, who sets
// their priority class (A-1, A-5).
import { notFound } from 'next/navigation';
import { Folded } from '@/components/app/ActionForm';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Table, Td, Th } from '@/components/ds/Table';
import { canSee } from '@/config/screens';
import { ENTITY_KIND_LABEL, PRIORITY_CLASS_LABEL } from '@/domain/organisation';
import { NewEntityForm, NewFacilityForm, NewProjectForm, NewSiteForm } from '@/features/admin/forms';
import { dataText } from '@/i18n/data-text';
import { organisation } from '@/server/dal/admin';
import { getI18n, getViewer } from '@/server/session';

export default async function OrganisationPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'admin-org')) notFound();
  const org = await organisation();
  const admin = viewer.role === 'admin';
  const ref = (x: { code: string; name: string }) => ({ code: x.code, name: dataText(x.name, lang) });
  return (
    <>
      <PageHeader screen="admin-org" crumbs={['Administration']} />
      <SectionCard title={t('Entities')} scroll>
        <Table>
          <thead>
            <tr>
              <Th>{t('Code')}</Th>
              <Th>{t('Name')}</Th>
              <Th>{t('Kind')}</Th>
            </tr>
          </thead>
          <tbody>
            {org.entities.map((e) => (
              <tr key={e.code}>
                <Td>{e.code}</Td>
                <Td>{dataText(e.name, lang)}</Td>
                <Td>{t(ENTITY_KIND_LABEL[e.kind])}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {admin && <div><Folded summary="Add an entity"><NewEntityForm /></Folded></div>}
      </SectionCard>
      <SectionCard title={t('Sites')} scroll>
        <Table>
          <thead>
            <tr>
              <Th>{t('Code')}</Th>
              <Th>{t('Name')}</Th>
              <Th>{t('City')}</Th>
              <Th>{t('Country')}</Th>
            </tr>
          </thead>
          <tbody>
            {org.sites.map((s) => (
              <tr key={s.code}>
                <Td>{s.code}</Td>
                <Td>{dataText(s.name, lang)}</Td>
                <Td>{s.city ?? '—'}</Td>
                <Td>{s.countryIso2}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {admin && <div><Folded summary="Add a site"><NewSiteForm /></Folded></div>}
      </SectionCard>
      <SectionCard title={t('Facilities')} scroll>
        <Table>
          <thead>
            <tr>
              <Th>{t('Code')}</Th>
              <Th>{t('Name')}</Th>
              <Th>{t('Site')}</Th>
              <Th>{t('Run by')}</Th>
              <Th>{t('Shared with')}</Th>
            </tr>
          </thead>
          <tbody>
            {org.facilities.map((f) => (
              <tr key={f.code}>
                <Td>{f.code}</Td>
                <Td>{dataText(f.name, lang)}</Td>
                <Td>{f.siteCode}</Td>
                <Td>{f.operatorEntityCode}</Td>
                <Td>{f.partnerEntityCodes.join(', ') || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {admin && (
          <div><Folded summary="Add a facility">
            <NewFacilityForm
              sites={org.sites.map(ref)}
              internal={org.entities.filter((e) => e.kind === 'internal').map(ref)}
              partners={org.entities.filter((e) => e.kind === 'partner').map(ref)}
            />
          </Folded></div>
        )}
      </SectionCard>
      <SectionCard title={t('Projects')} scroll>
        <Table>
          <thead>
            <tr>
              <Th>{t('Code')}</Th>
              <Th>{t('Name')}</Th>
              <Th>{t('Entity')}</Th>
              <Th>{t('Priority class')}</Th>
              <Th>{t('Confidential')}</Th>
            </tr>
          </thead>
          <tbody>
            {org.projects.map((p) => (
              <tr key={p.code}>
                <Td>{p.code}</Td>
                <Td>{dataText(p.name, lang)}</Td>
                <Td>{p.entityCode}</Td>
                <Td>{t(PRIORITY_CLASS_LABEL[p.priorityClass])}</Td>
                <Td>{p.confidential ? t('Yes') : t('No')}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div><Folded summary="Add a project"><NewProjectForm entities={org.entities.map(ref)} /></Folded></div>
      </SectionCard>
    </>
  );
}

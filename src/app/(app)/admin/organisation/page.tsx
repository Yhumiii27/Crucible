// Entities, sites, facilities, projects (docs/spec/05): the organisation Crucible plans and isolates by, entered by the
// administrator until Matrix owns the sites and the entities (M-6); projects are also recorded by the R&D director, who sets
// their priority class (A-1, A-5).
import { notFound } from 'next/navigation';
import { Folded } from '@/components/app/ActionForm';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Table, Td, Th } from '@/components/ds/Table';
import { Tag } from '@/components/ds/Tag';
import { canSee } from '@/config/screens';
import { ENTITY_KIND_LABEL, PRIORITY_CLASS_LABEL } from '@/domain/organisation';
import { LinkMatrixForm, NewEntityForm, NewFacilityForm, NewProjectForm, NewSiteForm } from '@/features/admin/forms';
import { dataText } from '@/i18n/data-text';
import { organisation } from '@/server/dal/admin';
import { getDb } from '@/server/db/client';
import { keystoneRdProjectsToAdd, matrixReferentials } from '@/server/integrations/connectors';
import { getI18n, getViewer } from '@/server/session';

export default async function OrganisationPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'admin-org')) notFound();
  const org = await organisation();
  // CR-060: the R&D projects of Keystone not yet in Crucible, read at display time (empty until pub_projets is granted).
  const db = await getDb();
  const fromKeystone = await keystoneRdProjectsToAdd(db);
  // CR-060: the sites and subsidiaries of Matrix (empty until pub_sites and pub_filiales are granted).
  const matrix = await matrixReferentials(db);
  const freeSites = matrix.sites.filter((x) => !x.linkedTo);
  const freeSubs = matrix.subsidiaries.filter((x) => !x.linkedTo);
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
              <Th>{t('Matrix')}</Th>
            </tr>
          </thead>
          <tbody>
            {org.entities.map((e) => (
              <tr key={e.code}>
                <Td>{e.code}</Td>
                <Td>{dataText(e.name, lang)}</Td>
                <Td>{t(ENTITY_KIND_LABEL[e.kind])}</Td>
                <Td>{admin && matrix.subsidiaries.length
                  ? <LinkMatrixForm kind="entity" code={e.code} current={e.matrixCode} options={matrix.subsidiaries.filter((x) => !x.linkedTo || x.code === e.matrixCode).map(ref)} />
                  : e.matrixCode ?? '—'}</Td>
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
              <Th>{t('Matrix')}</Th>
            </tr>
          </thead>
          <tbody>
            {org.sites.map((s) => (
              <tr key={s.code}>
                <Td>{s.code}</Td>
                <Td>{dataText(s.name, lang)}</Td>
                <Td>{s.city ?? '—'}</Td>
                <Td>{s.countryIso2}</Td>
                <Td>{admin && matrix.sites.length
                  ? <LinkMatrixForm kind="site" code={s.code} current={s.matrixCode} options={matrix.sites.filter((x) => !x.linkedTo || x.code === s.matrixCode).map(ref)} />
                  : s.matrixCode ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {admin && <div><Folded summary="Add a site"><NewSiteForm /></Folded></div>}
      </SectionCard>
      {admin && freeSites.length + freeSubs.length > 0 && (
        <SectionCard title={t('Sites and subsidiaries of Matrix not in Crucible')} hint={String(freeSites.length + freeSubs.length)}
          subtitle={t('Matrix is the reference of the sites and subsidiaries (D14, D21): add one, or link an existing site or entity above; its name then follows Matrix.')} scroll>
          <Table>
            <thead><tr><Th>{t('Matrix')}</Th><Th>{t('Name')}</Th><Th>{t('Kind')}</Th><Th /></tr></thead>
            <tbody>
              {freeSites.map((x) => (
                <tr key={`s-${x.code}`}>
                  <Td>{x.code}</Td><Td>{dataText(x.name, lang)}</Td><Td>{t('Site')}</Td>
                  <Td><Folded summary="Add to Crucible" size="xs"><NewSiteForm from={x} /></Folded></Td>
                </tr>
              ))}
              {freeSubs.map((x) => (
                <tr key={`f-${x.code}`}>
                  <Td>{x.code}</Td><Td>{dataText(x.name, lang)}</Td><Td>{t('Entity')}</Td>
                  <Td><Folded summary="Add to Crucible" size="xs"><NewEntityForm from={x} /></Folded></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>
      )}
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
              <Th>{t('Keystone project')}</Th>
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
                <Td>{p.keystoneCode ?? '—'}{p.keystoneClosed && <> <Tag size="sm" tone="accent">{t('Closed in Keystone')}</Tag></>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div><Folded summary="Add a project"><NewProjectForm entities={org.entities.map(ref)} /></Folded></div>
      </SectionCard>
      {fromKeystone.length > 0 && (
        <SectionCard title={t('R&D projects of Keystone not in Crucible')} hint={String(fromKeystone.length)}
          subtitle={t('Read from Keystone (category R&D, still open). Adding one sets its code, priority class and confidentiality in Crucible; its name then follows Keystone.')} scroll>
          <Table>
            <thead><tr><Th>{t('Keystone project')}</Th><Th>{t('Name')}</Th><Th>{t('Entity')}</Th><Th /></tr></thead>
            <tbody>
              {fromKeystone.map((k) => (
                <tr key={k.code}>
                  <Td>{k.code}</Td>
                  <Td>{dataText(k.name, lang)}</Td>
                  <Td>{k.entityCode ?? '—'}</Td>
                  <Td><Folded summary="Add to Crucible" size="xs"><NewProjectForm entities={org.entities.map(ref)} from={k} /></Folded></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>
      )}
    </>
  );
}

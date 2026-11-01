// Users & roles (docs/spec/05): accounts and their role assignments with their scope; the administrator creates accounts,
// gives and removes roles, deactivates accounts (src/features/admin/actions.ts checks each one again).
import { notFound } from 'next/navigation';
import { Folded } from '@/components/app/ActionForm';
import { SectionCard } from '@/components/app/SectionCard';
import { PageHeader } from '@/components/app/shell/page-header';
import { Table, Td, Th } from '@/components/ds/Table';
import { ROLE_LABEL } from '@/config/roles';
import { canSee } from '@/config/screens';
import { ActiveToggle, AddRoleForm, NewUserForm, RemoveRoleButton } from '@/features/admin/forms';
import s from '@/features/admin/forms.module.css';
import { dataText } from '@/i18n/data-text';
import { referenceLists, usersWithAssignments } from '@/server/dal/admin';
import { getI18n, getViewer } from '@/server/session';

export default async function UsersPage() {
  const [{ t, lang }, viewer] = await Promise.all([getI18n(), getViewer()]);
  if (!canSee(viewer.role, 'admin-users')) notFound();
  const [rows, refs] = await Promise.all([usersWithAssignments(), referenceLists()]);
  return (
    <>
      <PageHeader screen="admin-users" crumbs={['Administration']}
        primary={
          <Folded summary="New account" variant="primary" size="md">
            <p className="text-muted">{t('The person signs in with their Microsoft account; give them a role below.')}</p>
            <NewUserForm entities={refs.entities.map((x) => ({ code: x.code, name: dataText(x.name, lang) }))} />
          </Folded>
        }
      />
      <SectionCard title={t('Accounts')} hint={String(rows.length)} scroll>
        <Table>
          <thead>
            <tr>
              <Th>{t('Name')}</Th>
              <Th>{t('E-mail')}</Th>
              <Th>{t('Entity')}</Th>
              <Th>{t('Roles and scopes')}</Th>
              <Th>{t('Status')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <Td valign="top">{u.displayName}</Td>
                <Td valign="top" tone="secondary">{u.email}</Td>
                <Td valign="top">{u.entityCode ?? '—'}</Td>
                <Td valign="top">
                  <div className={s.roles}>
                    {u.assignments.map((a) => {
                      const label = `${t(ROLE_LABEL[a.role])}${a.scopeRef ? ` · ${a.scopeRef}` : ''}`;
                      return (
                        <span key={a.id} className={`tag tag-neutral ${s.role}`}>
                          {label}
                          <RemoveRoleButton id={a.id} label={label} />
                        </span>
                      );
                    })}
                    {!u.assignments.length && <span className="text-muted">{t('No role')}</span>}
                  </div>
                  <AddRoleForm userId={u.id} refs={refs} />
                </Td>
                <Td valign="top">
                  {u.active ? t('Active') : t('Deactivated')}
                  <ActiveToggle userId={u.id} active={u.active} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>
    </>
  );
}

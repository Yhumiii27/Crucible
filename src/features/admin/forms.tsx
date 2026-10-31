'use client';
// Administration forms (client islands of the server pages): each submits to its Server Function and shows the translated
// result. The Server Functions do every check again.
import { useActionState, useState, useTransition } from 'react';
import { ActionButton, ActionForm, Result, Folded } from '@/components/app/ActionForm';
import { Button } from '@/components/ds/Button';
import { Field, Input, Select } from '@/components/ds/Field';
import { ROLE_KEYS, ROLE_LABEL, ROLE_SCOPE, type RoleKey } from '@/config/roles';
import { ENTITY_KINDS, ENTITY_KIND_LABEL, PRIORITY_CLASSES, PRIORITY_CLASS_LABEL } from '@/domain/organisation';
import { useI18n } from '@/i18n/client';
import {
  addRoleAction, createEntityAction, createFacilityAction, createProjectAction, createSiteAction, createUserAction, removeRoleAction, setUserActiveAction,
} from './actions';
import { readConnectorsAction } from './connectors';
import s from './forms.module.css';


export interface Ref {
  code: string;
  name: string;
}

export function NewUserForm({ entities }: { entities: Ref[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={createUserAction} submit="Create the account" done="Account created">
      <Field label={t('E-mail')} htmlFor="nu-email" required>
        <Input id="nu-email" name="email" type="email" required autoComplete="off" />
      </Field>
      <Field label={t('Name')} htmlFor="nu-name" required>
        <Input id="nu-name" name="displayName" required />
      </Field>
      <Field label={t('Job title')} htmlFor="nu-title">
        <Input id="nu-title" name="jobTitle" />
      </Field>
      <Field label={t('Entity')} htmlFor="nu-ent">
        <Select id="nu-ent" name="entityCode" options={[{ value: '', label: '—' }, ...entities.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))]} />
      </Field>
    </ActionForm>
  );
}

export interface RefLists {
  entities: Ref[];
  facilities: Ref[];
  projects: Ref[];
}

export function AddRoleForm({ userId, refs }: { userId: string; refs: RefLists }) {
  const { t } = useI18n();
  const [role, setRole] = useState<RoleKey>('project_lead');
  const [state, run, pending] = useActionState(addRoleAction, null);
  const scope = ROLE_SCOPE[role];
  const list = scope === 'entity' ? refs.entities : scope === 'facility' ? refs.facilities : scope === 'project' ? refs.projects : [];
  const refOptions = list.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }));
  return (
    <Folded summary="Add a role" size="xs" variant="ghost">
      <form action={run} className={s.addRole}>
        <input type="hidden" name="userId" value={userId} />
        <Select size="inline" name="role" aria-label={t('Role')} value={role} onChange={(e) => setRole(e.target.value as RoleKey)} options={ROLE_KEYS.map((r) => ({ value: r, label: t(ROLE_LABEL[r]) }))} />
        {scope !== 'global' && <Select size="inline" name="scopeRef" aria-label={t('Scope')} key={scope} options={refOptions} />}
        <Button type="submit" size="xs" variant="secondary" disabled={pending}>
          {t('Add the role')}
        </Button>
        <Result state={state} done="Role added" />
      </form>
    </Folded>
  );
}

export function RemoveRoleButton({ id, label }: { id: string; label: string }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={s.remove} aria-label={`${t('Remove the role')} ${label}`} disabled={pending}
        onClick={() => start(async () => { const r = await removeRoleAction(id); setError(r.ok ? null : r.error); })}>
        ×
      </button>
      {error && <span className={s.error} role="alert">{t(error)}</span>}
    </>
  );
}

export function ActiveToggle({ userId, active }: { userId: string; active: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className={s.actions}>
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await setUserActiveAction(userId, !active); setError(r.ok ? null : r.error); })}>
        {active ? t('Deactivate') : t('Reactivate')}
      </Button>
      {error && <span className={s.error} role="alert">{t(error)}</span>}
    </span>
  );
}

export function NewEntityForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={createEntityAction} submit="Add the entity" done="Entity added">
      <Field label={t('Code')} htmlFor="ne-code" required>
        <Input id="ne-code" name="code" required maxLength={20} />
      </Field>
      <Field label={t('Name')} htmlFor="ne-name" required>
        <Input id="ne-name" name="name" required />
      </Field>
      <Field label={t('Kind')} htmlFor="ne-kind" required>
        <Select id="ne-kind" name="kind" options={ENTITY_KINDS.map((k) => ({ value: k, label: t(ENTITY_KIND_LABEL[k]) }))} />
      </Field>
    </ActionForm>
  );
}

export function NewSiteForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={createSiteAction} submit="Add the site" done="Site added">
      <Field label={t('Code')} htmlFor="nsi-code" required hint={t('The Matrix site code when it exists')}>
        <Input id="nsi-code" name="code" required maxLength={20} />
      </Field>
      <Field label={t('Name')} htmlFor="nsi-name" required>
        <Input id="nsi-name" name="name" required />
      </Field>
      <Field label={t('City')} htmlFor="nsi-city">
        <Input id="nsi-city" name="city" />
      </Field>
      <Field label={t('Country')} htmlFor="nsi-country" hint={t('ISO code, e.g. FR')}>
        <Input id="nsi-country" name="countryIso2" maxLength={2} defaultValue="FR" />
      </Field>
    </ActionForm>
  );
}

export function NewFacilityForm({ sites, internal, partners }: { sites: Ref[]; internal: Ref[]; partners: Ref[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={createFacilityAction} submit="Add the facility" done="Facility added">
      <Field label={t('Code')} htmlFor="nf-code" required>
        <Input id="nf-code" name="code" required maxLength={20} />
      </Field>
      <Field label={t('Name')} htmlFor="nf-name" required>
        <Input id="nf-name" name="name" required />
      </Field>
      <Field label={t('Site')} htmlFor="nf-site" required>
        <Select id="nf-site" name="siteCode" options={sites.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} />
      </Field>
      <Field label={t('Run by')} htmlFor="nf-op" required>
        <Select id="nf-op" name="operatorEntityCode" options={internal.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} />
      </Field>
      {partners.length > 0 && (
        <Field label={t('Shared with')} htmlFor="nf-partners">
          <Select id="nf-partners" name="partnerEntityCodes" multiple options={partners.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} />
        </Field>
      )}
      <Field label={t('Description')} htmlFor="nf-desc">
        <Input id="nf-desc" name="description" />
      </Field>
    </ActionForm>
  );
}

export function NewProjectForm({ entities }: { entities: Ref[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={createProjectAction} submit="Add the project" done="Project added">
      <Field label={t('Code')} htmlFor="np-code" required>
        <Input id="np-code" name="code" required maxLength={20} />
      </Field>
      <Field label={t('Name')} htmlFor="np-name" required>
        <Input id="np-name" name="name" required />
      </Field>
      <Field label={t('Entity')} htmlFor="np-ent" required>
        <Select id="np-ent" name="entityCode" options={entities.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} />
      </Field>
      <Field label={t('Priority class')} htmlFor="np-prio" required>
        <Select id="np-prio" name="priorityClass" defaultValue="P2" options={PRIORITY_CLASSES.map((p) => ({ value: p, label: t(PRIORITY_CLASS_LABEL[p]) }))} />
      </Field>
      <Field label={t('Keystone project')} htmlFor="np-ks">
        <Input id="np-ks" name="keystoneCode" maxLength={40} />
      </Field>
      <Field label={t('Codex research programme')} htmlFor="np-cx">
        <Input id="np-cx" name="codexProgramCode" maxLength={40} />
      </Field>
      <label className={s.check} htmlFor="np-conf">
        <input id="np-conf" type="checkbox" name="confidential" />
        {t('Confidential project')}
      </label>
    </ActionForm>
  );
}

/** Reads the other tools' views now (CR-060). */
export function ReadConnectorsButton() {
  return <ActionButton run={readConnectorsAction} label="Read now" done="Read" variant="primary" />;
}

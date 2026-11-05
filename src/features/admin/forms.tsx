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
  addRoleAction, createEntityAction, linkMatrixAction, createFacilityAction, createProjectAction, createSiteAction, createUserAction, removeRoleAction, setUserActiveAction,
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

/** A Crucible code proposed from a Matrix one: upper case, underscores as dashes. */
const codeFrom = (matrix: string) => matrix.toUpperCase().replace(/[^A-Z0-9-]+/g, '-').slice(0, 20);

/** `from`: a Matrix subsidiary not yet in Crucible (CR-060): code and name filled in, linked to it. */
export function NewEntityForm({ from }: { from?: { code: string; name: string } }) {
  const { t } = useI18n();
  const id = from ? `ne-${from.code}` : 'ne';
  return (
    <ActionForm action={createEntityAction} submit="Add the entity" done="Entity added">
      {from && <input type="hidden" name="matrixCode" value={from.code} />}
      <Field label={t('Code')} htmlFor={`${id}-code`} required>
        <Input id={`${id}-code`} name="code" required maxLength={20} defaultValue={from ? codeFrom(from.code) : undefined} />
      </Field>
      <Field label={t('Name')} htmlFor={`${id}-name`} required>
        <Input id={`${id}-name`} name="name" required defaultValue={from?.name} />
      </Field>
      <Field label={t('Kind')} htmlFor={`${id}-kind`} required>
        <Select id={`${id}-kind`} name="kind" defaultValue={from ? 'partner' : undefined} options={ENTITY_KINDS.map((k) => ({ value: k, label: t(ENTITY_KIND_LABEL[k]) }))} />
      </Field>
    </ActionForm>
  );
}

/** `from`: a Matrix site not yet in Crucible (CR-060): code, name, city and country filled in, linked to it. */
export function NewSiteForm({ from }: { from?: { code: string; name: string; city: string | null; countryIso2: string } }) {
  const { t } = useI18n();
  const id = from ? `nsi-${from.code}` : 'nsi';
  return (
    <ActionForm action={createSiteAction} submit="Add the site" done="Site added">
      {from && <input type="hidden" name="matrixCode" value={from.code} />}
      <Field label={t('Code')} htmlFor={`${id}-code`} required hint={t('The Matrix site code when it exists')}>
        <Input id={`${id}-code`} name="code" required maxLength={20} defaultValue={from ? codeFrom(from.code) : undefined} />
      </Field>
      <Field label={t('Name')} htmlFor={`${id}-name`} required>
        <Input id={`${id}-name`} name="name" required defaultValue={from?.name} />
      </Field>
      <Field label={t('City')} htmlFor={`${id}-city`}>
        <Input id={`${id}-city`} name="city" defaultValue={from?.city ?? undefined} />
      </Field>
      <Field label={t('Country')} htmlFor={`${id}-country`} hint={t('ISO code, e.g. FR')}>
        <Input id={`${id}-country`} name="countryIso2" maxLength={2} defaultValue={from?.countryIso2 ?? 'FR'} />
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

/** `from`: a Keystone R&D project not yet in Crucible (CR-060), its code, name and entity filled in. */
export function NewProjectForm({ entities, from }: { entities: Ref[]; from?: { code: string; name: string; entityCode: string | null } }) {
  const { t } = useI18n();
  const ent = from?.entityCode && entities.some((e) => e.code === from.entityCode) ? from.entityCode : undefined;
  return (
    <ActionForm action={createProjectAction} submit="Add the project" done="Project added">
      <Field label={t('Code')} htmlFor="np-code" required>
        <Input id="np-code" name="code" required maxLength={20} />
      </Field>
      <Field label={t('Name')} htmlFor="np-name" required>
        <Input id="np-name" name="name" required defaultValue={from?.name} />
      </Field>
      <Field label={t('Entity')} htmlFor="np-ent" required>
        <Select id="np-ent" name="entityCode" defaultValue={ent} options={entities.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} />
      </Field>
      <Field label={t('Priority class')} htmlFor="np-prio" required>
        <Select id="np-prio" name="priorityClass" defaultValue="P2" options={PRIORITY_CLASSES.map((p) => ({ value: p, label: t(PRIORITY_CLASS_LABEL[p]) }))} />
      </Field>
      <Field label={t('Keystone project')} htmlFor="np-ks">
        <Input id="np-ks" name="keystoneCode" maxLength={40} defaultValue={from?.code} readOnly={!!from} />
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

/** Links a site or an entity to its Matrix site or subsidiary (CR-060), or unlinks it. */
export function LinkMatrixForm({ kind, code, current, options }: { kind: 'site' | 'entity'; code: string; current: string | null; options: Ref[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={linkMatrixAction} submit="Link" done="Linked" inline variant="ghost">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="code" value={code} />
      <Select size="inline" name="matrixCode" defaultValue={current ?? ''} aria-label={t('Matrix')}
        options={[{ value: '', label: '—' }, ...options.map((o) => ({ value: o.code, label: `${o.code} · ${o.name}` }))]} />
    </ActionForm>
  );
}

/** Reads the other tools' views now (CR-060). */
export function ReadConnectorsButton() {
  return <ActionButton run={readConnectorsAction} label="Read now" done="Read" variant="primary" />;
}

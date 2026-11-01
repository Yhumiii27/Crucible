// End-to-end journeys (CR-080, X-15) in Chromium against the production build with the demo data set, business date Thu 22
// Oct 2026, French interface. Each journey goes through the screens as a person would: side panels, forms, messages.
//  1. A project lead asks for the PDE laboratory rooms while the pilot is confirmed: refused, the rule cited (P-2).
//  2. The PDE manager writes a safety checklist; the technician cannot start the afternoon's test before filling it, then can
//     (CR-075).
//  3. The R&D director asks the assistant a question in its panel and gets an answer (delivery 6, local templates).
//  4. Every screen of the coordinator's menu opens without an error page.
import { expect, test } from '@playwright/test';
import { actAs } from './helpers';

test('a request refused by the PDE rule cites the rule and the zone that holds the building', async ({ page, context, baseURL }) => {
  await actAs(context, baseURL!, 'project_lead');
  await page.goto('/planning');
  await page.getByRole('button', { name: 'Demander un créneau' }).click();
  const panel = page.getByRole('dialog');
  const lab = await panel.locator('#rq-res option', { hasText: 'PDE-LAB' }).getAttribute('value');
  await panel.locator('#rq-res').selectOption(lab!);
  await panel.locator('#rq-proj').selectOption('RD-CASSIOPEE');
  await panel.getByLabel('Objet de l’essai').fill('Essai de bout en bout');
  await panel.locator('#rq-from').fill('2026-10-27');
  await panel.locator('#rq-fh').selectOption('pm');
  await panel.locator('#rq-to').fill('2026-10-27');
  await panel.locator('#rq-th').selectOption('pm');
  await panel.getByRole('button', { name: 'Demander le créneau' }).click();
  await expect(panel.getByRole('alert')).toHaveText('Règle d’exclusion · PDE-ONE-ZONE · PDE-PIL');
});

test('the safety checklist comes before the start of a test', async ({ page, context, baseURL }) => {
  // The manager writes the PDE's checklist.
  await actAs(context, baseURL!, 'facility_manager');
  await page.goto('/facilities/PDE?tab=forms');
  await page.locator('.card', { hasText: 'Check-list sécurité' }).first().getByRole('button', { name: /^(Créer|Modifier) le formulaire$/ }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Éléments, un par ligne').fill('Zone balisée\n= Pression lue (bar)');
  await editor.getByRole('button', { name: 'Enregistrer le formulaire' }).click();
  // The side panel closes once saved; the card shows the items.
  await expect(page.locator('.card', { hasText: 'Check-list sécurité' }).first()).toContainText('Zone balisée');

  // The technician: the start waits for the checklist.
  await actAs(context, baseURL!, 'technician');
  await page.goto('/my/schedule');
  const today = page.locator('.card', { hasText: 'Aujourd’hui' });
  const row = today.locator('div', { has: page.locator('strong', { hasText: /^PDE-LAB$/ }) }).filter({ has: page.getByRole('button', { name: 'Démarrer' }) }).last();
  await row.getByRole('button', { name: 'Démarrer' }).click();
  await expect(row.getByRole('alert')).toHaveText('Remplissez la check-list sécurité avant de démarrer l’essai');
  await row.getByRole('button', { name: 'Check-list sécurité' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Zone balisée').check();
  await form.getByLabel('Pression lue (bar)').fill('4,2');
  await form.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/my/schedule');
  const again = page.locator('.card', { hasText: 'Aujourd’hui' }).locator('div', { has: page.locator('strong', { hasText: /^PDE-LAB$/ }) })
    .filter({ hasText: 'Check-list sécurité remplie' }).last();
  await again.getByRole('button', { name: 'Démarrer' }).click();
  // Started: the row says the test is running and no longer offers to start it.
  const running = page.locator('.card', { hasText: 'Aujourd’hui' }).locator('div', { has: page.locator('strong', { hasText: /^PDE-LAB$/ }) })
    .filter({ hasText: 'Check-list sécurité remplie' }).last();
  await expect(running).toContainText('En cours');
  await expect(running.getByRole('button', { name: 'Fiche d’essai' })).toHaveCount(0);
  await expect(running.getByRole('button', { name: 'Démarrer' })).toHaveCount(0);
});

test('the assistant answers in its panel', async ({ page, context, baseURL }) => {
  await actAs(context, baseURL!, 'rd_director');
  await page.goto('/');
  await page.getByRole('button', { name: 'Assistant IA' }).click();
  const panel = page.getByRole('dialog');
  const question = `Quels moyens sont saturés dans les prochaines semaines ? (${Date.now()})`;
  await panel.getByLabel('Votre question').fill(question);
  await panel.getByRole('button', { name: 'Demander', exact: true }).click();
  await expect(panel.getByText(question)).toBeVisible();
  await expect(panel.getByText('L’assistant cherche…')).toBeHidden();
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('every screen of the coordinator’s menu opens', async ({ page, context, baseURL }) => {
  await actAs(context, baseURL!, 'coordinator');
  for (const path of ['/', '/planning', '/my/schedule', '/my/decisions', '/propose', '/conflicts', '/load', '/people', '/rules', '/incidents', '/notifications',
    '/facilities/PDE', '/facilities/PDE?tab=maintenance', '/facilities/PDE?tab=forms', '/facilities/PDE?tab=measurement', '/reports']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('h1').first(), path).toBeVisible();
  }
});

// Phone journey (CR-082, X-21) in Chromium with a phone's screen (Pixel 7): the technician reads My schedule without sideways
// scrolling, opens the menu drawer, then the network drops — My schedule is still shown (service worker), a start is kept on the
// phone and sent when the network comes back. The server applies it with every check of the screen: depending on the journeys
// run before, the test starts or the refusal is shown (the PDE's safety checklist not filled).
import { devices, expect, test } from '@playwright/test';
import { actAs } from './helpers';

test.use({ ...devices['Pixel 7'] });

test('My schedule on a phone, with and without network', async ({ page, context, baseURL }) => {
  await actAs(context, baseURL!, 'technician');
  await page.goto('/my/schedule');
  await expect(page.getByRole('heading', { name: 'Mon planning' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The menu: a drawer opened from the top bar, closed by a link followed in it.
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('complementary', { name: 'Menu principal' });
  await expect(menu).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le menu' }).click();
  await expect(menu).toBeHidden();

  // The service worker takes the page in hand, then keeps its last copy and the application's files.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mon planning' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mon planning' })).toBeVisible();
  await expect(page.getByText('Pas de réseau : les démarrages et fins d’essai sont gardés sur ce téléphone')).toBeVisible();
  const start = page.getByRole('button', { name: 'Démarrer' }).first();
  await start.click();
  await expect(page.getByText('1 enregistrement(s) hors ligne, en attente du réseau')).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('en attente du réseau')).toHaveCount(0);
});

// Shared steps of the journeys: act as a demo profile ("View as" cookie, as the role menu does).
import type { BrowserContext } from '@playwright/test';

export async function actAs(context: BrowserContext, baseURL: string, role: string) {
  await context.clearCookies();
  await context.addCookies([{ name: 'crucible-role', value: role, url: baseURL }]);
}

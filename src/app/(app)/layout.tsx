// App shell (Norma 2.0, charte/COQUE.md § 1 and § 8): the charte's AppShell — 232px sidebar | main, and up to 1024 px the top
// bar (menu button, name, language / display pair) with the sidebar as a drawer. Demo mode: "View as" at the bottom of the sidebar; Entra mode:
// the signed-in user's account menu instead. The sidebar gets the facilities of the switcher (the viewer's own first) and the
// counts of its entries: decisions waiting, open proposals and conflicts (delivery 5b). The assistant panel is mounted once here
// (delivery 6): it keeps its conversation from one screen to the next.
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { inArray } from 'drizzle-orm';
import { ClockProvider } from '@/components/app/clock';
import { AppShell } from '@norma/charte/ds/AppShell';
import { TopBar } from '@/components/app/shell/prefs';
import { Sidebar } from '@/components/app/shell/sidebar';
import { ToastProvider } from '@/components/ds/Toast';
import { AssistantPanel } from '@/features/assistant/panel';
import { RegisterServiceWorker } from '@/features/offline/register';
import { canUseAssistant } from '@/server/assistant/service';
import { isRoleKey } from '@/config/roles';
import { canSee } from '@/config/screens';
import { operatedFacilities } from '@/domain/rights';
import { dataText } from '@/i18n/data-text';
import { authMode } from '@/server/auth/config';
import { businessToday } from '@/server/clock';
import { getDb } from '@/server/db/client';
import { resources } from '@/server/db/schema';
import { decisionQueue } from '@/server/dal/decisions';
import { visibleFacilities } from '@/server/dal/visibility';
import { initialsOf } from '@/server/viewer';
import { DEMO_PERSONAS, getI18n, getTheme, getViewer } from '@/server/session';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const [viewer, today, jar, { t, lang }, theme] = await Promise.all([getViewer(), businessToday(), cookies(), getI18n(), getTheme()]);
  const entra = authMode() === 'entra';
  const personas = entra ? [] : DEMO_PERSONAS.filter((p) => isRoleKey(p.key)).map((p) => ({ role: p.key as never, name: p.name, initials: initialsOf(p.name) }));
  const facs = canSee(viewer.role, 'facility') ? await visibleFacilities(viewer) : [];
  const counts = new Map<string, number>();
  if (facs.length) {
    const db = await getDb();
    for (const r of await db.select({ f: resources.facilityCode, status: resources.status }).from(resources).where(inArray(resources.facilityCode, facs.map((f) => f.code)))) {
      if (r.status !== 'retired') counts.set(r.f, (counts.get(r.f) ?? 0) + 1);
    }
  }
  const mine = operatedFacilities(viewer.role, viewer.assignments);
  const facilities = facs
    .map((f) => ({ code: f.code, name: dataText(f.name, lang), sub: `${f.operatorEntityCode} · ${counts.get(f.code) ?? 0} ${t('resources')}`, mine: mine.includes(f.code) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine));
  const queue = await decisionQueue(viewer);
  const folded = (jar.get('crucible-nav')?.value ?? '').split(',').filter(Boolean);
  return (
    <ClockProvider today={today}>
      <ToastProvider>
        <AppShell
          sidebar={
            <Suspense>
              <Sidebar
                role={viewer.role}
                personas={personas}
                account={entra ? { name: viewer.name, initials: viewer.initials, role: viewer.role, roles: viewer.roles } : null}
                facilities={facilities}
                lastFacility={jar.get('crucible-facility')?.value ?? null}
                folded={folded}
                badges={{ decide: queue.items.length, propose: queue.openProposals, conflicts: queue.openConflicts }}
              />
            </Suspense>
          }
          topbar={<TopBar lang={lang} theme={theme} />}
        >
          {children}
        </AppShell>
        {canUseAssistant(viewer.role) && <AssistantPanel />}
        <RegisterServiceWorker />
      </ToastProvider>
    </ClockProvider>
  );
}

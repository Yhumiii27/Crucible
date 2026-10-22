// App shell: 232px sidebar | main (Keystone's Nocturne shell). Demo mode: "View as" at the bottom of the sidebar; Entra mode:
// the signed-in user's account menu instead; the count of unread notifications next to the bell (F-8).
import { ClockProvider } from '@/components/app/clock';
import { Sidebar } from '@/components/app/shell/sidebar';
import styles from '@/components/app/shell/shell.module.css';
import { ToastProvider } from '@/components/ds/Toast';
import { isRoleKey } from '@/config/roles';
import { authMode } from '@/server/auth/config';
import { businessToday } from '@/server/clock';
import { unreadCount } from '@/server/dal/incidents';
import { initialsOf } from '@/server/viewer';
import { DEMO_PERSONAS, getViewer } from '@/server/session';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const [viewer, today] = await Promise.all([getViewer(), businessToday()]);
  const entra = authMode() === 'entra';
  const unread = viewer.role === 'admin' ? 0 : await unreadCount(viewer.userId);
  const personas = entra ? [] : DEMO_PERSONAS.filter((p) => isRoleKey(p.key)).map((p) => ({ role: p.key as never, name: p.name, initials: initialsOf(p.name) }));
  return (
    <ClockProvider today={today}>
      <ToastProvider>
        <div className={styles.root}>
          <Sidebar
            role={viewer.role}
            personas={personas}
            account={entra ? { name: viewer.name, initials: viewer.initials, role: viewer.role, roles: viewer.roles } : null}
            badges={{ notifications: unread }}
          />
          <main className={styles.main}>{children}</main>
        </div>
      </ToastProvider>
    </ClockProvider>
  );
}

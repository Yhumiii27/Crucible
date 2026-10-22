// "Coming soon" page of the screens the plan builds in a later delivery (docs/PLAN.md); any other path is not found.
import { Hammer } from '@phosphor-icons/react/dist/ssr';
import { notFound } from 'next/navigation';
import styles from '@/components/app/shell/shell.module.css';
import { PageHeader } from '@/components/app/shell/page-header';
import { canSee, matchScreen } from '@/config/screens';
import { getI18n, getViewer } from '@/server/session';

export default async function ComingSoonPage({ params }: PageProps<'/[...rest]'>) {
  const { rest } = await params;
  const screen = matchScreen('/' + rest.join('/'));
  if (!screen || !canSee((await getViewer()).role, screen.id)) notFound();
  const { t } = await getI18n();
  return (
    <>
      <PageHeader screen={screen.id} />
      <div className={styles.soon}>
        <Hammer size={22} className={styles.soonIcon} />
        <div className={styles.soonTitle}>{t('This screen comes with a later delivery.')}</div>
        <div className={styles.soonSub}>{t(`Planned for delivery ${screen.delivery.slice(1)}`)}</div>
      </div>
    </>
  );
}

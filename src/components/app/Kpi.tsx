// KPI tiles (Norma 2.0, charte/COQUE.md § 6): the charte's KpiGrid and KpiTile. Crucible adds one thing: a tile that opens a
// screen (`href`, delivery 5b, home). Server-compatible.
import Link from 'next/link';
import { KpiTile as CoqueKpiTile, type KpiTileProps as CoqueKpiTileProps } from '@norma/charte/ds/Kpi';
import s from './Kpi.module.css';

export { KpiGrid } from '@norma/charte/ds/Kpi';

export interface KpiTileProps extends CoqueKpiTileProps {
  /** The tile opens this screen. */
  href?: string;
}

export function KpiTile({ href, ...tile }: KpiTileProps) {
  return href ? (
    <Link href={href} className={s.linkTile}>
      <CoqueKpiTile {...tile} />
    </Link>
  ) : (
    <CoqueKpiTile {...tile} />
  );
}

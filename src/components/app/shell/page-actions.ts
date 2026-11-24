// Which of a page's actions is the main one (Norma 2.0, charte/COQUE.md § 3.3: the main action is the rightmost button of the
// header, the others on its left). Pure, server-compatible.
import { Children, Fragment, isValidElement, type ReactNode } from 'react';

/** The actions as a flat list (fragments opened, empty ones dropped). */
function flat(nodes: ReactNode): ReactNode[] {
  return Children.toArray(nodes).flatMap((c) => (isValidElement<{ children?: ReactNode }>(c) && c.type === Fragment ? flat(c.props.children) : [c]));
}

/** The main action of the page (the last `variant="primary"`, else the last one) and the others, in order (pure). */
export function splitPageActions(nodes: ReactNode): { main: ReactNode | null; others: ReactNode[] } {
  const all = flat(nodes);
  if (!all.length) return { main: null, others: [] };
  let i = all.findLastIndex((c) => isValidElement<{ variant?: string }>(c) && c.props.variant === 'primary');
  if (i < 0) i = all.length - 1;
  return { main: all[i], others: all.filter((_, j) => j !== i) };
}

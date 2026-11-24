import { createElement as h, Fragment } from 'react';
import { describe, expect, it } from 'vitest';
import { splitPageActions } from './page-actions';

const B = (p: { variant?: string; id: string }) => h('button', null, p.id);
const ids = (nodes: unknown[]) => nodes.map((n) => (n as { props: { id: string } }).props.id);

describe('splitPageActions', () => {
  it('nothing: no main action', () => {
    expect(splitPageActions(undefined)).toEqual({ main: null, others: [] });
    expect(splitPageActions(h(Fragment, null, false, null))).toEqual({ main: null, others: [] });
  });

  it('the last primary one is the main action, the others keep their order', () => {
    const r = splitPageActions(h(Fragment, null, h(B, { id: 'a' }), h(Fragment, null, h(B, { id: 'b', variant: 'primary' }), h(B, { id: 'c' })), false));
    expect((r.main as { props: { id: string } }).props.id).toBe('b');
    expect(ids(r.others)).toEqual(['a', 'c']);
  });

  it('without a primary one, the last action is the main one', () => {
    const r = splitPageActions(h(Fragment, null, h(B, { id: 'a' }), h(B, { id: 'b' })));
    expect((r.main as { props: { id: string } }).props.id).toBe('b');
    expect(ids(r.others)).toEqual(['a']);
  });
});

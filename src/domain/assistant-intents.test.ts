import { describe, expect, it } from 'vitest';
import { datesIn, parseQuestion, quarterIn } from './assistant-intents';

const CAT = { resources: ['PDE-PIL', 'PDE-ATM', 'PDE-LAB', 'LAB67-CLIM', 'LAB67-TRAC'], testTypes: ['TRACTION', 'FIRING'], facilities: ['PDE', 'LAB67'] };
const TODAY = '2026-10-22'; // a Thursday

describe('the questions the templates answer without AI', () => {
  it('a reference: the conflict first, then the need', () => {
    expect(parseQuestion('Pourquoi mon essai N-2026-0003 est-il proposé le 14 ?', CAT, TODAY)).toEqual({ kind: 'need', ref: 'N-2026-0003' });
    expect(parseQuestion('Résume le conflit c-2026-0001 (N-2026-0002) pour le comité', CAT, TODAY)).toEqual({ kind: 'conflict', ref: 'C-2026-0001' });
  });

  it('where can I do a test: the test type or the resource, this week by default, or the dates written', () => {
    expect(parseQuestion('Où puis-je faire cet essai TRACTION cette semaine ?', CAT, TODAY))
      .toEqual({ kind: 'alternatives', testType: 'TRACTION', resource: null, fromOn: '2026-10-23', toOn: '2026-10-23' });
    expect(parseQuestion('Une alternative à LAB67-TRAC du 3/11 au 6/11 ?', CAT, TODAY))
      .toEqual({ kind: 'alternatives', testType: null, resource: 'LAB67-TRAC', fromOn: '2026-11-03', toOn: '2026-11-06' });
  });

  it('what if: a resource out, next week by default; a facility code inside a resource code is not the facility', () => {
    expect(parseQuestion('Et si PDE-ATM était en panne la semaine prochaine ?', CAT, TODAY)).toEqual({ kind: 'simulate', resource: 'PDE-ATM', fromOn: '2026-10-26', toOn: '2026-10-30' });
    expect(parseQuestion('What if PDE-PIL is out on 2026-11-10?', CAT, TODAY)).toEqual({ kind: 'simulate', resource: 'PDE-PIL', fromOn: '2026-11-10', toOn: '2026-11-10' });
  });

  it('anticipate: the facility and the quarter (the next one of that number)', () => {
    expect(parseQuestion('Quels projets risquent de manquer de PDE au premier trimestre ?', CAT, TODAY)).toEqual({ kind: 'risks', facility: 'PDE', quarter: '2027-T1' });
    expect(parseQuestion('Goulots au T4 ?', CAT, TODAY)).toEqual({ kind: 'risks', facility: null, quarter: '2026-T4' });
    expect(quarterIn('Q2 2027', TODAY)).toBe('2027-T2');
  });

  it('a need in free text cannot be read without AI: the form; anything else: the help', () => {
    expect(parseQuestion('J’ai 6 tirs de qualification à faire avant le jalon J3', CAT, TODAY)).toEqual({ kind: 'prepare' });
    expect(parseQuestion('I have 6 qualification firings to run before the Orion review', CAT, TODAY)).toEqual({ kind: 'prepare' });
    expect(parseQuestion('Bonjour', CAT, TODAY)).toEqual({ kind: 'help' });
  });

  it('dates: ISO, day/month (next year once past), day/month/year', () => {
    expect(datesIn('du 2026-11-03 au 05/01 puis 7/2/27', TODAY)).toEqual(['2026-11-03', '2027-01-05', '2027-02-07']);
    expect(datesIn('le 31/02', TODAY)).toEqual([]);
  });
});

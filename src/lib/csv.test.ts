import { describe, expect, it } from 'vitest';
import { csvFileName, toCsv } from './csv';

describe('CSV of an export', () => {
  it('semicolons, a byte order mark, CRLF; values with a separator, a quote or a line break are quoted', () => {
    expect(toCsv([['Réservation', 'Moyen'], ['B-2026-0011', 'PDE-PIL'], ['a;b', 'il dit "oui"'], ['ligne\n2', null]])).toBe(
      '﻿Réservation;Moyen\r\nB-2026-0011;PDE-PIL\r\n"a;b";"il dit ""oui"""\r\n"ligne\n2";\r\n',
    );
  });

  it('a file name without anything but letters, digits and dashes', () => {
    expect(csvFileName('propose', '2026-10-22')).toBe('crucible-propose-2026-10-22.csv');
    expect(csvFileName('../x', '2026/10/22')).toBe('crucible-x-20261022.csv');
  });
});

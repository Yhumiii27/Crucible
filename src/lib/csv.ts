// CSV of an export (delivery 5b, the header's Export menu). Pure. Semicolon-separated with a UTF-8 byte order mark, so that
// Excel in French opens it with its columns and accents; a value holding a separator, a quote or a line break is quoted.
export const CSV_SEPARATOR = ';';

const cell = (v: string | number | null | undefined): string => {
  const s = v == null ? '' : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(CSV_SEPARATOR)).join('\r\n') + '\r\n';
}

/** File name of an export: `crucible-<screen>-<date>.csv`, letters, digits and dashes only. */
export const csvFileName = (screen: string, isoDate: string) => `crucible-${screen.replace(/[^a-z0-9-]/gi, '')}-${isoDate.replace(/[^0-9-]/g, '')}.csv`;

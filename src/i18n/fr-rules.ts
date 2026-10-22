// Parameterised French renderings of the English sentences Crucible builds with values (a count, a name, a code). The first
// rule that matches applies. Keep each rule anchored (^…$) and its captures to values.
export const FR_RULES: [RegExp, string][] = [
  [/^Planned for delivery (\d+)$/, 'Prévu pour la livraison $1'],
  [/^delivery (\d+)$/, 'livraison $1'],
  [/^(\d+) entries$/, '$1 entrée(s)'],
];

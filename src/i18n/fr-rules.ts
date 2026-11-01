// Parameterised French renderings of the English sentences Crucible builds with values (a count, a name, a code). The first
// rule that matches applies. Keep each rule anchored (^…$) and its captures to values.
export const FR_RULES: [RegExp, string][] = [
  [/^Planned for delivery (\d+)$/, 'Prévu pour la livraison $1'],
  [/^delivery (\d+)$/, 'livraison $1'],
  [/^(\d+) entries$/, '$1 entrée(s)'],
  [/^Line (\d+)$/, 'Ligne $1'],
  [/^(\d+) past bookings imported$/, '$1 réservations passées importées'],
  [/^Incident (AL-\d{4}-\d+)$/, 'Aléa $1'],
  [/^Scenario (S-\d{4}-\d+)$/, 'Scénario $1'],
  [/^(\d+) bookings moved$/, '$1 réservation(s) déplacée(s)'],
  [/^(\d+) read$/, '$1 lu(s)'],
  [/^rev\. (\S+) in force$/, 'rév. $1 en vigueur'],
  [/^(\d+) added$/, '$1 ajouté(s)'],
  [/^(\d+) changed$/, '$1 modifié(s)'],
  [/^(\d+) removed$/, '$1 retiré(s)'],
  [/^(\d+) skipped$/, '$1 écarté(s)'],
];

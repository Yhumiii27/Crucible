// Semantic tone system of Nocturne (copied from Keystone, docs/spec/02 DS-TONES there): no red/amber/green — severity is
// accent intensity. Pure functions, usable in Server and Client Components and in tests.
//
//   alert  → tag-accent  (filled accent-800 / accent-100), text LO = accent-300
//   watch  → tag-outline (accent outline)
//   calm   → tag-neutral (neutral-800 / neutral-100), text OK = text
//   n/a    → text-muted "—"

/** Text colour for "bad" values. */
export const LO = 'var(--color-accent-300)';
/** Text colour for normal values. */
export const OK = 'var(--color-text)';

export type Tone = 'accent' | 'outline' | 'neutral' | 'muted';

/** Full class string of a tone. */
export const TAG_CLASS: Record<Tone, string> = {
  accent: 'tag tag-accent',
  outline: 'tag tag-outline',
  neutral: 'tag tag-neutral',
  muted: 'text-muted',
};

/** LO when `bad`, else OK (KPI values, metric cells). */
export const toneColor = (bad: boolean) => (bad ? LO : OK);

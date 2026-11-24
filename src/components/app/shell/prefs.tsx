'use client';
// The language / display pair of Norma 2.0 (charte/COQUE.md § 4): FR | EN above dark | light, same size, left edges aligned —
// the last element of every page header and, up to 1024 px, of the top bar (charte/COQUE.md § 8). The language is Crucible's
// cookie (setLang), the display the suite's cookie epc2i-theme.
import { Polygon } from '@phosphor-icons/react/dist/ssr';
import { MobileTopBar } from '@norma/charte/ds/AppShell';
import { PrefsStack, type Lang } from '@norma/charte/ds/HeaderTools';
import type { Theme } from '@norma/charte/ds/theme';
import { setLang } from '@/server/actions/preferences';

export function Prefs({ lang, theme }: { lang: Lang; theme: Theme }) {
  return <PrefsStack lang={lang} theme={theme} onSelect={setLang} />;
}

/** Top bar of a phone or a tablet (≤ 1024 px): the menu button, the tool's name, then the pair. */
export function TopBar({ lang, theme }: { lang: Lang; theme: Theme }) {
  return <MobileTopBar name="Crucible" icon={Polygon} prefs={<Prefs lang={lang} theme={theme} />} />;
}

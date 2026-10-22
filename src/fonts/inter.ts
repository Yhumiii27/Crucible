import localFont from 'next/font/local';

// Inter served from the repository so that `next build` needs no network — the files and settings of Codex's
// src/fonts/inter.ts (Inter 4.001, variable weight, Google Fonts' latin and latin-ext cuts). Licence: SIL OFL 1.1, ./inter/OFL.txt.
export const inter = localFont({
  src: './inter/inter-latin-wght.woff2', weight: '100 900', style: 'normal', display: 'swap', variable: '--font-inter',
  adjustFontFallback: false, fallback: ['system-ui', 'sans-serif'],
  declarations: [{ prop: 'font-family', value: 'Inter' }, { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }],
});
const latinExt = localFont({
  src: './inter/inter-latin-ext-wght.woff2', weight: '100 900', style: 'normal', display: 'swap', preload: false, adjustFontFallback: false,
  declarations: [{ prop: 'font-family', value: 'Inter' }, { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
});

/** Class for <html>: sets --font-inter, which Nocturne's --font-body and --font-heading start with. */
export const interClassName = inter.variable;
/** Read by nothing: its faces come with the module's CSS. Exported so that lint does not drop it. */
export const interSubsets = [latinExt];

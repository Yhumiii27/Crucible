import type { Metadata } from 'next';
import '@norma/charte/nocturne.css';
import './globals.css';
import { interClassName } from '@/fonts/inter';
import { I18nProvider } from '@/i18n/client';
import { getLang, getTheme } from '@/server/session';

export const metadata: Metadata = {
  title: 'Crucible',
  description: 'Crucible — shared R&D test resources',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);
  return (
    <html lang={lang} className={interClassName} data-theme={theme}>
      <body>
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}

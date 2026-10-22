import type { Metadata } from 'next';
import '@/styles/nocturne.css';
import './globals.css';
import { interClassName } from '@/fonts/inter';
import { I18nProvider } from '@/i18n/client';
import { getLang } from '@/server/session';

export const metadata: Metadata = {
  title: 'Crucible',
  description: 'Crucible — shared R&D test resources',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const lang = await getLang();
  return (
    <html lang={lang} className={interClassName}>
      <body>
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}

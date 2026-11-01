'use client';
// Prints the report (CR-077): the browser's print dialog, where "Save as PDF" gives the PDF. The shell is hidden in print.
import { Printer } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ds/Button';
import { useI18n } from '@/i18n/client';

export function PrintButton() {
  const { t } = useI18n();
  return <Button variant="primary" size="md" icon={Printer} onClick={() => window.print()}>{t('Print or save as PDF')}</Button>;
}

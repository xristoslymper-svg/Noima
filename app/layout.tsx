import type { Metadata } from "next";
import "./globals.css";
import "./clinical-refinement.css";
import "./visit-workspace.css";
import "./mobile.css";
import "./initial-assessment.css";
import "./clinical-editor.css";
import "./noima-ui.css";
import "./language-controls.css";
import "./patient-tool-polish.css";
import "./visit-dialog-polish.css";
import "./screen-polish.css";
import {getLocale, getMessages} from 'next-intl/server';
import LocaleProvider from '@/i18n/LocaleProvider';
import PilotNotice from '@/i18n/PilotNotice';
import AccountSessionBoundary from '@/components/AccountSessionBoundary';

export const metadata: Metadata = {
  title: "NOIMA",
  description: "NOIMA"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale}>
      <body><LocaleProvider initialLocale={locale} initialMessages={messages}><PilotNotice realData={process.env.CLINICAL_DATA_MODE==='real'}/>{process.env.CLINICAL_DATA_MODE!=='real'&&<AccountSessionBoundary>{children}</AccountSessionBoundary>}</LocaleProvider></body>
    </html>
  );
}

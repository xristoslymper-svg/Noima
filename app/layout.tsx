import type { Metadata } from "next";
import "./globals.css";
import "./clinical-refinement.css";
import "./visit-workspace.css";
import "./mobile.css";
import "./initial-assessment.css";
import AccountSessionBoundary from '@/components/AccountSessionBoundary';

export const metadata: Metadata = {
  title: "Ψυχιατρικό Workspace",
  description: "Κλινικό workspace σχεδιασμένο για ψυχιάτρους."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="el">
      <body><div className="fictional-pilot-notice">Πιλοτική δοκιμή · μόνο υποθετικοί ασθενείς και περιστατικά</div>{process.env.CLINICAL_DATA_MODE==='real'?<main className="record-state">Η πρόσβαση πραγματικών ασθενών δεν έχει ενεργοποιηθεί.</main>:<AccountSessionBoundary>{children}</AccountSessionBoundary>}</body>
    </html>
  );
}

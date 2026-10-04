import type { Metadata } from "next";
import "./globals.css";
import "./clinical-refinement.css";
import PilotAuthGate from "@/components/PilotAuthGate";

export const metadata: Metadata = {
  title: "Ψυχιατρικό Workspace",
  description: "Κλινικό workspace σχεδιασμένο για ψυχιάτρους."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="el">
      <body><div className="fictional-pilot-notice">Δοκιμαστικός χώρος · μόνο φανταστικοί φάκελοι</div>{process.env.CLINICAL_DATA_MODE==='real'?<main className="record-state">Η πρόσβαση πραγματικών ασθενών δεν έχει ενεργοποιηθεί.</main>:<PilotAuthGate>{children}</PilotAuthGate>}</body>
    </html>
  );
}

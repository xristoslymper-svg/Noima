import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ψυχιατρικό Workspace",
  description: "Κλινικό workspace σχεδιασμένο για ψυχιάτρους."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}

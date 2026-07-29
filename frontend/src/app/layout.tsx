import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import SyncStatus from "@/components/SyncStatus";
import Topbar from "@/components/Topbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rio Vita — Gestão Operacional",
  description: "Sistema de gestão operacional da Rio Vita. Financeiro, fiscal e contábil continuam no Omie.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <SyncStatus />
        <Topbar />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}

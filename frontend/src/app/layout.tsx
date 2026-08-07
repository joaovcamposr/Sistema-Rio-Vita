import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import SyncStatus from "@/components/SyncStatus";
import Topbar from "@/components/Topbar";
import "./globals.css";

// Todo o app é client-side (dados vêm de fetch() no navegador, não de
// renderização no servidor) — sem isso, o Next.js pré-renderiza as páginas
// como estáticas e cacheia o HTML por até 1 ano (s-maxage). Um novo deploy
// não invalida esse cache automaticamente na Railway, então o HTML antigo
// continua sendo servido, às vezes referenciando arquivos JS que nem
// existem mais no build atual (a causa da tela não atualizar depois de
// um push). force-dynamic garante HTML fresco a cada request.
export const dynamic = "force-dynamic";

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

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { obterSessao } from "@/lib/auth";

/** Guarda de rota: só libera as telas do sistema para quem tem sessão salva
 * no aparelho. A tela de login fica sempre liberada (senão ninguém entra). */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (pathname === "/login") {
      setPronto(true);
      return;
    }
    if (!obterSessao()) {
      router.replace("/login");
      return;
    }
    setPronto(true);
  }, [pathname, router]);

  if (!pronto) return null;
  return <>{children}</>;
}

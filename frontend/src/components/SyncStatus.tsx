"use client";

import { useEffect, useState } from "react";
import { aoMudarFila, iniciarSincronizadorEmSegundoPlano } from "@/lib/offline-queue";

export default function SyncStatus() {
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    iniciarSincronizadorEmSegundoPlano();
    return aoMudarFila(setPendentes);
  }, []);

  if (pendentes === 0) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--warn-soft)",
        color: "var(--warn)",
        borderBottom: "1px solid var(--warn)",
        padding: "8px 16px",
        fontSize: ".82rem",
        fontWeight: 600,
        textAlign: "center",
      }}
    >
      {pendentes} {pendentes === 1 ? "lançamento" : "lançamentos"} aguardando conexão para sincronizar
    </div>
  );
}

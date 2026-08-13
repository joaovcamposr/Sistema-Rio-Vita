"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { aoMudarFila, iniciarSincronizadorEmSegundoPlano } from "@/lib/offline-queue";

export default function SyncStatus() {
  const router = useRouter();
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    iniciarSincronizadorEmSegundoPlano();
    return aoMudarFila(setPendentes);
  }, []);

  if (pendentes === 0) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/pendencias")}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "block",
        width: "100%",
        background: "var(--warn-soft)",
        color: "var(--warn)",
        border: "none",
        borderBottom: "1px solid var(--warn)",
        padding: "8px 16px",
        fontSize: ".82rem",
        fontWeight: 600,
        textAlign: "center",
        cursor: "pointer",
      }}
    >
      {pendentes} {pendentes === 1 ? "lançamento" : "lançamentos"} aguardando conexão para sincronizar — toque para ver
    </button>
  );
}

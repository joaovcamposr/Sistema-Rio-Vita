"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Tela de um módulo escondido (ver lib/modulos.ts): avisa e volta ao início. */
export default function ModuloOculto({ nome }: { nome: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/"), 1500);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center", color: "var(--ink-muted)" }}>
      <p style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--ink)" }}>{nome} não está disponível.</p>
      <p style={{ marginTop: 8 }}>Voltando para o início…</p>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

interface ClienteOpcao {
  id: number;
  nome: string;
}

interface Props {
  clientes: ClienteOpcao[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Texto da opção "nenhum cliente selecionado" — varia por tela
   * (ex.: "Consumidor final" numa venda, "Todos os clientes" num filtro). */
  opcaoVazia?: string;
  placeholder?: string;
  className?: string;
}

function normaliza(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Campo de cliente com busca por nome — troca a lista rolável nativa
 * (impraticável com centenas de clientes) por um campo de texto que
 * filtra ao digitar. Usado em toda tela que precisa escolher um cliente
 * (acerto de expedição, edição de venda, filtro do painel comercial). */
export default function ClienteCombobox({
  clientes, value, onChange, opcaoVazia = "Todos os clientes", placeholder = "Buscar cliente…", className,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selecionado = clientes.find((c) => c.id === value) ?? null;

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const buscaNorm = normaliza(busca);
  const filtrados = (buscaNorm ? clientes.filter((c) => normaliza(c.nome).includes(buscaNorm)) : clientes).slice(0, 60);

  return (
    <div ref={ref} className={className} style={{ position: "relative" }}>
      <input
        type="text"
        value={aberto ? busca : (selecionado?.nome ?? "")}
        onFocus={() => { setAberto(true); setBusca(""); }}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={aberto ? placeholder : (selecionado?.nome ?? opcaoVazia)}
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--rule-strong)",
          background: "var(--surface)", color: "var(--ink)", font: "inherit", fontSize: "0.92rem",
        }}
      />
      {aberto && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
            background: "var(--surface)", border: "1px solid var(--rule-strong)", borderRadius: 9,
            maxHeight: 260, overflowY: "auto", boxShadow: "var(--shadow-lg)",
          }}
        >
          <div
            onClick={() => { onChange(null); setAberto(false); }}
            style={{
              padding: "8px 12px", cursor: "pointer", fontStyle: "italic", fontSize: "0.9rem",
              color: "var(--ink-muted)", borderBottom: "1px solid var(--rule)",
            }}
          >
            {opcaoVazia}
          </div>
          {filtrados.map((c) => (
            <div
              key={c.id}
              onClick={() => { onChange(c.id); setAberto(false); }}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: "0.9rem",
                background: c.id === value ? "var(--brand-wash)" : "transparent",
              }}
              onMouseEnter={(e) => { if (c.id !== value) e.currentTarget.style.background = "var(--surface-sunk)"; }}
              onMouseLeave={(e) => { if (c.id !== value) e.currentTarget.style.background = "transparent"; }}
            >
              {c.nome}
            </div>
          ))}
          {filtrados.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: "0.85rem", color: "var(--ink-faint)" }}>Nenhum cliente encontrado</div>
          )}
        </div>
      )}
    </div>
  );
}

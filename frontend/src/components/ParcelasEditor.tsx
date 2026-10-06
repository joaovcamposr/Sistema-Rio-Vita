"use client";

import { useEffect, useState } from "react";
import type { VendaParcelaEntrada } from "@/lib/api";

interface LinhaParcela {
  id?: number | null;
  valorTexto: string;
  forma_pgto: string;
  data_prevista: string;
  dataPagamentoTexto: string; // "" = em aberto, senão ISO
}

interface Props {
  /** Data da venda — mínimo pra "data prevista" e origem dos atalhos de dias. */
  dataBase: string;
  /** Valor total da venda (quantidade × preço), recalculado ao vivo pela tela que usa o editor. */
  valorTotal: number;
  /** Estado inicial das parcelas — lido só na montagem. Pra resetar (ex.: trocar de venda sendo editada), monte com uma `key` diferente. */
  parcelasIniciais: VendaParcelaEntrada[];
  onChange: (parcelas: VendaParcelaEntrada[], somaBate: boolean) => void;
  formas?: string[];
}

const FORMAS_PADRAO = ["Pix", "Boleto", "Dinheiro", "Cheque"];

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function nf(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function paraNumero(texto: string): number {
  // nf() formata com separador de milhar ("1.560,00") — remove os pontos
  // de milhar antes de trocar a vírgula decimal, senão "1.560,00" vira
  // "1.560.00" e vira 1.56 no parseFloat (interrompe no segundo ponto)
  return parseFloat(texto.replace(/\./g, "").replace(",", ".")) || 0;
}

/** Atalho pra montar o estado inicial mais comum: uma única parcela,
 * recebida no ato (equivalente ao antigo "à vista"). */
export function parcelaUnicaAVista(dataBase: string, valor: number, forma = FORMAS_PADRAO[2]): VendaParcelaEntrada[] {
  return [{ valor, forma_pgto: forma, data_prevista: dataBase, data_pagamento: dataBase }];
}

function linhaDe(p: VendaParcelaEntrada): LinhaParcela {
  return {
    id: p.id ?? null,
    valorTexto: nf(p.valor),
    forma_pgto: p.forma_pgto,
    data_prevista: p.data_prevista,
    dataPagamentoTexto: p.data_pagamento ?? "",
  };
}

export default function ParcelasEditor({ dataBase, valorTotal, parcelasIniciais, onChange, formas = FORMAS_PADRAO }: Props) {
  const [linhas, setLinhas] = useState<LinhaParcela[]>(() =>
    parcelasIniciais.length > 0 ? parcelasIniciais.map(linhaDe) : [linhaDe(parcelaUnicaAVista(dataBase, valorTotal, formas[0])[0])]
  );

  // com uma parcela só, o valor segue o total da venda ao vivo — só pára
  // de seguir quando o operador divide em mais de uma
  useEffect(() => {
    setLinhas((atual) => (atual.length === 1 ? [{ ...atual[0], valorTexto: nf(valorTotal) }] : atual));
  }, [valorTotal]);

  const soma = linhas.reduce((s, l) => s + paraNumero(l.valorTexto), 0);
  const somaBate = Math.abs(soma - valorTotal) <= 0.01;

  useEffect(() => {
    const parcelas: VendaParcelaEntrada[] = linhas.map((l) => ({
      id: l.id ?? null,
      valor: paraNumero(l.valorTexto),
      forma_pgto: l.forma_pgto,
      data_prevista: l.data_prevista,
      data_pagamento: l.dataPagamentoTexto || null,
    }));
    onChange(parcelas, somaBate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas]);

  function atualizar(idx: number, campo: keyof LinhaParcela, valor: string) {
    setLinhas((ls) => {
      const copia = [...ls];
      copia[idx] = { ...copia[idx], [campo]: valor };
      return copia;
    });
  }

  function adicionar() {
    const faltante = Math.max(0, valorTotal - soma);
    const ultimaForma = linhas[linhas.length - 1]?.forma_pgto ?? formas[0];
    setLinhas((ls) => [
      ...ls,
      { id: null, valorTexto: nf(faltante), forma_pgto: ultimaForma, data_prevista: somarDias(dataBase, 7), dataPagamentoTexto: "" },
    ]);
  }

  function remover(idx: number) {
    setLinhas((ls) => ls.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {linhas.map((l, idx) => {
        const recebido = l.dataPagamentoTexto !== "";
        return (
          <div
            key={idx}
            style={{
              border: "1px solid var(--rule)", borderRadius: 11, padding: 12,
              marginBottom: 10, background: "var(--surface)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--ink-muted)" }}>
                Parcela {idx + 1}
              </span>
              {linhas.length > 1 && (
                <button
                  type="button"
                  onClick={() => remover(idx)}
                  style={{ background: "none", border: "none", color: "var(--crit)", fontSize: "0.78rem", cursor: "pointer" }}
                >
                  Remover
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px" }}>
                <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-muted)", marginBottom: 5 }}>
                  Valor (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={l.valorTexto}
                  onChange={(e) => atualizar(idx, "valorTexto", e.target.value)}
                  style={{
                    width: "100%", padding: "9px 10px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                    background: "var(--surface)", color: "var(--ink)", font: "inherit", fontSize: "0.95rem",
                    fontVariantNumeric: "tabular-nums", textAlign: "right",
                  }}
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-muted)", marginBottom: 5 }}>
                  Data prevista
                </label>
                <input
                  type="date"
                  value={l.data_prevista}
                  min={dataBase}
                  onChange={(e) => atualizar(idx, "data_prevista", e.target.value)}
                  style={{
                    width: "100%", padding: "9px 10px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                    background: "var(--surface)", color: "var(--ink)", font: "inherit", fontSize: "0.92rem",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {[["Hoje", 0], ["+7 dias", 7], ["+14 dias", 14], ["+30 dias", 30]].map(([rotulo, dias]) => (
                <button
                  key={rotulo}
                  type="button"
                  onClick={() => atualizar(idx, "data_prevista", somarDias(dataBase, dias as number))}
                  style={{
                    border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--ink-muted)",
                    padding: "5px 10px", borderRadius: 999, font: "inherit", fontSize: "0.74rem", cursor: "pointer",
                  }}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-muted)", marginBottom: 5 }}>
                Forma de pagamento
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {formas.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={l.forma_pgto === f}
                    onClick={() => atualizar(idx, "forma_pgto", f)}
                    style={{
                      border: "1px solid var(--rule-strong)", padding: "8px 13px", borderRadius: 999,
                      font: "inherit", fontSize: "0.84rem", cursor: "pointer",
                      background: l.forma_pgto === f ? "var(--brand)" : "var(--surface)",
                      borderColor: l.forma_pgto === f ? "var(--brand)" : "var(--rule-strong)",
                      color: l.forma_pgto === f ? "var(--brand-ink)" : "var(--ink-muted)",
                      fontWeight: l.forma_pgto === f ? 700 : 400,
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                id={`recebido-${idx}`}
                checked={recebido}
                onChange={(e) =>
                  atualizar(idx, "dataPagamentoTexto", e.target.checked ? (l.data_prevista || hojeISO()) : "")
                }
                style={{ width: 18, height: 18, accentColor: "var(--brand)", flex: "none" }}
              />
              <label htmlFor={`recebido-${idx}`} style={{ fontSize: "0.86rem" }}>Já recebido</label>
              {recebido && (
                <input
                  type="date"
                  value={l.dataPagamentoTexto}
                  onChange={(e) => atualizar(idx, "dataPagamentoTexto", e.target.value)}
                  style={{
                    marginLeft: "auto", padding: "7px 9px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                    background: "var(--surface)", color: "var(--ink)", font: "inherit", fontSize: "0.86rem",
                  }}
                />
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={adicionar}
        style={{
          border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--ink-muted)",
          padding: "9px 14px", borderRadius: 999, font: "inherit", fontSize: "0.84rem", cursor: "pointer",
        }}
      >
        + adicionar parcela
      </button>

      <div
        style={{
          marginTop: 12, background: somaBate ? "var(--brand-wash)" : "var(--crit-soft)",
          border: `1px dashed ${somaBate ? "var(--brand)" : "var(--crit)"}`, borderRadius: 11,
          padding: "11px 14px", display: "flex", justifyContent: "space-between", gap: 12,
          fontSize: "0.84rem", fontWeight: 700, color: somaBate ? "var(--brand-deep)" : "var(--crit)",
        }}
      >
        <span>Soma das parcelas: {moeda(soma)}</span>
        <span>Total da venda: {moeda(valorTotal)}</span>
      </div>
      {!somaBate && (
        <p style={{ fontSize: "0.78rem", color: "var(--crit)", marginTop: 6 }}>
          A soma das parcelas precisa bater com o total da venda antes de salvar.
        </p>
      )}
    </div>
  );
}

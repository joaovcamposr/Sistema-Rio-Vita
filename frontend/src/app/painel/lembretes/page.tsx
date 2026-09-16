"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { concluirLembrete, excluirLembrete, listarVendedores, reabrirLembrete, type LembreteCliente, type Vendedor } from "@/lib/cadastros";
import { painelLembretes } from "@/lib/paineis";
import styles from "../painel.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

type Situacao = "pendente" | "atrasado" | "concluido" | "todos";

const SITUACOES: { valor: Situacao; label: string }[] = [
  { valor: "pendente", label: "Pendentes" },
  { valor: "atrasado", label: "Atrasados" },
  { valor: "concluido", label: "Concluídos" },
  { valor: "todos", label: "Todos" },
];

export default function PainelLembretes() {
  const router = useRouter();
  const [situacao, setSituacao] = useState<Situacao>("pendente");
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [dados, setDados] = useState<LembreteCliente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processandoId, setProcessandoId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function carregar() {
    setDados(null);
    painelLembretes(situacao, vendedorId).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }

  useEffect(() => {
    listarVendedores().then(setVendedores).catch(() => undefined);
  }, []);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacao, vendedorId]);

  async function concluirClick(l: LembreteCliente) {
    setProcessandoId(l.id);
    try {
      await concluirLembrete(l.id);
      setToast("Lembrete concluído");
      carregar();
    } catch {
      setToast("Não foi possível concluir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function reabrirClick(l: LembreteCliente) {
    setProcessandoId(l.id);
    try {
      await reabrirLembrete(l.id);
      carregar();
    } catch {
      setToast("Não foi possível reabrir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function excluirClick(l: LembreteCliente) {
    if (!window.confirm(`Excluir o lembrete de ${l.cliente_nome}?`)) return;
    setProcessandoId(l.id);
    try {
      await excluirLembrete(l.id);
      setToast("Lembrete excluído");
      carregar();
    } catch {
      setToast("Não foi possível excluir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  const hoje = hojeISO();
  const atrasados = dados?.filter((l) => !l.concluido && l.data_prevista < hoje).length ?? 0;
  const hojeCount = dados?.filter((l) => !l.concluido && l.data_prevista === hoje).length ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Follow-ups</h1>
          <div className={styles.sub}>Lembretes de clientes — o que está pendente, atrasado ou já feito</div>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.filtros}>
          <div className={styles.campo}>
            <label>Situação</label>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
              {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
            </select>
          </div>
          <div className={styles.campo}>
            <label>Vendedor</label>
            <select
              value={vendedorId ?? ""}
              onChange={(e) => setVendedorId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
        </div>

        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}

        {dados && situacao === "pendente" && (
          <div className={styles.cards} style={{ marginBottom: 18 }}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Pendentes</div>
              <div className={styles.cardValue}>{dados.length}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Atrasados</div>
              <div className={styles.cardValue} style={{ color: atrasados > 0 ? "var(--crit)" : undefined }}>{atrasados}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Pra hoje</div>
              <div className={styles.cardValue}>{hojeCount}</div>
            </div>
          </div>
        )}

        {dados && dados.length === 0 && <p className={styles.hint}>Nada por aqui.</p>}
        {dados && dados.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Descrição</th><th></th></tr>
              </thead>
              <tbody>
                {dados.map((l) => {
                  const atrasado = !l.concluido && l.data_prevista < hoje;
                  return (
                    <tr key={l.id}>
                      <td>
                        <span className={`${styles.badge} ${atrasado ? styles.badgeCrit : ""}`}>{dataBr(l.data_prevista)}</span>
                      </td>
                      <td><Link href={`/cadastros/clientes/${l.cliente_id}`} style={{ color: "var(--brand-deep)", fontWeight: 700 }}>{l.cliente_nome}</Link></td>
                      <td>{l.vendedor_nome ?? "—"}</td>
                      <td style={{ textDecoration: l.concluido ? "line-through" : "none" }}>{l.descricao}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {l.concluido ? (
                          <button
                            type="button" disabled={processandoId === l.id} onClick={() => reabrirClick(l)}
                            style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                          >
                            Reabrir
                          </button>
                        ) : (
                          <button
                            type="button" disabled={processandoId === l.id} onClick={() => concluirClick(l)}
                            style={{ background: "none", border: "none", color: "var(--ok)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                          >
                            Concluir
                          </button>
                        )}
                        {" · "}
                        <button
                          type="button" disabled={processandoId === l.id} onClick={() => excluirClick(l)}
                          style={{ background: "none", border: "none", color: "var(--crit)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink)", color: "var(--ground)", padding: "10px 18px", borderRadius: 10,
          fontSize: "0.85rem", fontWeight: 600, zIndex: 50,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  lerFotoProducao, listarDespescasDoLote, listarProdutos, listarViveiros,
  type Despesca, type Produto, type Viveiro,
} from "@/lib/api";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";
import tabelaStyles from "../../painel/painel.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function tentarConverterData(bruta: string | null): string | null {
  if (!bruta) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruta)) return bruta;
  const br = bruta.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, d, m, yRaw] = br;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function unidadesPorCaixa(nome: string): number | null {
  if (nome.startsWith("Filé")) return 8;
  if (nome.startsWith("Postas")) return 6;
  return null;
}

interface LinhaEditavel {
  produtoId: number;
  produtoNome: string;
  caixas: string;
  soltos: string;
  quantidadeUn: string;
  pesoKg: string;
}

export default function ProducaoPorFoto() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [lendo, setLendo] = useState(false);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [lido, setLido] = useState(false);
  const [naoReconhecidos, setNaoReconhecidos] = useState<string[]>([]);

  const [data, setData] = useState(hojeISO());
  const [viveiroId, setViveiroId] = useState<number | null>(null);
  const [despescas, setDespescas] = useState<Despesca[]>([]);
  const [despescaId, setDespescaId] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([]);

  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listarViveiros()
      .then((lista) => setViveiros(lista.filter((v) => v.lote_atual !== null)))
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
    listarProdutos()
      .then((ps) => setProdutos(ps.filter((p) => !p.nome.toLowerCase().includes("suja"))))
      .catch(() => {});
  }, []);

  const viveiro = useMemo(() => viveiros.find((v) => v.id === viveiroId) ?? null, [viveiros, viveiroId]);
  const lote = viveiro?.lote_atual ?? null;

  useEffect(() => {
    setDespescaId(null);
    if (!lote) { setDespescas([]); return; }
    listarDespescasDoLote(lote.id).then((lista) => {
      setDespescas(lista);
      if (lista.length > 0) setDespescaId(lista[0].id);
    }).catch(() => setDespescas([]));
  }, [lote?.id]);

  async function aoEscolherFoto(arquivo: File) {
    setLendo(true);
    setErroLeitura(null);
    try {
      const leitura = await lerFotoProducao(arquivo);

      const dataConvertida = tentarConverterData(leitura.data_lida);
      if (dataConvertida) setData(dataConvertida);

      const semMatch: string[] = [];
      if (leitura.tanque_origem) {
        const alvo = leitura.tanque_origem.trim().toLowerCase();
        const achado = viveiros.find((v) => v.codigo.trim().toLowerCase() === alvo);
        if (achado) setViveiroId(achado.id);
        else semMatch.push(`tanque "${leitura.tanque_origem}"`);
      }

      const editaveis: LinhaEditavel[] = produtos.map((p) => {
        const item = leitura.itens.find((i) => i.produto_nome.trim().toLowerCase() === p.nome.trim().toLowerCase());
        return {
          produtoId: p.id,
          produtoNome: p.nome,
          caixas: item?.caixas_fechadas !== null && item?.caixas_fechadas !== undefined ? String(item.caixas_fechadas) : "",
          soltos: item?.pacotes_soltos !== null && item?.pacotes_soltos !== undefined ? String(item.pacotes_soltos) : "",
          quantidadeUn: item?.quantidade_un !== null && item?.quantidade_un !== undefined ? String(item.quantidade_un) : "",
          pesoKg: item?.peso_total_kg !== null && item?.peso_total_kg !== undefined ? String(item.peso_total_kg) : "",
        };
      });
      for (const item of leitura.itens) {
        if (!produtos.some((p) => p.nome.trim().toLowerCase() === item.produto_nome.trim().toLowerCase())) {
          semMatch.push(`produto "${item.produto_nome}"`);
        }
      }

      setLinhas(editaveis);
      setNaoReconhecidos(semMatch);
      // data_despesca lida é só um lembrete visual — a despesca de verdade
      // é escolhida no seletor, cruzando com o que já existe no lote
      setLido(true);
    } catch {
      setErroLeitura("Não foi possível ler a foto. Tente tirar de novo, com mais luz e a ficha bem esticada.");
    } finally {
      setLendo(false);
    }
  }

  function mudarLinha(produtoId: number, campo: keyof LinhaEditavel, valor: string) {
    setLinhas((ls) => ls.map((l) => (l.produtoId === produtoId ? { ...l, [campo]: valor } : l)));
  }

  const linhasComValor = linhas.filter((l) => l.caixas || l.soltos || l.quantidadeUn || l.pesoKg);
  const podeSalvar = lido && linhasComValor.length > 0 && !enviando;

  async function confirmarLancamento() {
    setEnviando(true);
    try {
      let n = 0;
      for (const l of linhas) {
        const produto = produtos.find((p) => p.id === l.produtoId);
        if (!produto) continue;
        const porCaixa = unidadesPorCaixa(produto.nome);
        let quantidadeEmbalagens: number | null = null;
        let quantidadeKg: number | null = null;

        if (porCaixa !== null) {
          const caixas = parseFloat(l.caixas.replace(",", ".")) || 0;
          const soltos = parseFloat(l.soltos.replace(",", ".")) || 0;
          const total = caixas * porCaixa + soltos;
          if (total <= 0) continue;
          quantidadeEmbalagens = total;
        } else {
          const un = parseFloat(l.quantidadeUn.replace(",", ".")) || 0;
          const kg = parseFloat(l.pesoKg.replace(",", ".")) || 0;
          if (kg <= 0) continue;
          quantidadeEmbalagens = un > 0 ? un : null;
          quantidadeKg = kg;
        }

        await enfileirar("producao", {
          data,
          produto_id: produto.id,
          quantidade_embalagens: quantidadeEmbalagens,
          quantidade_kg: produto.kg_digitado ? quantidadeKg : 0,
          lote_id: lote?.id ?? null,
          data_despesca: despescas.find((d) => d.id === despescaId)?.data ?? null,
        });
        n++;
      }
      setToast(`${n} lançamentos de produção registrados`);
      setLido(false);
      setLinhas([]);
      setNaoReconhecidos([]);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/lancar/producao")}>
          ←
        </button>
        <div>
          <h1>Produção por foto da ficha</h1>
          <div className={styles.sub}>Tire a foto, confira os valores e confirme</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        {!lido && (
          <div className={styles.field}>
            <label>Foto da ficha preenchida</label>
            <input
              className={styles.inp}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void aoEscolherFoto(arquivo);
              }}
            />
            {lendo && <p className={styles.hint}>Lendo a ficha…</p>}
            {erroLeitura && <div className={styles.error}>{erroLeitura}</div>}
          </div>
        )}

        {lido && (
          <>
            <p className={styles.hint} style={{ fontWeight: 700, color: "var(--brand-deep)" }}>
              Confira os valores lidos antes de confirmar — corrija o que estiver errado.
            </p>

            <div className={styles.field}>
              <label>Data</label>
              <input className={styles.inp} type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>

            <div className={styles.field}>
              <label>Tanque de origem</label>
              <select
                className={styles.inp}
                value={viveiroId ?? ""}
                onChange={(e) => setViveiroId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— selecione —</option>
                {viveiros.map((v) => (
                  <option key={v.id} value={v.id}>Viveiro {v.codigo} — lote {v.lote_atual!.codigo}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label>Despesca de origem</label>
              <select
                className={styles.inp}
                value={despescaId ?? ""}
                disabled={despescas.length === 0}
                onChange={(e) => setDespescaId(Number(e.target.value))}
              >
                {despescas.length === 0 && <option>Nenhuma despesca lançada para este lote</option>}
                {despescas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR")} — {d.peso_total_kg.toFixed(1)} Kg
                  </option>
                ))}
              </select>
            </div>

            {naoReconhecidos.length > 0 && (
              <div className={styles.error}>
                Não reconheci: {naoReconhecidos.join(", ")}. Confira/preencha na mão o que precisar.
              </div>
            )}

            <div className={tabelaStyles.tableWrap} style={{ overflowX: "auto", marginBottom: 16 }}>
              <table className={tabelaStyles.tabela}>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Caixas fechadas</th>
                    <th>Pacotes soltos</th>
                    <th>Quantidade (un)</th>
                    <th>Peso total (Kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const porCaixa = unidadesPorCaixa(l.produtoNome);
                    return (
                      <tr key={l.produtoId}>
                        <td style={{ fontWeight: 700 }}>{l.produtoNome}</td>
                        {porCaixa !== null ? (
                          <>
                            <td>
                              <input
                                className={styles.inp} style={{ width: 70, padding: "6px 4px", textAlign: "center" }}
                                type="text" inputMode="decimal" value={l.caixas}
                                onChange={(e) => mudarLinha(l.produtoId, "caixas", e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className={styles.inp} style={{ width: 70, padding: "6px 4px", textAlign: "center" }}
                                type="text" inputMode="decimal" value={l.soltos}
                                onChange={(e) => mudarLinha(l.produtoId, "soltos", e.target.value)}
                              />
                            </td>
                            <td>—</td>
                            <td>—</td>
                          </>
                        ) : (
                          <>
                            <td>—</td>
                            <td>—</td>
                            <td>
                              <input
                                className={styles.inp} style={{ width: 80, padding: "6px 4px", textAlign: "center" }}
                                type="text" inputMode="decimal" value={l.quantidadeUn}
                                onChange={(e) => mudarLinha(l.produtoId, "quantidadeUn", e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                className={styles.inp} style={{ width: 80, padding: "6px 4px", textAlign: "center" }}
                                type="text" inputMode="decimal" value={l.pesoKg}
                                onChange={(e) => mudarLinha(l.produtoId, "pesoKg", e.target.value)}
                              />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              style={{
                background: "none", border: "none", padding: 0,
                color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
              }}
              onClick={() => { setLido(false); setLinhas([]); setNaoReconhecidos([]); }}
            >
              Tirar outra foto
            </button>
          </>
        )}
      </div>

      {lido && (
        <div className={styles.savebar}>
          <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={confirmarLancamento}>
            {enviando ? "Lançando…" : `Confirmar e lançar (${linhasComValor.length})`}
          </button>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

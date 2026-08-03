"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listarProdutos, type Produto } from "@/lib/api";
import styles from "../painel.module.css";
import ficha from "../ficha.module.css";

function unidadesPorCaixa(nome: string): number | null {
  if (nome.startsWith("Filé")) return 8;
  if (nome.startsWith("Postas")) return 6;
  return null; // Tilápia limpa (e qualquer outro) — anotado individualmente
}

// Ordem de impressão pedida: filé 400g, 500g, 1kg, depois postas — o
// resto (ex.: Tilápia limpa) mantém a ordem que já veio da API, no fim.
const _ORDEM_IMPRESSAO = ["400g", "500g", "1kg", "Postas"];

function ordenarParaImpressao(produtos: Produto[]): Produto[] {
  return [...produtos].sort((a, b) => {
    const ia = _ORDEM_IMPRESSAO.findIndex((chave) => a.nome.includes(chave));
    const ib = _ORDEM_IMPRESSAO.findIndex((chave) => b.nome.includes(chave));
    return (ia === -1 ? _ORDEM_IMPRESSAO.length : ia) - (ib === -1 ? _ORDEM_IMPRESSAO.length : ib);
  });
}

const TOTAL_QUADRADOS = 240; // 12 colunas x 20 linhas — cabe numa página A4

export default function FichaProducao() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  useEffect(() => {
    // "Tilápia suja" não passa por Produção — sai direto da despesca pra
    // venda, sem processamento/embalagem no frigorífico
    listarProdutos()
      .then((ps) => {
        const filtrados = ordenarParaImpressao(ps.filter((p) => !p.nome.toLowerCase().includes("suja")));
        setProdutos(filtrados);
        setSelecionados(new Set(filtrados.map((p) => p.id)));
      })
      .catch(() => setErro("Sem conexão e sem dados salvos deste aparelho ainda."));
  }, []);

  const paraImprimir = useMemo(
    () => produtos.filter((p) => selecionados.has(p.id)),
    [produtos, selecionados]
  );

  function alternar(id: number) {
    setSelecionados((s) => {
      const nova = new Set(s);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Ficha de produção realizada</h1>
          <div className={styles.sub}>Para imprimir, preencher à mão e fotografar depois</div>
        </div>
        <div className={styles.spacer} />
        <button type="button" className={styles.printBtn} disabled={paraImprimir.length === 0} onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {produtos.length === 0 && !erro && <div className={styles.carregando}>Carregando…</div>}

        {produtos.length > 0 && (
          <>
            <div className={ficha.selecaoProdutos}>
              <strong style={{ fontSize: "0.86rem" }}>Imprimir:</strong>
              {produtos.map((p) => (
                <label key={p.id} className={ficha.checkProduto}>
                  <input
                    type="checkbox"
                    checked={selecionados.has(p.id)}
                    onChange={() => alternar(p.id)}
                  />
                  {p.nome}
                </label>
              ))}
              <button type="button" className={ficha.linkSelecao} onClick={() => setSelecionados(new Set(produtos.map((p) => p.id)))}>
                Todos
              </button>
              <button type="button" className={ficha.linkSelecao} onClick={() => setSelecionados(new Set())}>
                Nenhum
              </button>
            </div>

            {paraImprimir.length === 0 && (
              <p className={styles.hint}>Selecione ao menos um produto pra ver a ficha.</p>
            )}

            {paraImprimir.map((p) => {
              const porCaixa = unidadesPorCaixa(p.nome);
              return (
                <div key={p.id} className={`${ficha.folha} ${ficha.folhaQuebra}`}>
                  <div className={ficha.cabecalho}>
                    Rio Vita — Ficha de Produção Realizada
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, marginTop: 4 }}>{p.nome}</div>
                  </div>

                  <div className={ficha.camposTopo}>
                    <div className={ficha.campoTopo}>
                      <span>Data</span>
                      <span className={ficha.linhaPreencher}>____ / ____ / ________</span>
                    </div>
                    <div className={ficha.campoTopo}>
                      <span>Tanque de origem</span>
                      <span className={ficha.linhaPreencher}>_____________</span>
                    </div>
                    <div className={ficha.campoTopo}>
                      <span>Data da despesca</span>
                      <span className={ficha.linhaPreencher}>____ / ____ / ________</span>
                    </div>
                  </div>

                  {porCaixa !== null ? (
                    <>
                      <p className={ficha.instrucao}>
                        Caixas de <strong>{porCaixa} pacotes</strong> — confirme se está certo. A cada caixa fechada,
                        marque um <strong>X</strong> no próximo quadrado. Se a caixa ficar incompleta (comum no fim
                        do turno), <strong>não marque X</strong> — escreva no quadrado o número de pacotes que tem
                        nela.
                      </p>
                      <div className={ficha.grade}>
                        {Array.from({ length: TOTAL_QUADRADOS }, (_, i) => (
                          <span key={i} className={ficha.marca} data-n={i + 1}></span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={ficha.instrucao}>Anotado individualmente (unidades) + peso total.</p>
                      <div className={ficha.linhasContagem}>
                        <div className={ficha.contagemItem}>
                          <label>Quantidade (un)</label>
                          <span className={ficha.caixaResposta} style={{ width: 160 }}></span>
                        </div>
                        <div className={ficha.contagemItem}>
                          <label>Peso total (Kg)</label>
                          <span className={ficha.caixaResposta} style={{ width: 160 }}></span>
                        </div>
                      </div>
                    </>
                  )}

                  <div className={ficha.rodape}>
                    <div>
                      <span>Preenchido por (produção/frigorífico)</span>
                      <span className={ficha.linhaAssinatura}></span>
                    </div>
                    <div>
                      <span>Conferido por (quem lança no sistema)</span>
                      <span className={ficha.linhaAssinatura}></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

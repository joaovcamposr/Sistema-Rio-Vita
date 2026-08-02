"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarProdutos, type Produto } from "@/lib/api";
import styles from "../painel.module.css";
import ficha from "../ficha.module.css";

function unidadesPorCaixa(nome: string): number | null {
  if (nome.startsWith("Filé")) return 8;
  if (nome.startsWith("Postas")) return 6;
  return null; // Tilápia limpa (e qualquer outro) — anotado individualmente
}

export default function FichaProducao() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // "Tilápia suja" não passa por Produção — sai direto da despesca pra
    // venda, sem processamento/embalagem no frigorífico
    listarProdutos()
      .then((ps) => setProdutos(ps.filter((p) => !p.nome.toLowerCase().includes("suja"))))
      .catch(() => setErro("Sem conexão e sem dados salvos deste aparelho ainda."));
  }, []);

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
        <button type="button" className={styles.printBtn} onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {produtos.length === 0 && !erro && <div className={styles.carregando}>Carregando…</div>}

        {produtos.length > 0 && (
          <div className={ficha.folha}>
            <div className={ficha.cabecalho}>Rio Vita — Ficha de Produção Realizada</div>

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

            <p className={ficha.instrucao}>
              Uma ficha por despesca/tanque. A cada caixa fechada, marque um X no próximo quadradinho. No fim do
              turno, escreva o total de caixas fechadas e, se sobrar produto sem fechar uma caixa, o número de
              pacotes soltos ao lado.
            </p>

            {produtos.map((p) => {
              const porCaixa = unidadesPorCaixa(p.nome);
              return (
                <div key={p.id} className={ficha.secaoProduto}>
                  <div className={ficha.tituloProduto}>{p.nome}</div>
                  {porCaixa !== null ? (
                    <>
                      <div className={ficha.regraProduto}>
                        Caixas de <strong>{porCaixa} pacotes</strong> — confirmar se está certo
                      </div>
                      <div className={ficha.marcarCaixas}>
                        <label style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                          Caixas fechadas — marque um X a cada caixa
                        </label>
                        <div className={ficha.grade}>
                          {Array.from({ length: 60 }, (_, i) => (
                            <span key={i} className={ficha.marca} data-n={i + 1}></span>
                          ))}
                        </div>
                        <div className={ficha.totalEscrito}>
                          <span>Total de caixas fechadas</span>
                          <span className={ficha.caixaResposta} style={{ width: 70, height: 34 }}></span>
                        </div>
                      </div>
                      <div className={ficha.linhasContagem} style={{ marginTop: 10 }}>
                        <div className={ficha.contagemItem}>
                          <label>Pacotes soltos (caixa incompleta)</label>
                          <span className={ficha.caixaResposta}></span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={ficha.regraProduto}>Anotado individualmente (unidades) + peso total</div>
                      <div className={ficha.linhasContagem}>
                        <div className={ficha.contagemItem}>
                          <label>Quantidade (un)</label>
                          <span className={ficha.caixaResposta} style={{ width: 120 }}></span>
                        </div>
                        <div className={ficha.contagemItem}>
                          <label>Peso total (Kg)</label>
                          <span className={ficha.caixaResposta} style={{ width: 120 }}></span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

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
        )}
      </div>
    </div>
  );
}

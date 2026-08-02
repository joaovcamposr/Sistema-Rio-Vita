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
              Uma ficha por despesca/tanque. Preencha o número de caixas fechadas e, se sobrar produto sem fechar
              uma caixa (comum no fim do turno), o número de pacotes soltos ao lado.
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
                      <div className={ficha.linhasContagem}>
                        <div className={ficha.contagemItem}>
                          <label>Caixas fechadas</label>
                          <span className={ficha.caixaResposta}></span>
                        </div>
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

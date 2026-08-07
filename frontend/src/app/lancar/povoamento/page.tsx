"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { editarPovoamento, encerrarLote, listarViveiros, type Viveiro } from "@/lib/api";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarPovoamento() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [viveiroId, setViveiroId] = useState<number | null>(null);
  const [data, setData] = useState(hojeISO());
  const [quantidade, setQuantidade] = useState("");
  const [pesoMedio, setPesoMedio] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [viveirosZerados, setViveirosZerados] = useState<Viveiro[]>([]);
  const [viveirosAtivos, setViveirosAtivos] = useState<Viveiro[]>([]);
  const [encerrandoId, setEncerrandoId] = useState<number | null>(null);
  const [viveiroEncerrarId, setViveiroEncerrarId] = useState<number | null>(null);
  const [encerrandoComSaldo, setEncerrandoComSaldo] = useState(false);
  const [viveiroEditarId, setViveiroEditarId] = useState<number | null>(null);
  const [formEdicao, setFormEdicao] = useState<{
    dataInicio: string; quantidadeInicial: string; pesoMedioInicial: string;
  } | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  function carregarViveiros(manterSelecoes: boolean) {
    return listarViveiros()
      .then((lista) => {
        const vazios = lista.filter((v) => v.lote_atual === null && v.tipo !== "decantacao");
        setViveiros(vazios);
        if (!manterSelecoes && vazios.length > 0) setViveiroId(vazios[0].id);
        // lote já esvaziado (saldo zero ou negativo por mortalidade não
        // lançada) mas ainda "aberto" — trava o viveiro pro povoamento
        setViveirosZerados(lista.filter((v) => v.lote_atual !== null && v.lote_atual.saldo_un <= 0));
        // todo lote em aberto — pra permitir encerrar de propósito mesmo
        // com saldo de peixes ainda de pé (vira mortalidade da fase)
        const ativos = lista.filter((v) => v.lote_atual !== null);
        setViveirosAtivos(ativos);
        if (!manterSelecoes && ativos.length > 0) setViveiroEncerrarId(ativos[0].id);
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }

  useEffect(() => {
    carregarViveiros(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function encerrar(v: Viveiro) {
    if (!v.lote_atual) return;
    setEncerrandoId(v.id);
    try {
      await encerrarLote(v.lote_atual.id, hojeISO());
      setViveirosZerados((vs) => vs.filter((x) => x.id !== v.id));
      setViveirosAtivos((vs) => vs.filter((x) => x.id !== v.id));
      setViveiros((vs) => (vs.some((x) => x.id === v.id) ? vs : [...vs, { ...v, lote_atual: null }]));
      setToast(`Lote do viveiro ${v.codigo} encerrado`);
      setTimeout(() => setToast(null), 2200);
    } catch {
      setToast("Não foi possível encerrar — confira a conexão");
      setTimeout(() => setToast(null), 2200);
    } finally {
      setEncerrandoId(null);
    }
  }

  const viveiroEncerrar = viveirosAtivos.find((v) => v.id === viveiroEncerrarId) ?? null;

  async function encerrarComSaldo() {
    const v = viveiroEncerrar;
    if (!v?.lote_atual) return;
    const saldo = v.lote_atual.saldo_un;
    const confirmar = window.confirm(
      `Confirma encerrar o lote ${v.lote_atual.codigo} do viveiro ${v.codigo} com ${saldo.toLocaleString("pt-BR")} ` +
      `peixes ainda no saldo?\n\nEsses ${saldo.toLocaleString("pt-BR")} peixes vão entrar como mortalidade da fase ` +
      `(povoamento inicial menos esse saldo). Essa ação não pode ser desfeita.`
    );
    if (!confirmar) return;
    setEncerrandoComSaldo(true);
    try {
      await encerrarLote(
        v.lote_atual.id, hojeISO(),
        `Encerrado com saldo de ${saldo.toLocaleString("pt-BR")} peixes ainda de pé, em ${hojeISO()} — considerado mortalidade da fase.`
      );
      setViveirosAtivos((vs) => vs.filter((x) => x.id !== v.id));
      setViveirosZerados((vs) => vs.filter((x) => x.id !== v.id));
      setViveiros((vs) => (vs.some((x) => x.id === v.id) ? vs : [...vs, { ...v, lote_atual: null }]));
      setToast(`Lote do viveiro ${v.codigo} encerrado — ${saldo.toLocaleString("pt-BR")} peixes contabilizados como mortalidade`);
      setTimeout(() => setToast(null), 3200);
    } catch {
      setToast("Não foi possível encerrar — confira a conexão");
      setTimeout(() => setToast(null), 2200);
    } finally {
      setEncerrandoComSaldo(false);
    }
  }

  function iniciarEdicaoPovoamento(id: number | "") {
    if (id === "") {
      setViveiroEditarId(null);
      setFormEdicao(null);
      return;
    }
    const v = viveirosAtivos.find((vv) => vv.id === id);
    if (!v?.lote_atual) return;
    setViveiroEditarId(id);
    setFormEdicao({
      dataInicio: v.lote_atual.data_inicio,
      quantidadeInicial: String(v.lote_atual.quantidade_inicial),
      pesoMedioInicial: String(v.lote_atual.peso_medio_inicial_g).replace(".", ","),
    });
  }

  async function salvarEdicaoPovoamento() {
    const v = viveirosAtivos.find((vv) => vv.id === viveiroEditarId);
    if (!v?.lote_atual || !formEdicao) return;
    const qtd = Math.round(parseFloat(formEdicao.quantidadeInicial.replace(",", ".")) || 0);
    const peso = parseFloat(formEdicao.pesoMedioInicial.replace(",", ".")) || 0;
    if (qtd <= 0 || peso <= 0) return;
    setSalvandoEdicao(true);
    try {
      await editarPovoamento(
        v.lote_atual.id, formEdicao.dataInicio, qtd, peso,
        `Povoamento inicial corrigido em ${hojeISO()} (era ${v.lote_atual.quantidade_inicial} peixes, ${v.lote_atual.peso_medio_inicial_g}g).`
      );
      setToast(`Povoamento do lote ${v.lote_atual.codigo} corrigido`);
      setViveiroEditarId(null);
      setFormEdicao(null);
      // recarrega do servidor em vez de só remendar o estado local — o
      // saldo (quantidade de peixes no tanque) é calculado a partir da
      // quantidade inicial, então precisa vir recalculado de verdade
      await carregarViveiros(true);
      setTimeout(() => setToast(null), 3200);
    } catch {
      setToast("Não foi possível salvar a correção — confira os valores e a conexão");
      setTimeout(() => setToast(null), 3200);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  const viveiro = viveiros.find((v) => v.id === viveiroId) ?? null;
  const qtdNum = parseFloat(quantidade.replace(",", ".")) || 0;
  const pesoNum = parseFloat(pesoMedio.replace(",", ".")) || 0;
  const podeSalvar = viveiro !== null && qtdNum > 0 && pesoNum > 0 && !enviando;

  async function salvar() {
    if (!viveiro) return;
    setEnviando(true);
    try {
      await enfileirar("povoamento", {
        viveiro_id: viveiro.id,
        data,
        quantidade_inicial: Math.round(qtdNum),
        peso_medio_inicial_g: pesoNum,
        observacao: observacao || null,
      });
      setToast("Povoamento registrado");
      setQuantidade("");
      setPesoMedio("");
      setObservacao("");
      setViveiros((vs) => vs.filter((v) => v.id !== viveiro.id));
      setTimeout(() => setToast(null), 2200);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Registrar povoamento</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}
        <p className={styles.hint}>Só aparecem viveiros vazios. O código do lote é gerado automaticamente.</p>

        {viveirosZerados.length > 0 && (
          <div className={styles.note} style={{ marginBottom: 18 }}>
            <strong>Viveiros zerados aguardando fechamento do lote:</strong>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {viveirosZerados.map((v) => (
                <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Viveiro {v.codigo} — saldo {v.lote_atual!.saldo_un.toLocaleString("pt-BR")}</span>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                    disabled={encerrandoId === v.id}
                    onClick={() => encerrar(v)}
                  >
                    {encerrandoId === v.id ? "Encerrando…" : "Encerrar lote"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {viveirosAtivos.length > 0 && (
          <div className={styles.note} style={{ marginBottom: 18 }}>
            <strong>Encerrar lote com peixes ainda no tanque (mortalidade)</strong>
            <p className={styles.hint} style={{ margin: "4px 0 10px" }}>
              Pra quando o lote precisa ser fechado mesmo sem o tanque ter zerado — o saldo que sobrar entra como
              mortalidade da fase (povoamento inicial menos esse saldo).
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                className={styles.inp}
                style={{ flex: 1, minWidth: 220 }}
                value={viveiroEncerrarId ?? ""}
                onChange={(e) => setViveiroEncerrarId(Number(e.target.value))}
              >
                {viveirosAtivos.map((v) => (
                  <option key={v.id} value={v.id}>
                    Viveiro {v.codigo} — lote {v.lote_atual!.codigo} — saldo {v.lote_atual!.saldo_un.toLocaleString("pt-BR")}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.btnPrimary}
                style={{ padding: "9px 14px", fontSize: "0.85rem" }}
                disabled={encerrandoComSaldo || !viveiroEncerrar}
                onClick={encerrarComSaldo}
              >
                {encerrandoComSaldo ? "Encerrando…" : "Encerrar e registrar mortalidade"}
              </button>
            </div>
          </div>
        )}

        {viveirosAtivos.length > 0 && (
          <div className={styles.note} style={{ marginBottom: 18 }}>
            <strong>Corrigir povoamento inicial</strong>
            <p className={styles.hint} style={{ margin: "4px 0 10px" }}>
              Pra quando um erro em outro lançamento (ex.: repicagem feita errada) deixou a quantidade ou o peso
              inicial do lote errado, e não tem outro jeito de acertar o saldo do tanque a não ser corrigindo aqui.
            </p>
            <div className={styles.field} style={{ margin: "0 0 10px" }}>
              <select
                className={styles.inp}
                value={viveiroEditarId ?? ""}
                onChange={(e) => iniciarEdicaoPovoamento(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Selecione um viveiro para corrigir</option>
                {viveirosAtivos.map((v) => (
                  <option key={v.id} value={v.id}>
                    Viveiro {v.codigo} — lote {v.lote_atual!.codigo} — hoje: {v.lote_atual!.quantidade_inicial.toLocaleString("pt-BR")} peixes,{" "}
                    {v.lote_atual!.peso_medio_inicial_g}g, início {v.lote_atual!.data_inicio.split("-").reverse().join("/")}
                  </option>
                ))}
              </select>
            </div>

            {viveiroEditarId !== null && formEdicao && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Data de início</label>
                  <input
                    className={styles.inp} type="date" value={formEdicao.dataInicio}
                    onChange={(e) => setFormEdicao({ ...formEdicao, dataInicio: e.target.value })}
                  />
                </div>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Quantidade inicial (peixes)</label>
                  <input
                    className={`${styles.inp} ${styles.num}`} type="text" inputMode="numeric" style={{ width: 120 }}
                    value={formEdicao.quantidadeInicial}
                    onChange={(e) => setFormEdicao({ ...formEdicao, quantidadeInicial: e.target.value })}
                  />
                </div>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Peso médio inicial (g)</label>
                  <input
                    className={`${styles.inp} ${styles.num}`} type="text" inputMode="decimal" style={{ width: 100 }}
                    value={formEdicao.pesoMedioInicial}
                    onChange={(e) => setFormEdicao({ ...formEdicao, pesoMedioInicial: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  style={{ padding: "9px 14px", fontSize: "0.85rem" }}
                  disabled={salvandoEdicao}
                  onClick={salvarEdicaoPovoamento}
                >
                  {salvandoEdicao ? "Salvando…" : "Salvar correção"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className={styles.field}>
          <label>Data</label>
          <input className={styles.inp} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label>Viveiro</label>
          <select
            className={styles.inp}
            value={viveiroId ?? ""}
            disabled={viveiros.length === 0}
            onChange={(e) => setViveiroId(Number(e.target.value))}
          >
            {viveiros.length === 0 && <option>Nenhum viveiro vazio disponível</option>}
            {viveiros.map((v) => (
              <option key={v.id} value={v.id}>
                Viveiro {v.codigo} ({v.tipo === "pre_engorda" ? "pré-engorda" : "engorda"})
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label>Quantidade (peixes)</label>
          <input
            className={`${styles.inp} ${styles.num}`}
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Peso médio (g)</label>
          <input
            className={`${styles.inp} ${styles.num}`}
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={pesoMedio}
            onChange={(e) => setPesoMedio(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Observação (opcional)</label>
          <input
            className={styles.inp}
            type="text"
            placeholder=""
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar povoamento"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

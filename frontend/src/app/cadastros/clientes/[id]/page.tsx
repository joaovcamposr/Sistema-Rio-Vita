"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  atualizarCliente,
  criarInteracao,
  definirPrecoCliente,
  editarInteracao,
  excluirCliente,
  excluirInteracao,
  listarInteracoes,
  listarPrecosCliente,
  listarVendedores,
  obterCliente,
  restaurarInteracao,
  type ClienteDetalhe,
  type ClienteProdutoPreco,
  type InteracaoCliente,
  type Vendedor,
} from "@/lib/cadastros";
import styles from "../../cadastros.module.css";

export const FASES = ["Prospecção", "Negociação", "Cliente ativo", "Inativo"];
export const TEMPERATURAS = ["Frio", "Morno", "Quente"];
export const TIPOS_INTERACAO = ["Ligação", "Visita", "WhatsApp", "E-mail", "Outro"];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function EditarCliente() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clienteId = Number(params.id);

  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null);
  const [precos, setPrecos] = useState<ClienteProdutoPreco[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [precoEditando, setPrecoEditando] = useState<Record<number, string>>({});

  const [interacoes, setInteracoes] = useState<InteracaoCliente[] | null>(null);
  const [novaData, setNovaData] = useState(hojeISO());
  const [novoTipo, setNovoTipo] = useState(TIPOS_INTERACAO[0]);
  const [novoVendedorId, setNovoVendedorId] = useState<number | null>(null);
  const [novaDescricao, setNovaDescricao] = useState("");
  const [registrandoInteracao, setRegistrandoInteracao] = useState(false);
  const [editandoInteracaoId, setEditandoInteracaoId] = useState<number | null>(null);
  const [formEdicao, setFormEdicao] = useState<{ data: string; tipo: string; descricao: string; vendedor_id: number | null } | null>(null);
  const [processandoInteracaoId, setProcessandoInteracaoId] = useState<number | null>(null);
  const [mostrarExcluidasInteracoes, setMostrarExcluidasInteracoes] = useState(false);

  function carregarInteracoes(excluidos = mostrarExcluidasInteracoes) {
    listarInteracoes(clienteId, excluidos).then(setInteracoes).catch(() => undefined);
  }

  useEffect(() => {
    Promise.all([obterCliente(clienteId), listarPrecosCliente(clienteId), listarVendedores()])
      .then(([c, ps, vs]) => {
        setCliente(c);
        setPrecos(ps);
        setVendedores(vs);
        setPrecoEditando(Object.fromEntries(ps.map((p) => [p.produto_id, p.preco > 0 ? String(p.preco) : ""])));
      })
      .catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  useEffect(() => {
    carregarInteracoes(mostrarExcluidasInteracoes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, mostrarExcluidasInteracoes]);

  async function registrarInteracao() {
    if (!novaDescricao.trim()) return;
    setRegistrandoInteracao(true);
    try {
      await criarInteracao({
        cliente_id: clienteId, data: novaData, tipo: novoTipo,
        descricao: novaDescricao.trim(), vendedor_id: novoVendedorId,
      });
      setNovaDescricao("");
      carregarInteracoes();
      setToast("Interação registrada");
      setTimeout(() => setToast(null), 2000);
    } catch {
      setErro("Não foi possível registrar — verifique a conexão.");
    } finally {
      setRegistrandoInteracao(false);
    }
  }

  function iniciarEdicaoInteracao(i: InteracaoCliente) {
    setEditandoInteracaoId(i.id);
    setFormEdicao({ data: i.data, tipo: i.tipo, descricao: i.descricao, vendedor_id: i.vendedor_id });
  }

  async function salvarEdicaoInteracao(id: number) {
    if (!formEdicao) return;
    setProcessandoInteracaoId(id);
    try {
      await editarInteracao(id, formEdicao);
      setEditandoInteracaoId(null);
      setFormEdicao(null);
      carregarInteracoes();
    } catch {
      setToast("Não foi possível salvar — confira a conexão");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProcessandoInteracaoId(null);
    }
  }

  async function excluirInteracaoClick(i: InteracaoCliente) {
    if (!window.confirm("Excluir essa interação? Pode ser restaurada depois.")) return;
    setProcessandoInteracaoId(i.id);
    try {
      await excluirInteracao(i.id);
      carregarInteracoes();
    } catch {
      setToast("Não foi possível excluir");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProcessandoInteracaoId(null);
    }
  }

  async function restaurarInteracaoClick(i: InteracaoCliente) {
    setProcessandoInteracaoId(i.id);
    try {
      await restaurarInteracao(i.id);
      carregarInteracoes();
    } catch {
      setToast("Não foi possível restaurar");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProcessandoInteracaoId(null);
    }
  }

  function atualizarCampo<K extends keyof ClienteDetalhe>(campo: K, valor: ClienteDetalhe[K]) {
    setCliente((c) => (c ? { ...c, [campo]: valor } : c));
  }

  async function salvarCadastro() {
    if (!cliente) return;
    setSalvando(true);
    try {
      const atualizado = await atualizarCliente(clienteId, {
        nome: cliente.nome, cnpj: cliente.cnpj, contato: cliente.contato, cidade: cliente.cidade,
        prazo_dias: cliente.prazo_dias, emite_nf: cliente.emite_nf, emite_boleto: cliente.emite_boleto,
        vendedor_id: cliente.vendedor_id, vendedor_nome: cliente.vendedor_nome,
        nome_contato: cliente.nome_contato, endereco: cliente.endereco, ramo: cliente.ramo,
        priorizacao: cliente.priorizacao, e_cliente: cliente.e_cliente, fase: cliente.fase,
        temperatura: cliente.temperatura, motivo: cliente.motivo, proxima_acao: cliente.proxima_acao,
        fornecedor_atual: cliente.fornecedor_atual, preco_concorrente: cliente.preco_concorrente,
        preferencia_tamanho: cliente.preferencia_tamanho, fresco_congelado: cliente.fresco_congelado,
        observacoes: cliente.observacoes,
      });
      setCliente(atualizado);
      setToast("Cadastro atualizado");
      setTimeout(() => setToast(null), 2200);
    } catch {
      setErro("Não foi possível salvar — verifique a conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!cliente) return;
    if (!window.confirm(`Excluir ${cliente.nome}? Vendas já feitas para ele continuam no histórico.`)) return;
    try {
      await excluirCliente(clienteId);
      router.push("/cadastros/clientes");
    } catch {
      setErro("Não foi possível excluir — verifique a conexão.");
    }
  }

  async function salvarPreco(produtoId: number) {
    const valor = parseFloat((precoEditando[produtoId] ?? "").replace(",", "."));
    if (!(valor >= 0)) return;
    try {
      const novos = await definirPrecoCliente(clienteId, produtoId, valor);
      setPrecos(novos);
      setToast("Preço atualizado");
      setTimeout(() => setToast(null), 1800);
    } catch {
      setErro("Não foi possível salvar o preço — verifique a conexão.");
    }
  }

  if (erro) {
    return (
      <div className={styles.page}>
        <div className={styles.appbar}>
          <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/cadastros/clientes")}>←</button>
          <div><h1>Cliente</h1></div>
        </div>
        <div className={styles.body}><div className={styles.error}>{erro}</div></div>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className={styles.page}>
        <div className={styles.body}><p className={styles.hint}>Carregando…</p></div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/cadastros/clientes")}>
          ←
        </button>
        <div>
          <h1>{cliente.nome}</h1>
        </div>
      </div>
      <div className={styles.body}>
        <p className={styles.section}>Cadastro</p>
        <div className={styles.field}>
          <label>Nome</label>
          <input className={styles.inp} value={cliente.nome} onChange={(e) => atualizarCampo("nome", e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>CNPJ</label>
          <input className={styles.inp} value={cliente.cnpj ?? ""} onChange={(e) => atualizarCampo("cnpj", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Contato</label>
          <input className={styles.inp} value={cliente.contato ?? ""} onChange={(e) => atualizarCampo("contato", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Cidade</label>
          <input className={styles.inp} value={cliente.cidade ?? ""} onChange={(e) => atualizarCampo("cidade", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Prazo (dias)</label>
          <input
            className={styles.inp} type="number" inputMode="numeric"
            value={cliente.prazo_dias ?? ""}
            onChange={(e) => atualizarCampo("prazo_dias", e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className={styles.field}>
          <label>Vendedor</label>
          <select
            className={styles.inp}
            value={cliente.vendedor_id ?? ""}
            onChange={(e) => atualizarCampo("vendedor_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sem vendedor definido</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </div>
        <div className={styles.checkRow}>
          <input type="checkbox" id="nf" checked={cliente.emite_nf} onChange={(e) => atualizarCampo("emite_nf", e.target.checked)} />
          <label htmlFor="nf">Emite NF</label>
        </div>
        <div className={styles.checkRow}>
          <input type="checkbox" id="boleto" checked={cliente.emite_boleto} onChange={(e) => atualizarCampo("emite_boleto", e.target.checked)} />
          <label htmlFor="boleto">Emite boleto</label>
        </div>

        <p className={styles.section}>CRM</p>
        <div className={styles.checkRow}>
          <input
            type="checkbox" id="e_cliente" checked={cliente.e_cliente}
            onChange={(e) => atualizarCampo("e_cliente", e.target.checked)}
          />
          <label htmlFor="e_cliente">É cliente (desmarcado = ainda é só prospecção)</label>
        </div>
        <div className={styles.field}>
          <label>Fase</label>
          <select className={styles.inp} value={cliente.fase ?? ""} onChange={(e) => atualizarCampo("fase", e.target.value || null)}>
            <option value="">—</option>
            {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label>Temperatura</label>
          <select className={styles.inp} value={cliente.temperatura ?? ""} onChange={(e) => atualizarCampo("temperatura", e.target.value || null)}>
            <option value="">—</option>
            {TEMPERATURAS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label>Prioridade (1 = mais alta, opcional)</label>
          <input
            className={styles.inp} type="number" inputMode="numeric" style={{ maxWidth: 120 }}
            value={cliente.priorizacao ?? ""}
            onChange={(e) => atualizarCampo("priorizacao", e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className={styles.field}>
          <label>Nome do contato</label>
          <input className={styles.inp} value={cliente.nome_contato ?? ""} onChange={(e) => atualizarCampo("nome_contato", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Endereço</label>
          <input className={styles.inp} value={cliente.endereco ?? ""} onChange={(e) => atualizarCampo("endereco", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Ramo</label>
          <input className={styles.inp} value={cliente.ramo ?? ""} onChange={(e) => atualizarCampo("ramo", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Motivo (da fase/temperatura atual)</label>
          <input className={styles.inp} value={cliente.motivo ?? ""} onChange={(e) => atualizarCampo("motivo", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Próxima ação</label>
          <input className={styles.inp} value={cliente.proxima_acao ?? ""} onChange={(e) => atualizarCampo("proxima_acao", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Fornecedor atual (concorrência)</label>
          <input className={styles.inp} value={cliente.fornecedor_atual ?? ""} onChange={(e) => atualizarCampo("fornecedor_atual", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Preço do concorrente (R$/Kg)</label>
          <input
            className={styles.inp} type="number" inputMode="decimal" style={{ maxWidth: 140 }}
            value={cliente.preco_concorrente ?? ""}
            onChange={(e) => atualizarCampo("preco_concorrente", e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className={styles.field}>
          <label>Preferência de tamanho</label>
          <input className={styles.inp} value={cliente.preferencia_tamanho ?? ""} onChange={(e) => atualizarCampo("preferencia_tamanho", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Fresco ou congelado</label>
          <input className={styles.inp} value={cliente.fresco_congelado ?? ""} onChange={(e) => atualizarCampo("fresco_congelado", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Observações</label>
          <textarea
            className={styles.inp} rows={3} style={{ resize: "vertical", fontFamily: "inherit" }}
            value={cliente.observacoes ?? ""}
            onChange={(e) => atualizarCampo("observacoes", e.target.value || null)}
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className={styles.btnPrimary} disabled={salvando} onClick={salvarCadastro}>
            {salvando ? "Salvando…" : "Salvar cadastro"}
          </button>
          <button className={styles.btnLink} style={{ color: "var(--crit)" }} onClick={excluir}>
            Excluir cliente
          </button>
        </div>

        <p className={styles.section}>Preço por produto (R$/Kg)</p>
        <p className={styles.hint}>Sempre em preço por Kg. Puxa automaticamente na tela de venda/acerto — pode ser alterado ali para um caso específico.</p>
        {precos.map((p) => (
          <div key={p.produto_id} className={styles.precoRow}>
            <span>{p.produto_nome}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className={styles.inp}
                type="number"
                inputMode="decimal"
                placeholder="0,00"
                value={precoEditando[p.produto_id] ?? ""}
                onChange={(e) => setPrecoEditando((s) => ({ ...s, [p.produto_id]: e.target.value }))}
              />
              <button className={styles.btnLink} onClick={() => salvarPreco(p.produto_id)}>Salvar</button>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <p className={styles.section} style={{ margin: "22px 0 10px" }}>Histórico de interações</p>
          <button
            type="button"
            onClick={() => setMostrarExcluidasInteracoes((v) => !v)}
            style={{ background: "none", border: "none", color: "var(--ink-faint)", fontSize: "0.76rem", cursor: "pointer" }}
          >
            {mostrarExcluidasInteracoes ? "Vendo excluídas" : "Ver excluídas"}
          </button>
        </div>

        {!mostrarExcluidasInteracoes && (
          <div style={{ border: "1px solid var(--rule)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div className={styles.field} style={{ marginBottom: 10 }}>
              <label>Data</label>
              <input className={styles.inp} type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
            </div>
            <div className={styles.field} style={{ marginBottom: 10 }}>
              <label>Tipo</label>
              <select className={styles.inp} value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)}>
                {TIPOS_INTERACAO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={styles.field} style={{ marginBottom: 10 }}>
              <label>Vendedor (opcional)</label>
              <select
                className={styles.inp} value={novoVendedorId ?? ""}
                onChange={(e) => setNovoVendedorId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sem vendedor definido</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
            <div className={styles.field} style={{ marginBottom: 10 }}>
              <label>Descrição</label>
              <textarea
                className={styles.inp} rows={2} style={{ resize: "vertical", fontFamily: "inherit" }}
                value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)}
              />
            </div>
            <button
              className={styles.btnPrimary} disabled={!novaDescricao.trim() || registrandoInteracao}
              onClick={registrarInteracao}
            >
              {registrandoInteracao ? "Registrando…" : "Registrar interação"}
            </button>
          </div>
        )}

        {interacoes === null && <p className={styles.hint}>Carregando…</p>}
        {interacoes !== null && interacoes.length === 0 && (
          <p className={styles.hint}>
            {mostrarExcluidasInteracoes ? "Nenhuma interação excluída." : "Nenhuma interação registrada ainda."}
          </p>
        )}
        {interacoes?.map((i) => (
          <div key={i.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
            {editandoInteracaoId === i.id && formEdicao ? (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <input
                    className={styles.inp} type="date" style={{ width: 150 }}
                    value={formEdicao.data} onChange={(e) => setFormEdicao({ ...formEdicao, data: e.target.value })}
                  />
                  <select
                    className={styles.inp} style={{ width: 150 }}
                    value={formEdicao.tipo} onChange={(e) => setFormEdicao({ ...formEdicao, tipo: e.target.value })}
                  >
                    {TIPOS_INTERACAO.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select
                    className={styles.inp} style={{ width: 180 }}
                    value={formEdicao.vendedor_id ?? ""}
                    onChange={(e) => setFormEdicao({ ...formEdicao, vendedor_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">Sem vendedor definido</option>
                    {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
                <textarea
                  className={styles.inp} rows={2} style={{ resize: "vertical", fontFamily: "inherit", marginBottom: 8 }}
                  value={formEdicao.descricao} onChange={(e) => setFormEdicao({ ...formEdicao, descricao: e.target.value })}
                />
                <button
                  className={styles.btnLink} disabled={processandoInteracaoId === i.id}
                  onClick={() => salvarEdicaoInteracao(i.id)}
                >
                  OK
                </button>
                {" · "}
                <button
                  className={styles.btnLink} style={{ color: "var(--ink-muted)" }}
                  onClick={() => { setEditandoInteracaoId(null); setFormEdicao(null); }}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "0.78rem", color: "var(--ink-muted)", marginBottom: 4 }}>
                  {dataBr(i.data)} · {i.tipo}{i.vendedor_nome ? ` · ${i.vendedor_nome}` : ""}
                </div>
                <div style={{ fontSize: "0.9rem", marginBottom: 6 }}>{i.descricao}</div>
                {mostrarExcluidasInteracoes ? (
                  <>
                    <span style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>
                      {i.excluido_em ? `Excluída ${dataBr(i.excluido_em.slice(0, 10))}` : ""}
                      {i.excluido_por ? ` · ${i.excluido_por}` : ""}
                    </span>
                    {" · "}
                    <button
                      className={styles.btnLink} disabled={processandoInteracaoId === i.id}
                      onClick={() => restaurarInteracaoClick(i)}
                    >
                      Restaurar
                    </button>
                  </>
                ) : (
                  <>
                    <button className={styles.btnLink} onClick={() => iniciarEdicaoInteracao(i)}>Editar</button>
                    {" · "}
                    <button
                      className={styles.btnLink} style={{ color: "var(--crit)" }}
                      disabled={processandoInteracaoId === i.id}
                      onClick={() => excluirInteracaoClick(i)}
                    >
                      Excluir
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { criarCliente, listarVendedores, type Vendedor } from "@/lib/cadastros";
import { FASES, TEMPERATURAS } from "../[id]/page";
import styles from "../../cadastros.module.css";

export default function NovoCliente() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const retorno = searchParams.get("retorno");
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contato, setContato] = useState("");
  const [cidade, setCidade] = useState("");
  const [prazoDias, setPrazoDias] = useState("");
  const [emiteNf, setEmiteNf] = useState(false);
  const [emiteBoleto, setEmiteBoleto] = useState(false);
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [eCliente, setECliente] = useState(true);
  const [fase, setFase] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarVendedores().then(setVendedores).catch(() => undefined);
  }, []);

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      const cliente = await criarCliente({
        nome: nome.trim(),
        cnpj: cnpj.trim() || null,
        contato: contato.trim() || null,
        cidade: cidade.trim() || null,
        prazo_dias: prazoDias ? Number(prazoDias) : null,
        emite_nf: emiteNf,
        emite_boleto: emiteBoleto,
        vendedor_id: vendedorId,
        vendedor_nome: null,
        nome_contato: null, endereco: null, ramo: null, priorizacao: null,
        e_cliente: eCliente, fase: fase || null, temperatura: temperatura || null,
        motivo: null, proxima_acao: null, fornecedor_atual: null, preco_concorrente: null,
        preferencia_tamanho: null, fresco_congelado: null, observacoes: null,
      });
      router.push(retorno ? `${retorno}?clienteId=${cliente.id}` : `/cadastros/clientes/${cliente.id}`);
    } catch {
      setErro("Não foi possível salvar — verifique a conexão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push(retorno ?? "/cadastros/clientes")}>
          ←
        </button>
        <div>
          <h1>Novo cliente</h1>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.error}>{erro}</div>}

        <div className={styles.field}>
          <label>Nome</label>
          <input className={styles.inp} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>CNPJ (opcional)</label>
          <input className={styles.inp} value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Contato (opcional)</label>
          <input className={styles.inp} value={contato} onChange={(e) => setContato(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Cidade (opcional)</label>
          <input className={styles.inp} value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Prazo (dias, opcional)</label>
          <input className={styles.inp} type="number" inputMode="numeric" value={prazoDias} onChange={(e) => setPrazoDias(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Vendedor (opcional)</label>
          <select className={styles.inp} value={vendedorId ?? ""} onChange={(e) => setVendedorId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sem vendedor definido</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </div>
        <div className={styles.checkRow}>
          <input type="checkbox" id="nf" checked={emiteNf} onChange={(e) => setEmiteNf(e.target.checked)} />
          <label htmlFor="nf">Emite NF</label>
        </div>
        <div className={styles.checkRow}>
          <input type="checkbox" id="boleto" checked={emiteBoleto} onChange={(e) => setEmiteBoleto(e.target.checked)} />
          <label htmlFor="boleto">Emite boleto</label>
        </div>

        <div className={styles.checkRow}>
          <input type="checkbox" id="ecliente" checked={eCliente} onChange={(e) => setECliente(e.target.checked)} />
          <label htmlFor="ecliente">É cliente (desmarcado = ainda é só prospecção)</label>
        </div>
        <div className={styles.field}>
          <label>Fase (opcional)</label>
          <select className={styles.inp} value={fase} onChange={(e) => setFase(e.target.value)}>
            <option value="">Não definida</option>
            {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label>Temperatura (opcional)</label>
          <select className={styles.inp} value={temperatura} onChange={(e) => setTemperatura(e.target.value)}>
            <option value="">Não definida</option>
            {TEMPERATURAS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <button className={styles.btnPrimary} disabled={!nome.trim() || salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Cadastrar cliente"}
        </button>
      </div>
    </div>
  );
}

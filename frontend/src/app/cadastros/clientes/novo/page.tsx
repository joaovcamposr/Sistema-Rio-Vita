"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { criarCliente } from "@/lib/cadastros";
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
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
        <div className={styles.checkRow}>
          <input type="checkbox" id="nf" checked={emiteNf} onChange={(e) => setEmiteNf(e.target.checked)} />
          <label htmlFor="nf">Emite NF</label>
        </div>
        <div className={styles.checkRow}>
          <input type="checkbox" id="boleto" checked={emiteBoleto} onChange={(e) => setEmiteBoleto(e.target.checked)} />
          <label htmlFor="boleto">Emite boleto</label>
        </div>

        <button className={styles.btnPrimary} disabled={!nome.trim() || salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Cadastrar cliente"}
        </button>
      </div>
    </div>
  );
}

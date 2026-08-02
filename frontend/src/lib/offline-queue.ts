/**
 * Fila de lançamentos offline. Cada lançamento é gravado no IndexedDB do
 * aparelho ANTES de qualquer tentativa de rede, com um client_id gerado
 * localmente. Se a conexão falhar, o registro fica pendente e é reenviado
 * automaticamente quando a rede volta — sempre com o mesmo client_id, então
 * o backend nunca grava duplicado (ver migração 001, coluna client_id).
 */
import { authHeader, sessaoInvalida } from "./auth";

const DB_NAME = "rio-vita";
const DB_VERSION = 1;
const STORE = "fila";

export type TipoLancamento =
  | "despesca"
  | "producao"
  | "povoamento"
  | "repicagem"
  | "biometria"
  | "arracoamento"
  | "analise_agua"
  | "venda"
  | "expedicao"
  | "expedicao_acerto"
  | "despesa"
  | "chegada_racao";

export interface ItemFila {
  client_id: string;
  tipo: TipoLancamento;
  payload: Record<string, unknown>;
  criadoEm: number;
  tentativas: number;
  ultimoErro?: string;
}

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function comStore<T>(
  modo: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function novoClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // fallback para navegadores/webviews sem crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Grava o lançamento localmente e dispara uma tentativa de envio imediata. */
export async function enfileirar(
  tipo: TipoLancamento,
  payloadSemId: Record<string, unknown>
): Promise<string> {
  const client_id = novoClientId();
  const item: ItemFila = {
    client_id,
    tipo,
    payload: { ...payloadSemId, client_id },
    criadoEm: Date.now(),
    tentativas: 0,
  };
  await comStore("readwrite", (s) => s.add(item));
  void avisarOuvintes(); // atualiza o contador na hora, mesmo se a sincronização abaixo falhar
  void tentarSincronizar();
  return client_id;
}

export async function listarPendentes(): Promise<ItemFila[]> {
  return comStore("readonly", (s) => s.getAll());
}

export async function contarPendentes(): Promise<number> {
  return comStore("readonly", (s) => s.count());
}

/** Rota de cada tipo de lançamento. A maioria é fixa; o acerto de
 * expedição precisa do id da expedição embutido na própria URL, por isso
 * é uma função do payload em vez de uma string fixa. */
const ENDPOINT: Record<TipoLancamento, (payload: Record<string, unknown>) => string> = {
  despesca: () => "/despescas",
  producao: () => "/producao",
  povoamento: () => "/lotes",
  repicagem: () => "/repicagens",
  biometria: () => "/biometria",
  arracoamento: () => "/arracoamento",
  analise_agua: () => "/analise-agua",
  venda: () => "/vendas",
  expedicao: () => "/expedicoes",
  expedicao_acerto: (p) => `/expedicoes/${p.expedicao_id}/acerto`,
  despesa: () => "/despesas",
  chegada_racao: () => "/chegadas-racao",
};

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

/** true se a API respondeu de verdade — mais confiável que navigator.onLine,
 * que não detecta portal cativo ou wifi sem internet real. */
async function apiEstaViva(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${apiBase()}/health`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

let sincronizando = false;
type Ouvinte = (pendentes: number) => void;
const ouvintes = new Set<Ouvinte>();

export function aoMudarFila(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

async function avisarOuvintes() {
  const n = await contarPendentes();
  ouvintes.forEach((fn) => fn(n));
}

/** Percorre a fila e tenta reenviar cada item pendente. Idempotente: pode
 * ser chamada quantas vezes quiser, inclusive em paralelo (a flag
 * `sincronizando` evita reentrância). */
export async function tentarSincronizar(): Promise<void> {
  // checagem e marcação precisam ficar juntas, sem nenhum "await" entre elas —
  // senão duas chamadas concorrentes (ex.: um laço que enfileira vários itens
  // em sequência) passam as duas pela guarda antes que a primeira feche a
  // porta, e cada item pendente acaba sendo reenviado em dobro
  if (sincronizando) return;
  sincronizando = true;
  try {
    if (!(await apiEstaViva())) {
      void avisarOuvintes(); // sem rede: ainda assim reflete o que está pendente
      return;
    }
    const itens = await listarPendentes();
    for (const item of itens) {
      try {
        const resp = await fetch(`${apiBase()}${ENDPOINT[item.tipo](item.payload)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify(item.payload),
        });
        if (resp.ok) {
          await comStore("readwrite", (s) => s.delete(item.client_id));
        } else if (resp.status === 401) {
          // sessão expirou/inválida — mantém o item pendente (o dado está
          // certo, só falta logar de novo) e para o loop, senão cada item
          // dispara sessaoInvalida() e um redirect em cima do outro
          sessaoInvalida();
          break;
        } else if (resp.status >= 400 && resp.status < 500) {
          // erro de validação — não adianta tentar de novo sem mudar o dado
          const detail = await resp.text();
          await comStore("readwrite", (s) =>
            s.put({ ...item, tentativas: item.tentativas + 1, ultimoErro: detail } satisfies ItemFila)
          );
        }
        // 5xx ou rede: mantém pendente, tenta de novo na próxima rodada
      } catch {
        // sem rede no meio do envio — mantém pendente
      }
    }
  } finally {
    sincronizando = false;
    void avisarOuvintes();
  }
}

let iniciado = false;

/** Chame uma vez, no layout raiz, para ligar o sincronizador em segundo
 * plano (evento 'online' + verificação periódica). */
export function iniciarSincronizadorEmSegundoPlano() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  window.addEventListener("online", () => void tentarSincronizar());
  void tentarSincronizar();
  setInterval(() => void tentarSincronizar(), 20_000);
}

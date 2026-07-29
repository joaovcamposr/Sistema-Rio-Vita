/**
 * Sessão de login (JWT). Guardada no localStorage do aparelho — o app é
 * usado em campo, muitas vezes offline, então o token precisa sobreviver
 * a recarregar a página sem exigir rede. Ver AuthGate.tsx (guarda de rota)
 * e cada lib de leitura/escrita, que anexam o header Authorization.
 */

export type Papel = "operador" | "comercial" | "gerente";

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
}

export interface Sessao {
  token: string;
  usuario: Usuario;
}

const CHAVE = "rio-vita-sessao";

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

export function obterSessao(): Sessao | null {
  if (typeof window === "undefined") return null;
  const bruto = window.localStorage.getItem(CHAVE);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as Sessao;
  } catch {
    return null;
  }
}

function salvarSessao(sessao: Sessao) {
  window.localStorage.setItem(CHAVE, JSON.stringify(sessao));
}

export function limparSessao() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHAVE);
}

/** Header pronto para anexar em qualquer fetch — vazio se não há sessão. */
export function authHeader(): Record<string, string> {
  const sessao = obterSessao();
  return sessao ? { Authorization: `Bearer ${sessao.token}` } : {};
}

/** Chamado pelas próprias libs de API quando uma resposta vem 401 — o token
 * expirou ou foi revogado, então a sessão local não serve mais. */
export function sessaoInvalida() {
  limparSessao();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export async function login(email: string, senha: string): Promise<Sessao> {
  const r = await fetch(`${apiBase()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  if (!r.ok) {
    throw new Error(r.status === 401 ? "E-mail ou senha inválidos" : `Falha ao entrar (HTTP ${r.status})`);
  }
  const dados = await r.json();
  const sessao: Sessao = {
    token: dados.token,
    usuario: { id: dados.id, nome: dados.nome, email: dados.email, papel: dados.papel },
  };
  salvarSessao(sessao);
  return sessao;
}

export function logout() {
  limparSessao();
  if (typeof window !== "undefined") window.location.href = "/login";
}

// ---------- Gestão de usuários (só gerente) ----------

export interface UsuarioLista extends Usuario {
  ativo: boolean;
}

async function chamar<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(r.status === 403 ? "Só usuários gerentes podem fazer isso" : `HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

export const listarUsuarios = () => chamar<UsuarioLista[]>("/auth/usuarios");

export const criarUsuario = (nome: string, email: string, senha: string, papel: Papel) =>
  chamar<UsuarioLista>("/auth/usuarios", { method: "POST", body: JSON.stringify({ nome, email, senha, papel }) });

export const alternarUsuarioAtivo = (id: number, ativo: boolean) =>
  chamar<UsuarioLista>(`/auth/usuarios/${id}/ativo?ativo=${ativo}`, { method: "PATCH" });

export async function trocarSenha(senhaAtual: string, senhaNova: string): Promise<void> {
  const r = await fetch(`${apiBase()}/auth/senha`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ senha_atual: senhaAtual, senha_nova: senhaNova }),
  });
  if (r.status === 401) sessaoInvalida();
  if (r.status === 422) throw new Error("Senha atual incorreta");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

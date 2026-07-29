"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout, obterSessao, type Usuario } from "@/lib/auth";
import { LogoHorizontal } from "./LogoRioVita";
import styles from "./Topbar.module.css";

export default function Topbar() {
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    setUsuario(obterSessao()?.usuario ?? null);
  }, [pathname]);

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="Rio Vita">
          <span className={styles.logo}>
            <LogoHorizontal />
          </span>
        </Link>
        <span className={styles.tagline}>Sistema de Gestão Operacional</span>
        {usuario && pathname !== "/login" && (
          <div className={styles.usuario}>
            <span className={styles.nome}>{usuario.nome}</span>
            <Link className={styles.trocarSenha} href="/trocar-senha" aria-label="Trocar senha" title="Trocar senha">
              🔑<span className={styles.trocarSenhaTexto}>Trocar senha</span>
            </Link>
            <button className={styles.sair} onClick={logout}>Sair</button>
          </div>
        )}
      </div>
    </header>
  );
}

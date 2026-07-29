"use client";

import { useEffect, type ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  children: ReactNode;
}

export default function Modal({ titulo, subtitulo, onFechar, children }: ModalProps) {
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div className={styles.overlay} onClick={onFechar}>
      <div className={styles.caixa} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cabecalho}>
          <div>
            <div className={styles.titulo}>{titulo}</div>
            {subtitulo && <div className={styles.subtitulo}>{subtitulo}</div>}
          </div>
          <button type="button" className={styles.fechar} aria-label="Fechar" onClick={onFechar}>
            ×
          </button>
        </div>
        <div className={styles.corpo}>{children}</div>
      </div>
    </div>
  );
}

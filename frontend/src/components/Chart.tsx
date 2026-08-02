"use client";

import { useMemo, useState } from "react";

export interface SeriePonto {
  bucket: string;
  valores: Record<string, number | null | undefined>;
}

interface ChartProps {
  dados: SeriePonto[];
  series: string[];
  cores?: string[];
  tipo?: "barra" | "linha";
  modoBarra?: "agrupada" | "empilhada";
  mostrarTotal?: boolean;
  formatarValor?: (v: number) => string;
  formatarBucket?: (b: string) => string;
  altura?: number;
  // por padrão a barra cresce em largura fixa por bucket e rola na
  // horizontal quando não cabe; com isso ligado, o gráfico encolhe pra
  // caber todos os buckets do período de uma vez, sem precisar rolar
  caberNaTela?: boolean;
}

// paleta restrita à identidade visual da Rio Vita — tons do azul da marca
// + tinta escura, sem cores fora da marca
const CORES_PADRAO = ["#00A6E0", "#04303F", "#05627F", "#7FD1F0", "#0C1F27", "#4C6570"];

export default function Chart({
  dados, series, cores = CORES_PADRAO, tipo = "barra", modoBarra = "agrupada", mostrarTotal = false,
  formatarValor = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
  formatarBucket = (b) => b,
  altura = 260,
  caberNaTela = false,
}: ChartProps) {
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [dica, setDica] = useState<{ x: number; y: number; texto: string } | null>(null);

  const visiveis = series.filter((s) => !ocultas.has(s));
  const empilhada = tipo === "barra" && modoBarra === "empilhada";
  const largura = Math.max(560, dados.length * (tipo === "barra" ? (empilhada ? 56 : Math.max(60, visiveis.length * 22)) : 70));
  const margemEsq = 56;
  const margemBaixo = 34;
  const margemTopo = mostrarTotal ? 26 : 14;
  const areaAltura = altura - margemBaixo - margemTopo;
  const areaLargura = largura - margemEsq - 12;

  function totalDoBucket(p: SeriePonto): number {
    return visiveis.reduce((s, serie) => {
      const v = p.valores[serie];
      return s + (typeof v === "number" ? v : 0);
    }, 0);
  }

  const maxValor = useMemo(() => {
    let m = 0;
    for (const p of dados) {
      if (empilhada) {
        const total = totalDoBucket(p);
        if (total > m) m = total;
        continue;
      }
      for (const s of visiveis) {
        const v = p.valores[s];
        if (typeof v === "number" && v > m) m = v;
      }
    }
    return m || 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, visiveis, empilhada]);

  function y(v: number): number {
    return margemTopo + areaAltura - (v / maxValor) * areaAltura;
  }

  const passoX = dados.length > 0 ? areaLargura / dados.length : areaLargura;
  const ticksY = 4;

  function toggle(s: string) {
    setOcultas((prev) => {
      const nova = new Set(prev);
      if (nova.has(s)) nova.delete(s);
      else nova.add(s);
      return nova;
    });
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
        {series.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
              cursor: "pointer", padding: 0, fontSize: "0.78rem",
              color: ocultas.has(s) ? "var(--ink-faint)" : "var(--ink)",
              textDecoration: ocultas.has(s) ? "line-through" : "none",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: cores[i % cores.length], display: "inline-block" }} />
            {s}
          </button>
        ))}
      </div>

      <div style={{ overflowX: caberNaTela ? "hidden" : "auto", position: "relative" }}>
        <svg
          width={caberNaTela ? "100%" : largura}
          height={altura}
          viewBox={caberNaTela ? `0 0 ${largura} ${altura}` : undefined}
          preserveAspectRatio={caberNaTela ? "none" : undefined}
          style={{ display: "block" }}
        >
          {Array.from({ length: ticksY + 1 }, (_, i) => {
            const v = (maxValor / ticksY) * i;
            const yy = y(v);
            return (
              <g key={i}>
                <line x1={margemEsq} y1={yy} x2={largura - 8} y2={yy} stroke="var(--rule)" strokeWidth={1} />
                <text x={margemEsq - 8} y={yy + 4} textAnchor="end" fontSize={10} fill="var(--ink-faint)">
                  {formatarValor(v)}
                </text>
              </g>
            );
          })}

          {tipo === "barra" && !empilhada && dados.map((p, bi) => {
            const grupoX = margemEsq + bi * passoX;
            const larguraBarra = Math.min(28, (passoX - 8) / Math.max(1, visiveis.length));
            return (
              <g key={`${p.bucket}-${bi}`}>
                {visiveis.map((s, si) => {
                  const v = p.valores[s];
                  if (typeof v !== "number") return null;
                  const bx = grupoX + 4 + si * larguraBarra;
                  const by = y(v);
                  return (
                    <rect
                      key={s}
                      x={bx} y={by} width={larguraBarra - 2} height={Math.max(0, margemTopo + areaAltura - by)}
                      fill={cores[series.indexOf(s) % cores.length]}
                      onMouseEnter={(e) => setDica({
                        x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY,
                        texto: `${s} · ${formatarBucket(p.bucket)}: ${formatarValor(v)}`,
                      })}
                      onMouseLeave={() => setDica(null)}
                    />
                  );
                })}
                <text x={grupoX + passoX / 2} y={altura - 12} textAnchor="middle" fontSize={10} fill="var(--ink-faint)">
                  {formatarBucket(p.bucket)}
                </text>
              </g>
            );
          })}

          {tipo === "barra" && empilhada && dados.map((p, bi) => {
            const centroX = margemEsq + bi * passoX + passoX / 2;
            const larguraBarra = Math.min(40, passoX - 10);
            const bx = centroX - larguraBarra / 2;
            let acumulado = 0;
            const total = totalDoBucket(p);
            return (
              <g key={`${p.bucket}-${bi}`}>
                {visiveis.map((s) => {
                  const v = p.valores[s];
                  if (typeof v !== "number" || v <= 0) return null;
                  const baseY = y(acumulado);
                  acumulado += v;
                  const topoY = y(acumulado);
                  return (
                    <rect
                      key={s}
                      x={bx} y={topoY} width={larguraBarra} height={Math.max(0, baseY - topoY)}
                      fill={cores[series.indexOf(s) % cores.length]}
                      onMouseEnter={(e) => setDica({
                        x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY,
                        texto: `${s} · ${formatarBucket(p.bucket)}: ${formatarValor(v)}`,
                      })}
                      onMouseLeave={() => setDica(null)}
                    />
                  );
                })}
                {mostrarTotal && total > 0 && (
                  <text x={centroX} y={y(total) - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--ink)">
                    {formatarValor(total)}
                  </text>
                )}
                <text x={centroX} y={altura - 12} textAnchor="middle" fontSize={10} fill="var(--ink-faint)">
                  {formatarBucket(p.bucket)}
                </text>
              </g>
            );
          })}

          {tipo === "linha" && visiveis.map((s) => {
            const pontos = dados
              .map((p, bi) => {
                const v = p.valores[s];
                if (typeof v !== "number") return null;
                return { x: margemEsq + bi * passoX + passoX / 2, y: y(v), v };
              })
              .filter((p): p is { x: number; y: number; v: number } => p !== null);
            const cor = cores[series.indexOf(s) % cores.length];
            return (
              <g key={s}>
                <polyline
                  points={pontos.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                />
                {pontos.map((p, i) => (
                  <circle
                    key={i} cx={p.x} cy={p.y} r={4} fill={cor}
                    onMouseEnter={(e) => setDica({
                      x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY,
                      texto: `${s} · ${formatarBucket(dados[i].bucket)}: ${formatarValor(p.v)}`,
                    })}
                    onMouseLeave={() => setDica(null)}
                  />
                ))}
              </g>
            );
          })}

          {tipo === "linha" && dados.map((p, bi) => (
            <text key={`${p.bucket}-${bi}`} x={margemEsq + bi * passoX + passoX / 2} y={altura - 12} textAnchor="middle" fontSize={10} fill="var(--ink-faint)">
              {formatarBucket(p.bucket)}
            </text>
          ))}
        </svg>

        {dica && (
          <div style={{
            position: "absolute", left: dica.x + 12, top: dica.y - 8, pointerEvents: "none",
            background: "var(--ink)", color: "var(--ground)", fontSize: "0.75rem", fontWeight: 700,
            padding: "5px 9px", borderRadius: 7, whiteSpace: "nowrap", zIndex: 10,
          }}>
            {dica.texto}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
/**
 * Trocar a planta de um anúncio ou a unidade de um edital, dentro do mesmo prédio (seção 10, Ficha;
 * critério 3 do 8.8). "Só o prédio" casa sem planta/unidade.
 * Recebe: opções, o valor atual e a ação (recebe o id escolhido ou nulo). Devolve: o seletor.
 */
import { useState, useTransition } from "react";
import type { Resultado } from "@/features/revisao/acoes";

export function TrocarVinculo({ opcoes, atual, acao, rotuloVazio }: {
  opcoes: readonly { id: string; rotulo: string }[]; atual: string | null; acao: (id: string | null) => Promise<Resultado>; rotuloVazio: string;
}) {
  const [valor, setValor] = useState(atual ?? "");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1">
        <select aria-label="Vínculo" value={valor} onChange={(e) => setValor(e.target.value)} className="h-7 max-w-40 rounded-md border border-input bg-white px-1 text-xs">
          <option value="">{rotuloVazio}</option>
          {opcoes.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
        </select>
        <button type="button" disabled={pendente || valor === (atual ?? "")} className="text-xs text-primary hover:underline disabled:opacity-40"
          onClick={() => iniciar(async () => { const r = await acao(valor || null); setErro(r.erro ?? null); })}>
          {pendente ? "…" : "Trocar"}
        </button>
      </span>
      {erro && <span role="alert" className="text-xs text-destructive">{erro}</span>}
    </span>
  );
}

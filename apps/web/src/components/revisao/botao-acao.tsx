"use client";
/**
 * Botão de uma ação de revisão (marcar especial, fora da curva, descartar…; épico 8.8).
 * Recebe: rótulo, a ação já ligada aos ids e, opcionalmente, um texto de confirmação.
 * Devolve: o botão, que mostra o erro da ação quando houver.
 */
import { useState, useTransition } from "react";
import type { Resultado } from "@/features/revisao/acoes";

export function BotaoAcao({ rotulo, acao, confirmar }: { rotulo: string; acao: () => Promise<Resultado>; confirmar?: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button type="button" disabled={pendente}
        className="text-xs text-primary hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          iniciar(async () => { const r = await acao(); setErro(r.erro ?? null); });
        }}>
        {pendente ? "…" : rotulo}
      </button>
      {erro && <span role="alert" className="text-xs text-destructive">{erro}</span>}
    </span>
  );
}

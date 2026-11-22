"use client";
/**
 * Abas da página /conectar (épico 8.11): Claude, ChatGPT e Grok, com o passo a passo de cada um.
 * Teclado: setas trocam de aba (padrão WAI-ARIA de abas). Recebe: os assistentes e as classes.
 */
import { useState, type KeyboardEvent } from "react";

type Assistente = { id: string; nome: string; passos: readonly string[] };

export function AbasAssistentes({ assistentes, classes }: { assistentes: readonly Assistente[]; classes: { abas: string; aba: string; passos: string } }) {
  const [ativo, setAtivo] = useState(0);
  const mover = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const n = (ativo + (e.key === "ArrowRight" ? 1 : assistentes.length - 1)) % assistentes.length;
    setAtivo(n);
    document.getElementById(`aba-${assistentes[n]!.id}`)?.focus();
  };
  const a = assistentes[ativo]!;
  return (
    <>
      <div role="tablist" aria-label="Assistentes" className={classes.abas} onKeyDown={mover}>
        {assistentes.map((x, i) => (
          <button key={x.id} id={`aba-${x.id}`} role="tab" type="button" aria-selected={i === ativo} aria-controls={`painel-${x.id}`} tabIndex={i === ativo ? 0 : -1} className={classes.aba} onClick={() => setAtivo(i)}>
            {x.nome}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`painel-${a.id}`} aria-labelledby={`aba-${a.id}`}>
        <ol className={classes.passos}>
          {a.passos.map((p) => <li key={p}>{p}</li>)}
        </ol>
      </div>
    </>
  );
}

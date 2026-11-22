"use client";
/**
 * Botão "copiar" do site (épico 8.11): copia o texto para a área de transferência e mostra "Copiado"
 * por 2 s. Recebe: o texto, o rótulo e a classe. Sem a API de clipboard, não faz nada (o texto está
 * visível ao lado para copiar à mão).
 */
import { useState } from "react";

const COPIADO_MS = 2000;

export function Copiar({ texto, rotulo = "Copiar", copiado = "Copiado", className }: { texto: string; rotulo?: string; copiado?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={`${rotulo}: ${texto}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), COPIADO_MS);
        } catch {
          /* sem permissão de clipboard: o texto continua visível */
        }
      }}
    >
      {ok ? copiado : rotulo}
    </button>
  );
}

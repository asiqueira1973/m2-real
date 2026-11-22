"use client";
/** Erro das telas do painel (seção 8.7). Recebe: o erro e reset do Next. Devolve: o estado de erro. */
import { EstadoErro } from "@/components/estado-erro";

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoErro erro={error} tentar={reset} />;
}

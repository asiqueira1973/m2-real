"use client";
/**
 * Erro fora das telas do painel, inclusive no layout dele (ex.: banco fora do ar ao conferir o
 * perfil; seção 8.7). Não desconecta o usuário. Recebe: o erro e reset. Devolve: o estado de erro.
 */
import { EstadoErro } from "@/components/estado-erro";

export default function ErroRaiz({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md"><EstadoErro erro={error} tentar={reset} /></div>
    </main>
  );
}

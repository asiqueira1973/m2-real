"use client";
/**
 * Estado de erro das telas (seção 8.7), usado pelos error.tsx do Next.
 * Recebe: o erro e a função de tentar de novo. Devolve: mensagem e botão. Não mostra detalhes
 * técnicos ao usuário; o digest ajuda a achar o log no servidor.
 */
import { Button } from "@/components/ui/button";

export function EstadoErro({ erro, tentar }: { erro: Error & { digest?: string }; tentar: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-border px-6 py-12 text-center">
      <p className="text-sm">Não foi possível carregar esta tela.</p>
      {erro.digest && <p className="mt-1 text-xs text-muted-foreground">Código: {erro.digest}</p>}
      <Button className="mt-4" variant="outline" onClick={tentar}>Tentar de novo</Button>
    </div>
  );
}

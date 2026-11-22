/**
 * Estado vazio das telas (seção 8.7: "estados vazio, carregando e erro em todas as telas").
 * Recebe: a mensagem. Devolve: o bloco centralizado.
 */
export function EstadoVazio({ mensagem }: { mensagem: string }) {
  return <p className="rounded-xl border border-border px-6 py-12 text-center text-sm text-muted-foreground">{mensagem}</p>;
}

/** Carregando da Ficha do prédio (seção 8.7): esqueleto do cabeçalho, das abas e da tabela. */
import { Skeleton } from "@/components/ui/skeleton";

export default function Carregando() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-8 w-96" />
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}

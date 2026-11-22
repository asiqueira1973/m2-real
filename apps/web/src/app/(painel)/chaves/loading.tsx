/** Carregando (seção 8.7): esqueleto dos filtros e da lista. */
import { Skeleton } from "@/components/ui/skeleton";

export default function Carregando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-full" />
      {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}

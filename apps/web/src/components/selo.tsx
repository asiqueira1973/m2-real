/**
 * Selo de área (seções 15 e 16; regra 11.9): texto sempre visível + cor semântica, que só
 * aparece aqui. Confirmada mostra a fonte ("revisão" ou "edital").
 * Recebe: selo e, opcionalmente, a fonte da área. Devolve: a etiqueta.
 */
import { confirmedSource, ROTULO_SELO, type Selo } from "@/lib/selos";

const CORES: Readonly<Record<Selo, string>> = {
  confirmada: "bg-selo-confirmada-fundo text-selo-confirmada",
  calibrada: "bg-selo-calibrada-fundo text-selo-calibrada",
  indicativa: "bg-selo-indicativa-fundo text-selo-indicativa",
  estimada: "bg-selo-estimada-fundo text-selo-estimada",
  sem_dado: "bg-selo-sem-dado-fundo text-selo-sem-dado",
};

/** Cor sólida de cada selo, para a barra empilhada da Visão geral. */
export const COR_BARRA: Readonly<Record<Selo, string>> = {
  confirmada: "bg-selo-confirmada",
  calibrada: "bg-selo-calibrada",
  indicativa: "bg-selo-indicativa",
  estimada: "bg-selo-estimada",
  sem_dado: "bg-selo-sem-dado-fundo",
};

export function SeloArea({ selo, fonte }: { selo: Selo | null; fonte?: string | null }) {
  if (!selo) return <span className="text-muted-foreground">—</span>;
  const origem = confirmedSource(selo, fonte);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${CORES[selo]}`}>
      {ROTULO_SELO[selo]}
      {origem && <span className="font-normal">· {origem}</span>}
    </span>
  );
}

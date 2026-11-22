/**
 * Filtros da tela Prédios (seção 10) a partir da URL. Função pura: os filtros ficam na URL para
 * a tela poder ser recarregada, compartilhada e paginada sem estado no cliente.
 */
import { parseSelo, type Selo } from "./selos";

/** Linhas por página. Limite técnico: bem abaixo do max_rows de 1.000 do PostgREST. */
export const TAMANHO_PAGINA = 50;

export interface FiltrosPredios {
  bairro: number | null;
  selo: Selo | null;
  soRevisao: boolean;
  busca: string;
  pagina: number;
}

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Recebe: os searchParams. Devolve: filtros validados (valores inválidos viram "sem filtro";
 * página mínima 1; busca com até 200 caracteres, como o buscar_predio da 13.2).
 */
export function parsePrediosFilters(p: Params): FiltrosPredios {
  const bairro = Number(um(p.bairro));
  const pagina = Number(um(p.pagina));
  return {
    bairro: Number.isInteger(bairro) && bairro > 0 ? bairro : null,
    selo: parseSelo(um(p.selo)),
    soRevisao: um(p.revisao) === "1",
    busca: (um(p.busca) ?? "").trim().slice(0, 200),
    pagina: Number.isInteger(pagina) && pagina > 1 ? pagina : 1,
  };
}

/** Argumentos de m2_listar_predios. Recebe: filtros e a janela de meses. Devolve: o objeto do RPC. */
export function toRpcArgs(f: FiltrosPredios, janelaMeses: number) {
  return {
    bairro: f.bairro, selo: f.selo, so_revisao: f.soRevisao, busca: f.busca || null,
    janela_meses: janelaMeses, limite: TAMANHO_PAGINA, deslocamento: (f.pagina - 1) * TAMANHO_PAGINA,
  };
}

/** URL da tela com os filtros e outra página. Recebe: filtros e página. Devolve: "/painel/predios?…". */
export function pageHref(f: FiltrosPredios, pagina: number): string {
  const q = new URLSearchParams();
  if (f.bairro) q.set("bairro", String(f.bairro));
  if (f.selo) q.set("selo", f.selo);
  if (f.soRevisao) q.set("revisao", "1");
  if (f.busca) q.set("busca", f.busca);
  if (pagina > 1) q.set("pagina", String(pagina));
  const s = q.toString();
  return s ? `/painel/predios?${s}` : "/painel/predios";
}

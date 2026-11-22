/**
 * Regra 11.8: casamento anúncio → prédio → planta (função pura; usada na coleta do 8.5 e no
 * recasamento da calibração do 8.6, quando houver fatores).
 */
import { CASAMENTO_TOLERANCIA_PLANTA } from "../config/regras.js";
import type { AnuncioExtraido } from "./extracao.js";

export type StatusCasamento = "casado_planta" | "casado_predio" | "ambiguo" | "sem_predio";

export interface PlantaDoPredio {
  id: string;
  areaIptuReferencia: number;
}

export interface Casamento {
  status: StatusCasamento;
  predioId: string | null;
  plantaId: string | null;
  confianca: number | null;
}

/**
 * Casa um anúncio.
 * Recebe:
 *  - o anúncio extraído;
 *  - o prédio achado pelo endereço (similaridade ≥ 0,6 e número exato) ou pelo nome do
 *    condomínio de outra página já casada no mesmo número — ou nulo;
 *  - as plantas do prédio;
 *  - o fator do prédio ou, sem ele, o fator de referência do grupo (11.10) — ou nulo.
 * Devolve: status, prédio, planta e confiança (a similaridade do endereço).
 * Regra 11.8:
 *  - sem prédio → sem_predio;
 *  - prédio com uma planta só → casado_planta direto;
 *  - página de condomínio com faixa (min < max): com exatamente 2 plantas, a menor área vai para a
 *    menor planta (planta_id = menor; a 8.6 lê a faixa como evidência das duas) → casado_planta;
 *    senão → casado_predio;
 *  - área única: área IPTU esperada = área ÷ fator; plantas a até 12% dela: uma → casado_planta,
 *    mais de uma → ambiguo, nenhuma → casado_predio. Sem fator → casado_predio.
 */
export function casarAnuncio(
  anuncio: Pick<AnuncioExtraido, "fonte" | "area_privativa" | "area_privativa_min" | "area_privativa_max">,
  predio: { id: string; similaridade: number } | null,
  plantas: readonly PlantaDoPredio[],
  fator: number | null,
): Casamento {
  if (!predio) return { status: "sem_predio", predioId: null, plantaId: null, confianca: null };
  const base = { predioId: predio.id, confianca: Math.round(predio.similaridade * 1000) / 1000 };
  const ordenadas = [...plantas].sort((a, b) => a.areaIptuReferencia - b.areaIptuReferencia);

  if (ordenadas.length === 1) return { ...base, status: "casado_planta", plantaId: ordenadas[0]!.id };

  const { area_privativa_min: min, area_privativa_max: max } = anuncio;
  const faixa = anuncio.fonte === "pagina_condominio" && min !== null && max !== null && min < max;
  if (faixa) {
    return ordenadas.length === 2
      ? { ...base, status: "casado_planta", plantaId: ordenadas[0]!.id }
      : { ...base, status: "casado_predio", plantaId: null };
  }

  const area = anuncio.area_privativa ?? (min !== null && min === max ? min : null);
  if (area === null || fator === null || fator <= 0) return { ...base, status: "casado_predio", plantaId: null };

  const esperada = area / fator;
  const candidatas = ordenadas.filter((p) => Math.abs(p.areaIptuReferencia - esperada) / esperada <= CASAMENTO_TOLERANCIA_PLANTA);
  if (candidatas.length === 1) return { ...base, status: "casado_planta", plantaId: candidatas[0]!.id };
  if (candidatas.length > 1) return { ...base, status: "ambiguo", plantaId: null };
  return { ...base, status: "casado_predio", plantaId: null };
}

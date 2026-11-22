/**
 * As 5 ferramentas do MCP (seção 13.2) e a `sobre` (acréscimo de 23/11/2026), somente leitura. Toda resposta leva fonte, atualizado_em e,
 * pela observabilidade O5 (divergência aprovada: só acrescenta campos), dados_desatualizados e
 * motivo_desatualizacao. Princípio 1: todo m² sai com selo e área.
 */
import type { M2Client } from "@m2-real/db";
import {
  MCP_BAIRRO_MESES_MAX, MCP_BAIRRO_MESES_PADRAO, MCP_COMPARAVEIS_FAIXA_AREA, MCP_COMPARAVEIS_LIMITE_MAX, MCP_COMPARAVEIS_LIMITE_PADRAO,
  MCP_COMPARAVEIS_MESES_PADRAO, MCP_ENDERECO_MAX, MCP_ENDERECO_MIN, MCP_SAUDE_CACHE_MS, MCP_VENDAS_MESES_MAX, MCP_VENDAS_MESES_PADRAO,
} from "@m2-real/ingestao/regras";
import { loadHealth } from "@m2-real/ingestao/saude";
import { z } from "zod";
import { decade, medianSummary, pickComparables } from "./calculos";
import { buildingFile, buildingSales, comparableCandidates, currentCoverage, lastCalibration, neighborhoodStats, searchBuilding } from "./dados";
import { aboutPayload } from "./sobre";

/** 13.2: fonte de toda resposta. */
export const FONTE = "ITBI Prefeitura de SP + IPTU GeoSampa + calibração Fechou por Quanto";

/** Seção 15: mensagens fixas do MCP. */
export const MENSAGENS_MCP = {
  foraDaCobertura: "Este endereço não está na base do Fechou por Quanto, que hoje cobre Perdizes, Pinheiros, Pompeia, Vila Madalena, Alto de Pinheiros, Alto da Lapa, Higienópolis, Jardins, Cerqueira César e Itaim Bibi.",
  semVendas: "Nenhuma venda registrada neste prédio no período. Use a ferramenta comparaveis para ver vendas parecidas no bairro.",
  predioNaoEncontrado: "Prédio não encontrado.",
} as const;

/** Os 10 slugs da tabela 11.2 (enum de m2_bairro). */
export const SLUGS_BAIRROS = [
  "perdizes", "pompeia", "pinheiros", "vila-madalena", "alto-de-pinheiros", "alto-da-lapa", "higienopolis", "jardins", "cerqueira-cesar", "itaim-bibi",
] as const;

/** Schemas de entrada (zod) da 13.2. */
export const ESQUEMAS = {
  sobre: z.object({}),
  buscar_predio: z.object({ endereco: z.string().min(MCP_ENDERECO_MIN).max(MCP_ENDERECO_MAX).describe("Endereço livre, ex.: 'Rua Caiubi, 324'") }),
  ficha_predio: z.object({ predio_id: z.uuid().describe("id devolvido por buscar_predio") }),
  vendas_predio: z.object({
    predio_id: z.uuid(),
    meses: z.number().int().min(1).max(MCP_VENDAS_MESES_MAX).default(MCP_VENDAS_MESES_PADRAO).describe("Janela em meses (padrão 36)"),
  }),
  m2_bairro: z.object({
    bairro: z.enum(SLUGS_BAIRROS),
    meses: z.number().int().min(1).max(MCP_BAIRRO_MESES_MAX).default(MCP_BAIRRO_MESES_PADRAO).describe("Janela em meses (padrão 24)"),
    quartos: z.number().int().min(0).optional().describe("Só plantas com este número de quartos (quando conhecido)"),
  }),
  comparaveis: z.object({
    predio_id: z.uuid(),
    area_privativa: z.number().positive().optional().describe("Área privativa de referência em m²; sem ela, a planta mais comum do prédio"),
    meses: z.number().int().min(1).max(MCP_VENDAS_MESES_MAX).default(MCP_COMPARAVEIS_MESES_PADRAO),
    limite: z.number().int().min(1).max(MCP_COMPARAVEIS_LIMITE_MAX).default(MCP_COMPARAVEIS_LIMITE_PADRAO),
  }),
} as const;

/** Descrições (em português) que o agente lê. */
export const DESCRICOES: Record<keyof typeof ESQUEMAS, string> = {
  sobre: "O que é o Fechou por Quanto: bairros cobertos, fontes de dados, como o m² é calculado, o que significam os selos e a cobertura atual de cada bairro. Use para perguntas sobre o próprio serviço.",
  buscar_predio: "Acha até 5 prédios dos 10 bairros cobertos pelo endereço (similaridade de texto + número).",
  ficha_predio: "Ficha do prédio: plantas com área IPTU, área privativa, fator e selo de confiança, e se as vagas têm cadastro próprio.",
  vendas_predio: "Vendas reais (ITBI) do prédio na janela, com m² privativo e selo de cada uma, e a mediana do m² (regra 11.17).",
  m2_bairro: "Mediana, p25 e p75 do m² privativo das vendas do bairro, com o número de vendas, a distribuição por selo e a cobertura.",
  comparaveis: "Vendas parecidas no mesmo bairro: área privativa ±20% e década de construção ±1, primeiro na mesma rua, depois as mais recentes.",
};

/** O5: avaliação de saúde guardada por instância. */
let saude: { em: number; valor: { dados_desatualizados: boolean; motivo_desatualizacao: string | null } } | null = null;

/**
 * Campos comuns de toda resposta (13.2 + O5). Recebe: cliente e o instante. Devolve: fonte,
 * atualizado_em, dados_desatualizados e motivo_desatualizacao.
 */
export async function envelope(db: M2Client, agora = Date.now()) {
  if (!saude || agora - saude.em > MCP_SAUDE_CACHE_MS) {
    const relatorio = await loadHealth(db as never);
    saude = { em: agora, valor: { dados_desatualizados: !relatorio.ok, motivo_desatualizacao: relatorio.ok ? null : relatorio.motivos.join("; ") } };
  }
  return { fonte: FONTE, atualizado_em: await lastCalibration(db), ...saude.valor };
}

/** Só para os testes: zera o cache da saúde. */
export function resetHealthCache() {
  saude = null;
}

type Entrada<K extends keyof typeof ESQUEMAS> = z.output<(typeof ESQUEMAS)[K]>;

/** Executa uma ferramenta. Recebe: cliente, nome e entrada já validada. Devolve: o objeto da resposta. */
export async function runTool<K extends keyof typeof ESQUEMAS>(db: M2Client, nome: K, e: Entrada<K>): Promise<Record<string, unknown>> {
  const base = await envelope(db);
  switch (nome) {
    case "sobre":
      return { ...aboutPayload(await currentCoverage(db)), ...base };
    case "buscar_predio": {
      const predios = await searchBuilding(db, (e as Entrada<"buscar_predio">).endereco);
      return predios.length ? { predios, ...base } : { predios, mensagem: MENSAGENS_MCP.foraDaCobertura, ...base };
    }
    case "ficha_predio": {
      const ficha = await buildingFile(db, (e as Entrada<"ficha_predio">).predio_id);
      return ficha ? { ...ficha, ...base } : { mensagem: MENSAGENS_MCP.predioNaoEncontrado, ...base };
    }
    case "vendas_predio": {
      const x = e as Entrada<"vendas_predio">;
      const vendas = await buildingSales(db, x.predio_id, x.meses);
      return { predio_id: x.predio_id, meses: x.meses, vendas, mediana: medianSummary(vendas), ...(vendas.length ? {} : { mensagem: MENSAGENS_MCP.semVendas }), ...base };
    }
    case "m2_bairro": {
      const x = e as Entrada<"m2_bairro">;
      const r = await neighborhoodStats(db, x.bairro, x.meses, x.quartos ?? null);
      if (!r) return { mensagem: MENSAGENS_MCP.foraDaCobertura, ...base };
      return { ...r, meses: x.meses, quartos: x.quartos ?? null, ...base };
    }
    case "comparaveis": {
      const x = e as Entrada<"comparaveis">;
      const r = await comparableCandidates(db, x.predio_id, x.area_privativa ?? null, x.meses, MCP_COMPARAVEIS_FAIXA_AREA);
      if (!r) return { mensagem: MENSAGENS_MCP.predioNaoEncontrado, ...base };
      if (r.areaRef === null) {
        return { predio_id: x.predio_id, vendas: [], mensagem: "O prédio ainda não tem área privativa em nenhuma planta. Informe area_privativa.", ...base };
      }
      const vendas = pickComparables(r.candidatas, r.areaRef, decade(r.predio.ano_construcao), r.predio.logradouro, x.predio_id, x.limite);
      return {
        predio_id: x.predio_id, area_referencia: r.areaRef, origem_area_referencia: r.origemArea, meses: x.meses,
        vendas: vendas.map(({ predio_id, logradouro, numero, ano_construcao, ...v }) => ({ ...v, predio_id, endereco: `${logradouro}${numero ? `, ${numero}` : ""}`, ano_construcao })),
        mediana: medianSummary(vendas), ...base,
      };
    }
  }
  throw new Error(`Ferramenta desconhecida: ${String(nome)}`);
}

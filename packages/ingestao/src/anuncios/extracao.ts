/**
 * Extração de anúncios e páginas de condomínio (épico 8.5; seção 13.3; princípio 4).
 * O schema pede só os campos da 13.3; a resposta passa por uma ALLOWLIST positiva antes de virar
 * linha de m2_anuncios: qualquer chave fora da lista é ignorada (hook guard-coleta.sh e teste).
 */

/** Schema de extração da 13.3 (a regra "área útil/privativa, nunca área total" vai no prompt). */
export const SCHEMA_ANUNCIO = {
  type: "object",
  properties: {
    tipo_pagina: { type: "string", enum: ["anuncio", "pagina_condominio", "outro"] },
    logradouro: { type: "string" },
    numero: { type: "integer" },
    nome_condominio: { type: "string" },
    finalidade: { type: "string", enum: ["venda", "aluguel"] },
    area_privativa_m2: { type: "number" },
    area_privativa_min_m2: { type: "number" },
    area_privativa_max_m2: { type: "number" },
    quartos: { type: "integer" },
    vagas: { type: "integer" },
    andar: { type: "integer" },
    preco: { type: "number" },
  },
} as const;

/** Instrução da extração (13.3): só os campos do schema; área útil/privativa, nunca total. */
export const PROMPT_ANUNCIO =
  "Extraia apenas os campos do schema, sem acrescentar nada. tipo_pagina: 'anuncio' para um imóvel à venda ou para " +
  "alugar, 'pagina_condominio' para a página de um condomínio/edifício, 'outro' para qualquer outra página. " +
  "area_privativa_m2 é a área útil ou privativa do apartamento; nunca use a área total. Se a página traz área total " +
  "e área útil/privativa, use só a útil/privativa. Se a página do condomínio lista uma faixa de áreas (ex.: 70 a 89 m²), " +
  "preencha area_privativa_min_m2 e area_privativa_max_m2. preco é o valor pedido (venda ou aluguel). " +
  "Deixe vazio o que a página não informa.";

/** Campos de m2_anuncios que vêm da extração (7.2). Nenhum outro campo é aceito (princípio 4). */
export const CAMPOS_EXTRAIDOS = [
  "fonte",
  "logradouro_extraido",
  "numero_extraido",
  "nome_condominio",
  "finalidade",
  "area_privativa",
  "area_privativa_min",
  "area_privativa_max",
  "quartos",
  "vagas",
  "andar",
  "preco_pedido",
] as const;

export type AnuncioExtraido = {
  fonte: "anuncio" | "pagina_condominio";
  logradouro_extraido: string | null;
  numero_extraido: number | null;
  nome_condominio: string | null;
  finalidade: "venda" | "aluguel" | null;
  area_privativa: number | null;
  area_privativa_min: number | null;
  area_privativa_max: number | null;
  quartos: number | null;
  vagas: number | null;
  andar: number | null;
  preco_pedido: number | null;
};

/**
 * Converte a resposta da extração numa linha de m2_anuncios, só com os campos permitidos.
 * Recebe: o objeto devolvido pelo Firecrawl (qualquer formato). Devolve: os campos de
 * CAMPOS_EXTRAIDOS, ou nulo se a página for "outro" (13.3) ou não trouxer nenhum campo de
 * área (seção 12: "página sem nenhum campo de área → não grava").
 */
export function toAnuncio(resposta: unknown): AnuncioExtraido | null {
  if (!resposta || typeof resposta !== "object") return null;
  const r = resposta as Record<string, unknown>;
  const tipo = texto(r.tipo_pagina);
  if (tipo !== "anuncio" && tipo !== "pagina_condominio") return null;

  const area = positivo(r.area_privativa_m2);
  let min = positivo(r.area_privativa_min_m2);
  let max = positivo(r.area_privativa_max_m2);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  if (area === null && min === null && max === null) return null;

  const finalidade = texto(r.finalidade);
  return {
    fonte: tipo,
    logradouro_extraido: texto(r.logradouro),
    numero_extraido: inteiro(r.numero),
    nome_condominio: texto(r.nome_condominio),
    finalidade: finalidade === "venda" || finalidade === "aluguel" ? finalidade : null,
    area_privativa: area,
    area_privativa_min: min,
    area_privativa_max: max,
    quartos: inteiro(r.quartos),
    vagas: inteiro(r.vagas),
    andar: inteiro(r.andar),
    preco_pedido: positivo(r.preco),
  };
}

/** Texto limpo; "", "null" e "undefined" (vêm assim às vezes do Firecrawl) viram nulo. */
function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "null" || s === "undefined" ? null : s;
}

/** Número positivo (área, preço) ou nulo. */
function positivo(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(texto(v)?.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Inteiro não negativo (número do imóvel, quartos, vagas, andar) ou nulo. */
function inteiro(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(texto(v));
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** "Área total: 132 m²" e variações; o número pode ter casa decimal. */
const RE_AREA_TOTAL = /[áa]rea\s+total[^0-9\n]{0,20}(\d{1,4}(?:[.,]\d{1,2})?)\s*m(?:²|2)/gi;
/** "Área útil: 87 m²" / "Área privativa 87 m²". */
const RE_AREA_UTIL = /[áa]rea\s+(?:[úu]til|privativa)[^0-9\n]{0,20}(\d{1,4}(?:[.,]\d{1,2})?)\s*m(?:²|2)/gi;

/**
 * Seção 13.3: "se o texto traz 'área total' e 'área privativa/útil', só a privativa/útil é
 * aceita". A instrução vai no prompt, e esta checagem determinística garante a regra sobre o
 * texto da página: se a área extraída é igual a uma área total da página e diferente de toda área
 * útil/privativa, troca pela útil/privativa; se a página só tem área total, a área é descartada.
 * Recebe: anúncio extraído (ou nulo) e o markdown da página. Devolve: o anúncio corrigido, ou nulo
 * se ficar sem nenhum campo de área (seção 12: não grava).
 */
export function checkTotalArea(anuncio: AnuncioExtraido | null, markdown: string): AnuncioExtraido | null {
  if (!anuncio || anuncio.area_privativa === null) return anuncio;
  const valores = (re: RegExp) => [...markdown.matchAll(re)].map((m) => Number(m[1]!.replace(",", ".")));
  const totais = valores(RE_AREA_TOTAL);
  const uteis = valores(RE_AREA_UTIL);
  const igual = (a: number, b: number) => Math.abs(a - b) < 0.5;
  const area = anuncio.area_privativa;
  if (!totais.some((t) => igual(t, area)) || uteis.some((u) => igual(u, area))) return anuncio;
  const corrigido: AnuncioExtraido = { ...anuncio, area_privativa: uteis[0] ?? null };
  const temArea = corrigido.area_privativa !== null || corrigido.area_privativa_min !== null || corrigido.area_privativa_max !== null;
  return temArea ? corrigido : null;
}

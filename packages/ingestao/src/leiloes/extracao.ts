/**
 * Extração de editais de leilão (épico 8.5.1; seções 13.3 estendida, 13.4 e 20; princípio 4).
 * Página do lote (Firecrawl) e documento PDF (Claude API) passam pela MESMA allowlist positiva:
 * só os campos de m2_editais_leilao chegam ao insert. Qualquer outra chave da resposta é ignorada.
 */
import { z } from "zod";

/** Schema da página do lote: 13.3 com tipo_pagina = edital_leilao e os campos extras do 8.5.1. */
export const SCHEMA_PAGINA_LEILAO = {
  type: "object",
  properties: {
    tipo_pagina: { type: "string", enum: ["anuncio", "pagina_condominio", "edital_leilao", "outro"] },
    logradouro: { type: "string" },
    numero: { type: "integer" },
    complemento: { type: "string" },
    matricula: { type: "string" },
    area_privativa_m2: { type: "number" },
    area_total_m2: { type: "number" },
    vagas: { type: "integer" },
    valor_avaliacao: { type: "number" },
    data_leilao: { type: "string" },
    links_documentos: { type: "array", items: { type: "string" } },
  },
} as const;

/** Instrução da página do lote (13.3): área privativa/útil, nunca total; links dos PDFs do lote. */
export const PROMPT_PAGINA_LEILAO =
  "Extraia apenas os campos do schema, sem acrescentar nada. tipo_pagina: 'edital_leilao' para a página de " +
  "um lote de leilão de imóvel. area_privativa_m2 é a área privativa ou útil da unidade; nunca use a área total " +
  "nesse campo (a total vai em area_total_m2). matricula: só o número da matrícula. data_leilao: data da primeira " +
  "praça, no formato AAAA-MM-DD. Se a página listar mais de um lote, use só o lote do apartamento (nunca misture " +
  "campos de lotes diferentes, como a área de uma vaga). complemento: só a identificação da unidade (apartamento, " +
  "bloco), nunca outro número do endereço. links_documentos: URLs completas dos PDFs do lote (edital, laudo, matrícula). " +
  "Não transcreva nomes de pessoas nem números de documentos de identificação. Deixe vazio o que a página não informa.";

/** Schema da 13.4 para o PDF (Claude API, structured outputs). Campos opcionais = nulos. */
export const SCHEMA_DOCUMENTO = z.object({
  origem_documento: z.enum(["edital", "laudo", "matricula", "outro"]),
  logradouro: z.string().nullable(),
  numero: z.number().int().nullable(),
  complemento: z.string().nullable(),
  matricula: z.string().nullable(),
  cartorio: z.string().nullable(),
  area_privativa_m2: z.number().nullable(),
  area_comum_m2: z.number().nullable(),
  area_total_m2: z.number().nullable(),
  fracao_ideal: z.number().nullable(),
  vagas: z.number().int().nullable(),
  vagas_vinculadas_area: z.boolean().nullable(),
  valor_avaliacao: z.number().nullable(),
  data_leilao: z.string().nullable(),
});

/** Instrução do PDF (13.4): só os campos; nada de dados de pessoas nem outros trechos. */
export const PROMPT_DOCUMENTO =
  "Este é um documento de leilão de imóvel (edital, laudo de avaliação ou matrícula). Preencha apenas os campos " +
  "do schema, sobre a unidade leiloada. Não transcreva nomes de pessoas, números de documentos de identificação, " +
  "dados de qualificação de pessoas nem qualquer outro trecho do documento. area_privativa_m2: área privativa ou " +
  "útil da unidade (nunca a área total). vagas: quantidade de vagas de garagem da unidade. vagas_vinculadas_area: " +
  "true se o documento diz que as vagas estão incluídas na área da unidade (vaga indeterminada ou sem matrícula " +
  "própria). matricula: só os dígitos. data_leilao: primeira praça, AAAA-MM-DD. origem_documento 'outro' se o " +
  "documento não for edital, laudo nem matrícula de imóvel. Use null quando o documento não informar.";

/** Campos de m2_editais_leilao que vêm da extração (7.2). Nenhum outro é aceito (seção 20). */
export const CAMPOS_EDITAL = [
  "url_documento",
  "logradouro_extraido",
  "numero_extraido",
  "complemento_extraido",
  "matricula",
  "cartorio",
  "area_privativa",
  "area_comum",
  "area_total",
  "fracao_ideal",
  "vagas",
  "vagas_vinculadas_area",
  "valor_avaliacao",
  "data_leilao",
  "origem_documento",
] as const;

export type EditalExtraido = {
  url_documento: string | null;
  logradouro_extraido: string | null;
  numero_extraido: number | null;
  complemento_extraido: string | null;
  matricula: string | null;
  cartorio: string | null;
  area_privativa: number | null;
  area_comum: number | null;
  area_total: number | null;
  fracao_ideal: number | null;
  vagas: number | null;
  vagas_vinculadas_area: boolean | null;
  valor_avaliacao: number | null;
  data_leilao: string | null;
  origem_documento: "pagina" | "edital" | "laudo" | "matricula";
};

/**
 * Página do lote → edital (allowlist). Recebe: objeto do Firecrawl. Devolve: o edital (sem
 * url_documento) e os links de PDF, ou nulo se a página não for de leilão.
 */
export function fromLotPage(resposta: unknown): { edital: EditalExtraido; links: string[] } | null {
  if (!resposta || typeof resposta !== "object") return null;
  const r = resposta as Record<string, unknown>;
  if (texto(r.tipo_pagina) !== "edital_leilao") return null;
  const links = Array.isArray(r.links_documentos) ? r.links_documentos.map(texto).filter((x): x is string => !!x) : [];
  return {
    edital: {
      url_documento: null,
      logradouro_extraido: texto(r.logradouro),
      numero_extraido: inteiro(r.numero),
      complemento_extraido: texto(r.complemento),
      matricula: digitos(r.matricula),
      cartorio: null,
      area_privativa: positivo(r.area_privativa_m2),
      area_comum: null,
      area_total: coherentTotal(positivo(r.area_total_m2), positivo(r.area_privativa_m2)),
      fracao_ideal: null,
      vagas: inteiro(r.vagas),
      vagas_vinculadas_area: null,
      valor_avaliacao: positivo(r.valor_avaliacao),
      data_leilao: data(r.data_leilao),
      origem_documento: "pagina",
    },
    links,
  };
}

/**
 * Resposta da Claude API (13.4) → edital, passando pela allowlist (seção 20: "um filtro de chaves
 * garante isso antes do insert"). Recebe: objeto devolvido pelo modelo e a URL do PDF.
 * Devolve: o edital, ou nulo se origem_documento = 'outro' ou não houver nenhuma área (13.4).
 */
export function fromDocument(resposta: unknown, urlDocumento: string): EditalExtraido | null {
  if (!resposta || typeof resposta !== "object") return null;
  const r = resposta as Record<string, unknown>;
  const origem = texto(r.origem_documento);
  if (origem !== "edital" && origem !== "laudo" && origem !== "matricula") return null;
  const edital: EditalExtraido = {
    url_documento: urlDocumento,
    logradouro_extraido: texto(r.logradouro),
    numero_extraido: inteiro(r.numero),
    complemento_extraido: texto(r.complemento),
    matricula: digitos(r.matricula),
    cartorio: texto(r.cartorio),
    area_privativa: positivo(r.area_privativa_m2),
    area_comum: positivo(r.area_comum_m2),
    area_total: coherentTotal(positivo(r.area_total_m2), positivo(r.area_privativa_m2)),
    fracao_ideal: fracao(r.fracao_ideal),
    vagas: inteiro(r.vagas),
    vagas_vinculadas_area: typeof r.vagas_vinculadas_area === "boolean" ? r.vagas_vinculadas_area : null,
    valor_avaliacao: positivo(r.valor_avaliacao),
    data_leilao: data(r.data_leilao),
    origem_documento: origem,
  };
  return edital.area_privativa === null && edital.area_total === null && edital.area_comum === null ? null : edital;
}

/** Texto limpo; "", "null" e "undefined" viram nulo. */
function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "null" || s === "undefined" ? null : s;
}

/**
 * Número positivo (área, valor) ou nulo. Em texto, "1.234,56" (ponto de milhar e vírgula decimal)
 * e "184.32" (ponto decimal) são aceitos: o ponto só é milhar quando há vírgula decimal.
 */
function positivo(v: unknown): number | null {
  const s = texto(v);
  const n = typeof v === "number" ? v : Number(s?.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Área total coerente com a privativa: na mesma unidade, a total nunca é menor. Menor indica que a
 * extração pegou a área de outro lote da página (ex.: a vaga listada junto com o apartamento).
 * Recebe: área total e área privativa. Devolve: a total, ou nulo se for impossível.
 */
export function coherentTotal(total: number | null, privativa: number | null): number | null {
  return total !== null && privativa !== null && total < privativa ? null : total;
}

/** Inteiro não negativo ou nulo. */
function inteiro(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(texto(v));
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** Fração ideal entre 0 e 1 (numeric(8,6)) ou nula. */
function fracao(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(texto(v)?.replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 1 ? Math.round(n * 1e6) / 1e6 : null;
}

/** Só os dígitos, sem zeros à esquerda (como a matrícula das guias, itbi/guias.ts), ou nulo. */
function digitos(v: unknown): string | null {
  const d = (texto(v) ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d || null;
}

/** Data AAAA-MM-DD (aceita dd/mm/aaaa) ou nula. */
function data(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
}

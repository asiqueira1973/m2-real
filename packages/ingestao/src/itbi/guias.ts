/**
 * Guias do ITBI: conversão de uma linha da planilha e regras puras (épico 8.3).
 * Regras: 11.1 (hash_linha), 7.2 (eh_compra_venda), 11.14 (unidade sem cadastro próprio).
 */
import { createHash } from "node:crypto";
import {
  NATUREZA_COMPRA_VENDA_PREFIXO,
  UNIDADE_SEM_CADASTRO_FRACAO_MINIMA,
  UNIDADE_SEM_CADASTRO_REGEX,
} from "../config/regras.js";
import { normalizeText } from "../shared/endereco.js";
import type { CampoItbi } from "./colunas.js";

/** Uma guia lida da planilha, já convertida (campos de m2_transacoes, menos os de ligação). */
export interface Guia {
  hashLinha: string;
  sql: string; // 11 dígitos, zero à esquerda (7.2)
  logradouro: string;
  numero: number | null;
  complemento: string | null;
  bairroCampo: string | null; // só para a regra 11.2; não é gravado
  cep: string | null; // 8 dígitos
  natureza: string;
  ehCompraVenda: boolean;
  dataTransacao: string; // AAAA-MM-DD
  mesReferencia: string; // AAAA-MM-01 (aba)
  valorDeclarado: number;
  valorVenalReferencia: number | null;
  baseCalculo: number | null;
  proporcaoTransmitida: number | null; // fração 0–1 (a planilha traz %)
  tipoFinanciamento: string | null;
  valorFinanciado: number;
  cartorio: string | null;
  matricula: string | null; // só dígitos
  usoIptuGuia: string | null;
  areaConstruidaGuia: number | null;
  fracaoIdealGuia: number | null;
  unidadeSemCadastroProprio: boolean;
}

const MESES: Readonly<Record<string, string>> = {
  JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
  JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12",
};

/**
 * Mês de referência da aba (7.2: "primeiro dia do mês de pagamento do imposto").
 * Recebe: nome da aba ("JAN-2025"). Devolve: "2025-01-01", ou nulo se não for aba mensal
 * (LEGENDA, EXPLICAÇÕES, tabelas auxiliares são ignoradas).
 */
export function sheetMonth(nome: string): string | null {
  const m = nome.trim().toUpperCase().match(/^([A-Z]{3})-(\d{4})$/);
  const mes = m && MESES[m[1]!];
  return m && mes ? `${m[2]}-${mes}-01` : null;
}

/**
 * Regra 11.1: hash da linha = SHA-256 dos valores originais das colunas, na ordem da planilha,
 * em texto estável e unidos por "|". Data → AAAA-MM-DD; número → String; vazio → "".
 * Recebe: valores da linha. Devolve: hash hexadecimal.
 */
export function hashRow(valores: readonly unknown[]): string {
  const texto = valores.map(cellText).join("|");
  return createHash("sha256").update(texto).digest("hex");
}

/** Seção 7.2: eh_compra_venda = natureza começa com "1.". Recebe: natureza. Devolve: boolean. */
export function isPurchase(natureza: string): boolean {
  return natureza.trim().startsWith(NATUREZA_COMPRA_VENDA_PREFIXO);
}

/**
 * Regra 11.14: guia com fração ideal ≥ 1 (ou nula) e complemento que indica unidade
 * ("AP", "APTO", "BL", "SALA"…) é de uma unidade sem cadastro próprio no IPTU.
 * Recebe: fração ideal e complemento. Devolve: boolean.
 */
export function isUnitWithoutOwnRecord(fracaoIdeal: number | null, complemento: string | null): boolean {
  const fracaoDoLote = fracaoIdeal === null || fracaoIdeal >= UNIDADE_SEM_CADASTRO_FRACAO_MINIMA;
  return fracaoDoLote && UNIDADE_SEM_CADASTRO_REGEX.test(normalizeText(complemento));
}

/**
 * Converte uma linha da aba numa Guia.
 * Recebe: valores da linha (0-based, ordem original), mapa de colunas e o mês da aba.
 * Devolve: a guia, ou nulo se a linha não tiver SQL válido, natureza, data ou valor
 * (linha vazia ou de rodapé).
 */
export function toGuia(valores: readonly unknown[], col: Record<CampoItbi, number>, mesReferencia: string): Guia | null {
  const v = (c: CampoItbi) => valores[col[c]];
  const sql = digits(v("sql")).padStart(11, "0");
  const natureza = text(v("natureza"));
  const dataTransacao = toDate(v("dataTransacao"));
  const valorDeclarado = toNumber(v("valorDeclarado"));
  if (sql.length !== 11 || /^0+$/.test(sql) || !natureza || !dataTransacao || valorDeclarado === null) return null;

  const complemento = text(v("complemento"));
  const fracaoIdeal = toNumber(v("fracaoIdeal"));
  const cepDigitos = digits(v("cep"));
  const proporcao = toNumber(v("proporcaoTransmitida"));
  const matricula = digits(v("matricula")).replace(/^0+/, "");
  return {
    hashLinha: hashRow(valores),
    sql,
    logradouro: text(v("logradouro")) ?? "",
    numero: toInt(v("numero")),
    complemento,
    bairroCampo: text(v("bairro")),
    cep: cepDigitos && !/^0+$/.test(cepDigitos) ? cepDigitos.padStart(8, "0") : null,
    natureza,
    ehCompraVenda: isPurchase(natureza),
    dataTransacao,
    mesReferencia,
    valorDeclarado,
    valorVenalReferencia: toNumber(v("valorVenalReferencia")),
    baseCalculo: toNumber(v("baseCalculo")),
    // A planilha traz percentual (100 = tudo); m2_transacoes.proporcao_transmitida é numeric(6,4): guardamos a fração.
    // A coluna é "Proporção Transmitida (%)": sempre percentual (100 = tudo, 1 = 1%).
    proporcaoTransmitida: proporcao === null ? null : Math.round((proporcao / 100) * 10000) / 10000,
    tipoFinanciamento: text(v("tipoFinanciamento")),
    valorFinanciado: toNumber(v("valorFinanciado")) ?? 0,
    cartorio: text(v("cartorio")),
    matricula: matricula || null,
    usoIptuGuia: text(v("usoDescricao")),
    areaConstruidaGuia: toNumber(v("areaConstruida")),
    fracaoIdealGuia: fracaoIdeal,
    unidadeSemCadastroProprio: isUnitWithoutOwnRecord(fracaoIdeal, complemento),
  };
}

/** Texto estável de uma célula para o hash (regra 11.1). */
function cellText(c: unknown): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  if (typeof c === "object") {
    // Células ricas do exceljs (texto formatado, fórmula com resultado).
    const o = c as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return String(o.text);
  }
  return String(c).trim();
}

/** Texto limpo ou nulo. Recebe: célula. Devolve: texto sem espaços nas pontas, ou nulo se vazio. */
function text(c: unknown): string | null {
  const t = cellText(c);
  return t ? t : null;
}

/** Só os dígitos da célula (SQL, CEP, matrícula). */
function digits(c: unknown): string {
  return cellText(c).replace(/\D/g, "");
}

/** Número da célula (aceita vírgula decimal). Devolve nulo se vazio/ilegível. */
function toNumber(c: unknown): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const t = cellText(c);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

/** Inteiro da célula; 0 conta como ausente (número do imóvel "S/N"). */
function toInt(c: unknown): number | null {
  const n = toNumber(c);
  return n === null || n === 0 ? null : Math.trunc(n);
}

/**
 * Data da célula em AAAA-MM-DD. Aceita Date (exceljs), número serial do Excel e "dd/mm/aaaa".
 * Devolve nulo se ilegível.
 */
export function toDate(c: unknown): string | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  if (typeof c === "number" && c > 0) {
    // Serial do Excel: dias desde 1899-12-30.
    return new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86_400_000).toISOString().slice(0, 10);
  }
  const m = cellText(c).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const ano = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${ano}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

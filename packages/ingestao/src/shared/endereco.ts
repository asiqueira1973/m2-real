/**
 * Normalização de texto e endereço (regra 11.5), espelho em TypeScript da função
 * SQL public.m2_normalizar_endereco. A ingestão grava m2_predios.logradouro já
 * normalizado; a busca do banco compara contra esse texto. Os testes rodam os mesmos
 * casos do pgTAP (supabase/tests/030_funcoes.test.sql).
 */

/** Abreviações da regra 11.5, aplicadas só a palavras inteiras. */
const ABREVIACOES: ReadonlyArray<readonly [string, string]> = [
  ["R", "RUA"],
  ["AV", "AVENIDA"],
  ["AL", "ALAMEDA"],
  ["PCA", "PRACA"],
  ["DR", "DOUTOR"],
  ["PROF", "PROFESSOR"],
  ["CEL", "CORONEL"],
  ["MIN", "MINISTRO"],
  ["CAP", "CAPITAO"],
  ["SEN", "SENADOR"],
  ["VER", "VEREADOR"],
];

/**
 * Tira acentos, passa para maiúsculas e deixa espaços simples (regra 11.2: "campo
 * bairro normalizado"; base da regra 11.5).
 * Recebe: texto (ou nulo/indefinido). Devolve: texto limpo, ou "" se vazio.
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza um endereço pela regra 11.5: sem acento, maiúsculas, sem pontuação,
 * espaços simples e abreviações padronizadas (R→RUA, AV→AVENIDA…).
 * Recebe: texto livre. Devolve: texto normalizado ("" se vazio).
 */
export function normalizeAddress(text: string | null | undefined): string {
  let t = normalizeText(text);
  // Sem pontuação: tudo que não é letra, dígito ou espaço vira espaço.
  t = t.replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const [short, long] of ABREVIACOES) {
    t = t.replace(new RegExp(`\\b${short}\\b`, "g"), long);
  }
  return t;
}

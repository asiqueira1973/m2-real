/**
 * Colunas do IPTU usadas pela ingestão (épico 8.2; resolve a premissa PV3).
 *
 * Conferidas em 21/11/2026 contra o Dicionario_dados_IPTU.xlsx (metadados GeoSampa,
 * registro b971efa1-aad5-42f3-ad28-18f1f4efe270) e contra o cabeçalho real do
 * IPTU_2026.csv (29 colunas, separador ";", UTF-8, fim de linha CRLF).
 *
 * É uma ALLOWLIST (seção 20): só estas colunas são lidas; qualquer outra — inclusive
 * uma eventual coluna de nome de contribuinte — é ignorada no parser e nunca chega ao insert.
 */
import type { IptuRow } from "./montagem.js";

/** Nome da coluna no CSV → campo interno. Todas obrigatórias: faltando uma, a execução falha. */
export const COLUNAS_IPTU = {
  "NUMERO DO CONTRIBUINTE": "sql",
  "ANO DO EXERCICIO": "exercicio",
  "NUMERO DO CONDOMINIO": "numeroCondominio",
  "NOME DE LOGRADOURO DO IMOVEL": "logradouro",
  "NUMERO DO IMOVEL": "numero",
  "COMPLEMENTO DO IMOVEL": "complemento",
  "BAIRRO DO IMOVEL": "bairro",
  "CEP DO IMOVEL": "cep",
  "FRACAO IDEAL": "fracaoIdeal",
  "AREA CONSTRUIDA": "areaConstruida",
  "ANO DA CONSTRUCAO CORRIGIDO": "anoConstrucao",
  "QUANTIDADE DE PAVIMENTOS": "pavimentos",
  "TIPO DE USO DO IMOVEL": "uso",
  "TIPO DE PADRAO DA CONSTRUCAO": "padrao",
} as const satisfies Record<string, keyof IptuRow>;

export type ColunaIptu = keyof typeof COLUNAS_IPTU;

/**
 * Confere o cabeçalho do arquivo.
 * Recebe: nomes das colunas lidas. Devolve: nada; lança erro listando as colunas
 * obrigatórias ausentes (mensagem vai para mensagem_erro da execução, seção 12).
 */
export function assertHeader(header: readonly string[]): void {
  const presentes = new Set(header.map((h) => h.trim().toUpperCase()));
  const faltando = Object.keys(COLUNAS_IPTU).filter((c) => !presentes.has(c));
  if (faltando.length) {
    throw new Error(`Arquivo do IPTU sem colunas obrigatórias: ${faltando.join(", ")} (iptu/colunas.ts, PV3).`);
  }
}

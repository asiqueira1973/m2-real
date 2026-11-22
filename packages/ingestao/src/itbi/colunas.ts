/**
 * Colunas do ITBI usadas pela ingestão (épico 8.3; critério "abas com 28 ou 29 colunas
 * lidas pelo nome do cabeçalho, não pela posição").
 *
 * Conferido em 22/11/2026 nas planilhas de 2021 a 2026:
 * - 28 colunas em todas, mas com variações: em 2021, 2022 e NOV/DEZ-2023 o cabeçalho não tem
 *   "Descrição do padrão (IPTU)" e repete "ACC (IPTU)" (a 1ª "ACC" guarda a descrição do padrão);
 *   em FEV-2026 aparece o erro de grafia "Descrição do pardão (IPTU)".
 * - Nenhuma dessas colunas variáveis é gravada em m2_transacoes. Por isso só as colunas abaixo
 *   são mapeadas (por nome normalizado); as demais são ignoradas, inclusive duplicadas.
 */

/** Campos internos lidos da guia. */
export type CampoItbi =
  | "sql" | "logradouro" | "numero" | "complemento" | "bairro" | "cep" | "natureza"
  | "valorDeclarado" | "dataTransacao" | "valorVenalReferencia" | "baseCalculo" | "proporcaoTransmitida"
  | "tipoFinanciamento" | "valorFinanciado" | "cartorio" | "matricula" | "fracaoIdeal" | "areaConstruida"
  | "usoDescricao";

/**
 * Nome normalizado do cabeçalho → campo. Normalização: sem acento, minúsculas, tudo que não é
 * letra ou dígito vira espaço, espaços simples ("N° do Cadastro (SQL)" → "n do cadastro sql").
 * Todas obrigatórias.
 */
export const COLUNAS_ITBI: Readonly<Record<CampoItbi, readonly string[]>> = {
  sql: ["n do cadastro sql", "no do cadastro sql", "numero do cadastro sql"],
  logradouro: ["nome do logradouro"],
  numero: ["numero"],
  complemento: ["complemento"],
  bairro: ["bairro"],
  cep: ["cep"],
  natureza: ["natureza de transacao"],
  valorDeclarado: ["valor de transacao declarado pelo contribuinte"],
  dataTransacao: ["data de transacao"],
  // 7.2: valor_venal_referencia é o "proporcional" (não o "Valor Venal de Referência" cheio).
  valorVenalReferencia: ["valor venal de referencia proporcional"],
  baseCalculo: ["base de calculo adotada"],
  proporcaoTransmitida: ["proporcao transmitida"],
  tipoFinanciamento: ["tipo de financiamento"],
  valorFinanciado: ["valor financiado"],
  cartorio: ["cartorio de registro"],
  matricula: ["matricula do imovel"],
  fracaoIdeal: ["fracao ideal"],
  areaConstruida: ["area construida m2", "area construida"],
  // "Uso (IPTU)" é código; a regra 11.3 compara a descrição.
  usoDescricao: ["descricao do uso iptu"],
};

/**
 * Normaliza um nome de cabeçalho para comparação.
 * Recebe: texto do cabeçalho. Devolve: texto normalizado (ver COLUNAS_ITBI).
 */
export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Descobre a posição (0-based) de cada campo no cabeçalho de uma aba.
 * Recebe: valores da 1ª linha da aba. Devolve: campo → índice da coluna.
 * Lança erro listando os campos sem coluna (vai para mensagem_erro, seção 12).
 * Com cabeçalho repetido, vale a 1ª ocorrência.
 */
export function mapHeader(header: readonly unknown[], aba: string): Record<CampoItbi, number> {
  const posicoes = new Map<string, number>();
  header.forEach((h, i) => {
    const n = normalizeHeader(h);
    if (n && !posicoes.has(n)) posicoes.set(n, i);
  });
  const mapa = {} as Record<CampoItbi, number>;
  const faltando: string[] = [];
  for (const [campo, nomes] of Object.entries(COLUNAS_ITBI) as [CampoItbi, readonly string[]][]) {
    const i = nomes.map((n) => posicoes.get(n)).find((x) => x !== undefined);
    if (i === undefined) faltando.push(nomes[0]!);
    else mapa[campo] = i;
  }
  if (faltando.length) {
    throw new Error(`Aba ${aba} do ITBI sem colunas obrigatórias: ${faltando.join(", ")} (itbi/colunas.ts).`);
  }
  return mapa;
}

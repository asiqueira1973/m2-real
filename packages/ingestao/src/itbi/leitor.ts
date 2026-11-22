/**
 * Leitura da planilha do ITBI em streaming (seção 4.2; épico 8.3). Usa shared/xlsx.ts e não o
 * streaming do exceljs, que falha quando workbook.xml vem no fim do zip (planilha real de 2024).
 * Só as abas mensais ("JAN-2025"…) são lidas; LEGENDA, EXPLICAÇÕES e tabelas auxiliares
 * são ignoradas. As colunas são achadas pelo nome do cabeçalho em cada aba (itbi/colunas.ts);
 * aba sem cabeçalho usa o de outra aba do arquivo (planilha real de 2024).
 */
import { readFirstRows, readRows, type CellValue } from "../shared/xlsx.js";
import { mapHeader } from "./colunas.js";
import { sheetMonth, toGuia, type Guia } from "./guias.js";

export interface ItbiReadResult {
  /** Ano dos dados (das abas mensais). */
  ano: number;
  guias: Guia[];
  /** Linhas de dados lidas nas abas mensais (sem o cabeçalho). */
  linhasLidas: number;
  /** Linhas sem SQL, natureza, data ou valor (rodapé, linha vazia). */
  invalidas: number;
  /** Linhas por aba, para o log da execução. */
  porAba: Record<string, number>;
}

/**
 * Lê a planilha inteira (abas mensais), em stream, pelo leitor de shared/xlsx.ts.
 * Recebe: conteúdo do .xlsx. Devolve: guias de todas as abas mensais e contagens.
 * Lança erro se não houver aba mensal, se as abas forem de anos diferentes ou se faltar
 * coluna obrigatória numa aba (mensagem vai para a execução, seção 12).
 */
export async function readItbiWorkbook(buffer: Buffer): Promise<ItbiReadResult> {
  const result: ItbiReadResult = { ano: 0, guias: [], linhasLidas: 0, invalidas: 0, porAba: {} };
  const anos = new Set<number>();
  const colunas = await headersBySheet(buffer);
  const cabecalhoVisto = new Set<string>();

  await readRows(
    buffer,
    (aba) => sheetMonth(aba) !== null, // LEGENDA, EXPLICAÇÕES e tabelas auxiliares ficam de fora
    (aba, _linha, valores) => {
      const mes = sheetMonth(aba)!;
      const { col, temCabecalho } = colunas.get(aba)!;
      if (!(aba in result.porAba)) {
        anos.add(Number(mes.slice(0, 4)));
        result.porAba[aba] = 0;
      }
      if (temCabecalho && !cabecalhoVisto.has(aba)) {
        cabecalhoVisto.add(aba); // a 1ª linha é o cabeçalho, não dado
        return;
      }
      if (valores.every((v) => v === null || v === "")) return; // linha vazia
      result.porAba[aba]!++;
      result.linhasLidas++;
      const guia = toGuia(valores, col, mes);
      if (guia) result.guias.push(guia);
      else result.invalidas++;
    },
  );

  if (anos.size === 0) throw new Error("Planilha do ITBI sem abas mensais (ex.: JAN-2025).");
  if (anos.size > 1) throw new Error(`Planilha do ITBI com abas de anos diferentes: ${[...anos].sort().join(", ")}.`);
  result.ano = [...anos][0]!;
  return result;
}

/**
 * Colunas de cada aba mensal pelo nome do cabeçalho (critério do 8.3).
 * Aba cuja 1ª linha não é cabeçalho (planilha real de 2024: JAN e OUT vêm sem ele) usa o
 * cabeçalho de outra aba mensal do mesmo arquivo com pelo menos tantas colunas, e a 1ª linha
 * conta como dado. Recebe: o .xlsx. Devolve: aba → {colunas, se tem cabeçalho próprio}.
 * Lança erro se uma aba sem cabeçalho não achar cabeçalho compatível no arquivo.
 */
async function headersBySheet(buffer: Buffer): Promise<Map<string, { col: ReturnType<typeof mapHeader>; temCabecalho: boolean }>> {
  const primeiras = await readFirstRows(buffer, (aba) => sheetMonth(aba) !== null);
  const proprios = new Map<string, { col: ReturnType<typeof mapHeader>; tamanho: number }>();
  for (const [aba, linha] of primeiras) {
    const col = tryMapHeader(linha, aba);
    if (col) proprios.set(aba, { col, tamanho: linha.length });
  }
  const resultado = new Map<string, { col: ReturnType<typeof mapHeader>; temCabecalho: boolean }>();
  for (const [aba, linha] of primeiras) {
    const proprio = proprios.get(aba);
    if (proprio) {
      resultado.set(aba, { col: proprio.col, temCabecalho: true });
      continue;
    }
    // Compatível: cabeçalho com pelo menos tantas colunas quanto a linha (células vazias no fim
    // da linha muitas vezes nem são gravadas no arquivo, então a linha pode vir mais curta).
    const emprestado = [...proprios.values()].sort((a, b) => a.tamanho - b.tamanho).find((p) => p.tamanho >= linha.length);
    if (!emprestado) {
      // Sem cabeçalho próprio nem compatível: a mensagem de mapHeader diz quais colunas faltam.
      try {
        mapHeader(linha, aba);
      } catch (e) {
        throw new Error(`Aba ${aba} do ITBI sem cabeçalho e sem outra aba com cabeçalho compatível no arquivo. ${(e as Error).message}`);
      }
    }
    resultado.set(aba, { col: emprestado!.col, temCabecalho: false });
  }
  return resultado;
}

/** mapHeader que devolve nulo em vez de lançar erro (para testar se a linha é cabeçalho). */
function tryMapHeader(linha: CellValue[], aba: string): ReturnType<typeof mapHeader> | null {
  try {
    return mapHeader(linha, aba);
  } catch {
    return null;
  }
}

/**
 * Leitura da planilha do ITBI em streaming (seção 4.2: exceljs WorkbookReader; épico 8.3).
 * Só as abas mensais ("JAN-2025"…) são lidas; LEGENDA, EXPLICAÇÕES e tabelas auxiliares
 * são ignoradas. As colunas são achadas pelo nome do cabeçalho em cada aba (itbi/colunas.ts).
 */
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
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
 * Lê a planilha inteira.
 * Recebe: caminho do .xlsx ou o conteúdo em Buffer. Devolve: guias de todas as abas mensais.
 * Lança erro se não houver aba mensal, se as abas forem de anos diferentes ou se faltar
 * coluna obrigatória numa aba (mensagem vai para a execução, seção 12).
 */
export async function readItbiWorkbook(source: string | Buffer): Promise<ItbiReadResult> {
  const input = typeof source === "string" ? source : Readable.from(source);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(input, {
    sharedStrings: "cache",
    worksheets: "emit",
    styles: "cache", // necessário para o exceljs reconhecer células de data
    hyperlinks: "ignore",
  });
  const result: ItbiReadResult = { ano: 0, guias: [], linhasLidas: 0, invalidas: 0, porAba: {} };
  const anos = new Set<number>();

  for await (const ws of reader) {
    const nome = (ws as unknown as { name: string }).name;
    const mes = sheetMonth(nome);
    if (!mes) {
      // Consome a aba auxiliar sem processar (o stream precisa ser drenado).
      for await (const _ of ws) void _;
      continue;
    }
    anos.add(Number(mes.slice(0, 4)));
    let col: ReturnType<typeof mapHeader> | null = null;
    let n = 0;
    for await (const row of ws) {
      const valores = (row.values as unknown[]).slice(1); // exceljs é 1-based
      if (!col) {
        col = mapHeader(valores, nome);
        continue;
      }
      n++;
      const guia = toGuia(valores, col, mes);
      if (guia) result.guias.push(guia);
      else result.invalidas++;
    }
    result.porAba[nome] = n;
    result.linhasLidas += n;
  }

  if (anos.size === 0) throw new Error("Planilha do ITBI sem abas mensais (ex.: JAN-2025).");
  if (anos.size > 1) throw new Error(`Planilha do ITBI com abas de anos diferentes: ${[...anos].sort().join(", ")}.`);
  result.ano = [...anos][0]!;
  return result;
}

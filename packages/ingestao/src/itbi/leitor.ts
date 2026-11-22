/**
 * Leitura da planilha do ITBI em streaming (seção 4.2; épico 8.3). Usa shared/xlsx.ts e não o
 * streaming do exceljs, que falha quando workbook.xml vem no fim do zip (planilha real de 2024).
 * Só as abas mensais ("JAN-2025"…) são lidas; LEGENDA, EXPLICAÇÕES e tabelas auxiliares
 * são ignoradas. As colunas são achadas pelo nome do cabeçalho em cada aba (itbi/colunas.ts).
 */
import { readRows } from "../shared/xlsx.js";
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
  const colunas = new Map<string, ReturnType<typeof mapHeader>>();

  await readRows(
    buffer,
    (aba) => sheetMonth(aba) !== null, // LEGENDA, EXPLICAÇÕES e tabelas auxiliares ficam de fora
    (aba, _linha, valores) => {
      const mes = sheetMonth(aba)!;
      const col = colunas.get(aba);
      if (!col) {
        // 1ª linha da aba = cabeçalho; colunas pelo nome (8.3).
        colunas.set(aba, mapHeader(valores, aba));
        anos.add(Number(mes.slice(0, 4)));
        result.porAba[aba] = 0;
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

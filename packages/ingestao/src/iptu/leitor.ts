/**
 * Leitura do arquivo do IPTU em stream (épico 8.2; seção 4.2: csv-parse em stream,
 * filtrando por CEP antes de gravar). O CSV completo tem ~900 MB e milhões de linhas;
 * só as linhas com CEP dos bairros cobertos são guardadas em memória.
 */
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { parse } from "csv-parse";
import yauzl from "yauzl";
import { assertHeader, COLUNAS_IPTU, type ColunaIptu } from "./colunas.js";
import type { IptuRow } from "./montagem.js";

export interface IptuReadResult {
  rows: IptuRow[];
  linhasLidas: number;
  /** Linhas fora dos prefixos de CEP dos bairros cobertos (descarte esperado, não é erro). */
  foraDosBairros: number;
  /** Linhas dentro dos bairros, mas inválidas (SQL ou área ilegível). */
  invalidas: number;
}

/**
 * Abre o CSV de dentro de um ZIP (primeira entrada .csv) como stream, sem extrair em disco.
 * Recebe: caminho do .zip ou o conteúdo em Buffer (lido do Storage). Devolve: stream do CSV.
 */
export function openZippedCsv(source: string | Buffer): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const onZip = (err: Error | null, zip?: yauzl.ZipFile) => {
      if (err || !zip) return reject(err ?? new Error("ZIP do IPTU ilegível."));
      zip.on("entry", (entry: yauzl.Entry) => {
        if (!entry.fileName.toLowerCase().endsWith(".csv")) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => (e || !stream ? reject(e) : resolve(stream)));
      });
      zip.on("end", () => reject(new Error("O ZIP do IPTU não contém nenhum arquivo .csv.")));
      zip.readEntry();
    };
    if (typeof source === "string") yauzl.open(source, { lazyEntries: true }, onZip);
    else yauzl.fromBuffer(source, { lazyEntries: true }, onZip);
  });
}

/**
 * Abre o arquivo do IPTU (.zip ou .csv) como stream de texto CSV.
 * Recebe: caminho local ou Buffer, e o nome (para saber a extensão). Devolve: stream.
 */
export async function openIptuFile(source: string | Buffer, nome: string): Promise<Readable> {
  if (nome.toLowerCase().endsWith(".zip")) return openZippedCsv(source);
  if (typeof source === "string") return createReadStream(source);
  const { Readable } = await import("node:stream");
  return Readable.from(source);
}

/**
 * Lê as linhas do IPTU e guarda só as dos bairros cobertos.
 * Recebe: stream do CSV (";", UTF-8, cabeçalho na 1ª linha) e os prefixos de CEP aceitos (11.2).
 * Devolve: linhas já convertidas pela allowlist de colunas (sem dado pessoal, seção 20) e contagens.
 * Lança erro se faltar coluna obrigatória (iptu/colunas.ts).
 */
export async function readIptuRows(input: Readable, prefixosCep: readonly string[]): Promise<IptuReadResult> {
  const parser = input.pipe(
    parse({ delimiter: ";", bom: true, relax_quotes: true, relax_column_count: true, trim: true, columns: (h: string[]) => { assertHeader(h); return h.map((c) => c.trim().toUpperCase()); } }),
  );
  const result: IptuReadResult = { rows: [], linhasLidas: 0, foraDosBairros: 0, invalidas: 0 };
  for await (const rec of parser as AsyncIterable<Record<string, string>>) {
    result.linhasLidas++;
    const cep = digits(rec["CEP DO IMOVEL"]);
    if (!prefixosCep.some((p) => cep.startsWith(p))) {
      result.foraDosBairros++;
      continue;
    }
    const row = toRow(rec, cep);
    if (row) result.rows.push(row);
    else result.invalidas++;
  }
  return result;
}

/**
 * Converte um registro do CSV em IptuRow usando SÓ as colunas da allowlist.
 * Recebe: registro (todas as colunas) e o CEP já limpo. Devolve: a linha, ou nulo se o
 * SQL não tiver 11 dígitos ou a área construída for ilegível.
 */
export function toRow(rec: Record<string, string | undefined>, cep: string): IptuRow | null {
  const get = (c: ColunaIptu) => (rec[c] ?? "").trim();
  const sql = digits(get("NUMERO DO CONTRIBUINTE"));
  const area = num(get("AREA CONSTRUIDA"));
  if (sql.length !== 11 || area === null) return null;
  const row: IptuRow = {
    sql,
    exercicio: num(get("ANO DO EXERCICIO")) ?? 0,
    numeroCondominio: get("NUMERO DO CONDOMINIO") || null,
    logradouro: get("NOME DE LOGRADOURO DO IMOVEL"),
    numero: int(get("NUMERO DO IMOVEL")),
    complemento: get("COMPLEMENTO DO IMOVEL") || null,
    bairro: get("BAIRRO DO IMOVEL") || null,
    cep,
    fracaoIdeal: num(get("FRACAO IDEAL")),
    areaConstruida: area,
    anoConstrucao: int(get("ANO DA CONSTRUCAO CORRIGIDO")),
    pavimentos: int(get("QUANTIDADE DE PAVIMENTOS")),
    uso: get("TIPO DE USO DO IMOVEL"),
    padrao: get("TIPO DE PADRAO DA CONSTRUCAO") || null,
  };
  // Garantia da allowlist (seção 20): o objeto tem exatamente os campos de COLUNAS_IPTU.
  return row;
}

/** Campos internos que uma linha pode ter (testado contra as chaves de toRow). */
export const CAMPOS_IPTU_ROW = Object.values(COLUNAS_IPTU);

/** Só os dígitos de um texto (SQL, CEP). Recebe: texto. Devolve: dígitos ("" se vazio). */
function digits(s: string | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Número decimal do CSV (ponto ou vírgula). Recebe: texto. Devolve: número ou nulo se vazio/ilegível. */
function num(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Inteiro do CSV; 0 conta como ausente (ano, pavimentos, número). Recebe: texto. Devolve: inteiro ou nulo. */
function int(s: string): number | null {
  const n = num(s);
  return n === null || n === 0 ? null : Math.trunc(n);
}

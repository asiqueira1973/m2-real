/**
 * Rotina ingestao-itbi (seção 4.4; épico 8.3).
 *
 * Fluxo (8.3): abrir a página da Fazenda → listar os .xlsx → para cada um: baixar, calcular o
 * hash e descobrir o ano pelas abas (o nome do arquivo não diz o ano) → só anos ≥ 2021 (A2) →
 * hash igual ao da última execução concluída daquele ano = "sem mudança" (0 gravadas) → senão:
 * ler as abas mensais, atribuir bairro (11.2), descartar fora dos 10 bairros, gravar (11.1),
 * ligar a unidades/prédios pelo SQL, marcar 11.14 e substituir o ano (11.1).
 * Cada ano é uma execução em m2_execucoes_ingestao (runRoutine: falha → "falhou" + exit ≠ 0).
 * Alternativa ao download (PV1): --arquivo <xlsx> processa um arquivo local.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { M2Client } from "@m2-real/db/server";
import { ITBI_ANO_INICIAL } from "../config/regras.js";
import { loadNeighborhoods } from "../iptu/rotina.js";
import { rawStoreFromEnv, sha256, storeRaw } from "../shared/brutos.js";
import { listSheets } from "../shared/xlsx.js";
import { runRoutine, supabaseExecutionStore, type RoutineResult } from "../shared/execucao.js";
import { assignNeighborhoods } from "./bairro.js";
import { insertGuias, lookupUnits, replaceYear } from "./gravacao.js";
import { sheetMonth } from "./guias.js";
import { readItbiWorkbook } from "./leitor.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Os sites da prefeitura recusam pedidos sem User-Agent de navegador. */
const USER_AGENT = "Mozilla/5.0 (compatible; FechouPorQuantoBot/1.0; +https://fechouporquanto.com.br)";

export interface ItbiOptions {
  /** Caminho local de um .xlsx (alternativa ao download, PV1). */
  arquivo?: string;
  /** Página da Fazenda com os links (ITBI_PAGINA_URL). */
  paginaUrl?: string;
  /** Restringe a um ano (ex.: `npm run ingestao -- itbi 2025`). */
  ano?: number;
}

interface Planilha {
  buffer: Buffer;
  url: string | null;
  nome: string;
  ano: number;
}

/**
 * Executa a rotina ingestao-itbi.
 * Recebe: cliente service role e opções. Devolve: resumo por ano (execução e contagens).
 * Uma falha num ano registra "falhou" naquele ano, segue para os demais e, no fim, relança
 * o primeiro erro (exit ≠ 0 → e-mail do GitHub; observabilidade O1).
 */
export async function runItbi(db: M2Client, opts: ItbiOptions): Promise<{ ano: number; resultado: RoutineResult | null; erro?: string }[]> {
  const planilhas = opts.arquivo ? [await localFile(opts.arquivo)] : await downloadAll(opts.paginaUrl);
  const resumo: { ano: number; resultado: RoutineResult | null; erro?: string }[] = [];
  let primeiroErro: unknown = null;
  for (const p of planilhas) {
    if (p.ano < ITBI_ANO_INICIAL || (opts.ano && p.ano !== opts.ano)) continue;
    try {
      const { result } = await runRoutine(supabaseExecutionStore(db), "ingestao-itbi", "itbi", String(p.ano), (exec) => loadYear(db, p, exec.id));
      resumo.push({ ano: p.ano, resultado: result });
    } catch (erro) {
      primeiroErro ??= erro;
      resumo.push({ ano: p.ano, resultado: null, erro: (erro as Error).message });
    }
  }
  if (primeiroErro) throw primeiroErro;
  return resumo;
}

/**
 * Carga de um ano (dentro de runRoutine).
 * Recebe: cliente, a planilha e o id da execução aberta por runRoutine.
 * Devolve: contagens para m2_execucoes_ingestao.
 */
async function loadYear(db: M2Client, p: Planilha, execucaoId: string): Promise<RoutineResult> {
  const hash = sha256(p.buffer);
  const base = { referencia: String(p.ano), arquivoUrl: p.url, arquivoHash: hash };

  // Critério 8.3: mesmo hash da última execução concluída do ano → "sem mudança".
  const { data: ultima, error } = await db
    .from("m2_execucoes_ingestao")
    .select("arquivo_hash, caminho_storage")
    .eq("rotina", "ingestao-itbi")
    .eq("referencia", String(p.ano))
    .eq("status", "concluida")
    .order("concluida_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler a última execução do ITBI ${p.ano}: ${error.message}`);
  if (ultima?.arquivo_hash === hash) {
    console.log(`ITBI ${p.ano}: sem mudança (hash igual ao da última execução concluída).`);
    return { linhasLidas: 0, linhasGravadas: 0, linhasDescartadas: 0, caminhoStorage: ultima.caminho_storage, ...base };
  }

  const caminhoStorage = await storeRaw(rawStoreFromEnv(db), "itbi", String(p.ano), "xlsx", p.buffer, XLSX_MIME);
  const lidas = await readItbiWorkbook(p.buffer);
  if (lidas.ano !== p.ano) throw new Error(`Ano das abas (${lidas.ano}) diferente do detectado (${p.ano}).`);

  const bairros = await loadNeighborhoods(db);
  const unidades = await lookupUnits(db, lidas.guias.map((g) => g.sql));
  const bairroPorSql = new Map([...unidades].map(([sql, u]) => [sql, u.bairroId]));
  const { atribuidas, descartes } = assignNeighborhoods(lidas.guias, bairros, bairroPorSql);

  const novas = await insertGuias(db, atribuidas, execucaoId, unidades);
  // Regra 11.1: só depois de gravar tudo; se algo falhou antes, runRoutine marca "falhou" e isto não roda (seção 12).
  const apagadas = await replaceYear(db, p.ano, execucaoId, atribuidas.map((a) => a.guia.hashLinha));

  const origens: Record<string, number> = {};
  for (const a of atribuidas) origens[a.origem] = (origens[a.origem] ?? 0) + 1;
  console.log(
    `ITBI ${p.ano}: ${lidas.linhasLidas} linhas lidas, ${atribuidas.length} guias nos 10 bairros ` +
      `(${Object.entries(origens).map(([k, v]) => `${k} ${v}`).join(", ")}), ${novas} novas, ${apagadas} apagadas da carga anterior.`,
  );
  for (const [motivo, n] of Object.entries(descartes)) console.log(`  descartadas: ${n} guias — ${motivo}`);
  return {
    linhasLidas: lidas.linhasLidas,
    linhasGravadas: novas,
    linhasDescartadas: lidas.linhasLidas - atribuidas.length,
    caminhoStorage,
    ...base,
  };
}

/** Lê um .xlsx local e descobre o ano pelas abas. */
async function localFile(caminho: string): Promise<Planilha> {
  const buffer = await readFile(caminho);
  return { buffer, url: null, nome: basename(caminho), ano: await workbookYear(buffer) };
}

/**
 * Lista os .xlsx da página da Fazenda e baixa cada um.
 * Recebe: URL da página (ITBI_PAGINA_URL). Devolve: planilhas com o ano detectado.
 * Lança erro se a página não abrir ou não tiver nenhum link .xlsx (PV1).
 */
async function downloadAll(paginaUrl: string | undefined): Promise<Planilha[]> {
  if (!paginaUrl) throw new Error("ITBI_PAGINA_URL não definida (seção 18.4).");
  const pagina = await fetch(paginaUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!pagina.ok) throw new Error(`Página do ITBI respondeu ${pagina.status} (PV1).`);
  const links = extractXlsxLinks(await pagina.text(), paginaUrl);
  if (!links.length) throw new Error("Página do ITBI sem links .xlsx: o layout pode ter mudado.");
  const planilhas: Planilha[] = [];
  for (const url of links) {
    const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    const tipo = resp.headers.get("content-type") ?? "";
    if (!resp.ok || tipo.includes("text/html")) throw new Error(`Download do ITBI falhou (${resp.status}) em ${url} (PV1).`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    planilhas.push({ buffer, url, nome: decodeURIComponent(basename(new URL(url).pathname)), ano: await workbookYear(buffer) });
  }
  return planilhas;
}

/**
 * Extrai os links .xlsx de uma página HTML.
 * Recebe: HTML e a URL da página (para resolver links relativos). Devolve: URLs absolutas, sem repetição.
 */
export function extractXlsxLinks(html: string, base: string): string[] {
  const links = [...html.matchAll(/href="([^"]+\.xlsx)"/gi)].map((m) => new URL(m[1]!.replace(/&amp;/g, "&"), base).href);
  return [...new Set(links)];
}

/**
 * Ano dos dados pelas abas mensais, lendo só a lista de abas do .xlsx (sem ler as planilhas).
 * Recebe: conteúdo do .xlsx. Devolve: o ano. Lança erro se não houver aba mensal ou houver anos diferentes.
 */
export async function workbookYear(buffer: Buffer): Promise<number> {
  const anos = new Set((await listSheets(buffer)).map((a) => sheetMonth(a.nome)).filter(Boolean).map((m) => Number(m!.slice(0, 4))));
  if (anos.size !== 1) throw new Error(`Não deu para saber o ano da planilha do ITBI pelas abas (${[...anos].join(", ") || "nenhuma aba mensal"}).`);
  return [...anos][0]!;
}

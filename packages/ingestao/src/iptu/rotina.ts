/**
 * Rotina ingestao-iptu (seção 4.4; épico 8.2).
 *
 * Fluxo (8.2, com a decisão do usuário sobre o download, plans/8.2-iptu.md):
 *  1. Obtém o arquivo: --arquivo <caminho local> (carga anual manual, caminho padrão);
 *     ou IPTU_ARQUIVO_URL (tentativa de download); ou o bruto já guardado no Storage.
 *  2. Guarda o bruto em m2_brutos/iptu/<ano>.zip|.csv, mantendo a versão anterior
 *     (retenção de 2 versões, seção 17).
 *  3. Lê em stream, filtra pelos CEPs dos 10 bairros, monta prédios/unidades/plantas
 *     (11.2, 11.3, 11.4, 11.6, 11.7) e grava de forma idempotente.
 *  4. Tudo dentro de runRoutine: execução registrada; erro → "falhou" + exit ≠ 0 (seção 12).
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { M2Client } from "@m2-real/db/server";
import { BUCKET_BRUTOS, sha256, storeRaw } from "../shared/brutos.js";
import { runRoutine, supabaseExecutionStore } from "../shared/execucao.js";
import { writeBuildings } from "./gravacao.js";
import { openIptuFile, readIptuRows } from "./leitor.js";
import { assembleBuildings, type Neighborhood } from "./montagem.js";

/** Mensagem quando o GeoSampa devolve a página de desafio anti-robô no lugar do arquivo (PV2). */
export const MENSAGEM_DOWNLOAD_BLOQUEADO =
  "Download do IPTU bloqueado pelo desafio anti-robô do GeoSampa. Baixe o arquivo no navegador e rode " +
  "`npm run ingestao -- iptu <ano> --arquivo IPTU_<ano>.zip` (ou envie para m2_brutos/iptu/<ano>.zip).";

export interface IptuOptions {
  ano: number;
  /** Caminho local do .zip/.csv (carga manual anual). */
  arquivo?: string;
  /** URL para download (IPTU_ARQUIVO_URL). */
  url?: string;
}

interface Source {
  buffer: Buffer;
  nome: string; // "IPTU_2026.zip"
  url: string | null;
}

/**
 * Executa a rotina ingestao-iptu.
 * Recebe: cliente service role e opções (ano obrigatório; arquivo ou url opcionais).
 * Devolve: o id da execução e as contagens. Lança erro (execução "falhou") se o arquivo
 * não for encontrado, o download vier bloqueado ou faltar coluna obrigatória.
 */
export async function runIptu(db: M2Client, opts: IptuOptions) {
  return runRoutine(supabaseExecutionStore(db), "ingestao-iptu", "iptu", String(opts.ano), async () => {
    const fonte = await obtainSource(db, opts);
    const arquivoHash = sha256(fonte.buffer);
    const ext = fonte.nome.toLowerCase().endsWith(".csv") ? "csv" : "zip";
    // Bruto guardado com 2 versões (seção 17); mesmo hash não regrava.
    const caminhoStorage = await storeRaw(db, "iptu", String(opts.ano), ext, fonte.buffer, ext === "zip" ? "application/zip" : "text/csv");

    const bairros = await loadNeighborhoods(db);
    const prefixos = [...new Set(bairros.flatMap((b) => b.prefixosCep))];
    const lidas = await readIptuRows(await openIptuFile(fonte.buffer, fonte.nome), prefixos);
    const { buildings, discarded } = assembleBuildings(lidas.rows, bairros);
    // Motivos dos descartes (regras 11.2 e 11.4), por tipo, no log da execução do Actions.
    const motivos = new Map<string, number>();
    for (const d of discarded) motivos.set(d.motivo, (motivos.get(d.motivo) ?? 0) + d.linhas);
    for (const [motivo, linhas] of motivos) console.log(`  descartadas: ${linhas} linhas — ${motivo}`);
    const gravados = await writeBuildings(db, buildings);

    console.log(
      `IPTU ${opts.ano}: ${lidas.linhasLidas} linhas lidas, ${lidas.rows.length} nos CEPs dos 10 bairros, ` +
        `${gravados.predios} prédios, ${gravados.unidades} unidades, plantas: ${gravados.plantasNovas} novas / ${gravados.plantasAtualizadas} mantidas.`,
    );
    return {
      linhasLidas: lidas.linhasLidas,
      linhasGravadas: gravados.unidades,
      linhasDescartadas: lidas.linhasLidas - gravados.unidades,
      referencia: String(opts.ano),
      arquivoUrl: fonte.url,
      arquivoHash,
      caminhoStorage,
    };
  });
}

/** Obtém o arquivo: local → URL → Storage, nesta ordem. Lança erro com orientação se nada servir. */
async function obtainSource(db: M2Client, opts: IptuOptions): Promise<Source> {
  if (opts.arquivo) {
    return { buffer: await readFile(opts.arquivo), nome: basename(opts.arquivo), url: null };
  }
  if (opts.url) {
    const resp = await fetch(opts.url);
    const tipo = resp.headers.get("content-type") ?? "";
    // PV2: o GeoSampa responde 200 com uma página HTML de desafio no lugar do arquivo.
    if (!resp.ok || tipo.includes("text/html")) throw new Error(MENSAGEM_DOWNLOAD_BLOQUEADO);
    const nome = opts.url.toLowerCase().includes(".csv") ? `IPTU_${opts.ano}.csv` : `IPTU_${opts.ano}.zip`;
    return { buffer: Buffer.from(await resp.arrayBuffer()), nome, url: opts.url };
  }
  for (const ext of ["zip", "csv"]) {
    const { data } = await db.storage.from(BUCKET_BRUTOS).download(`iptu/${opts.ano}.${ext}`);
    if (data) return { buffer: Buffer.from(await data.arrayBuffer()), nome: `IPTU_${opts.ano}.${ext}`, url: null };
  }
  throw new Error(`Arquivo do IPTU ${opts.ano} não encontrado. ${MENSAGEM_DOWNLOAD_BLOQUEADO}`);
}

/** Lê os bairros ativos (seed da 7.6) no formato usado pela montagem. */
export async function loadNeighborhoods(db: M2Client): Promise<Neighborhood[]> {
  const { data, error } = await db.from("m2_bairros").select("id, slug, prefixos_cep, padroes_nome").eq("ativo", true);
  if (error) throw new Error(`Falha ao ler m2_bairros: ${error.message}`);
  if (!data.length) throw new Error("m2_bairros está vazia: rode o seed (supabase/seed.sql, seção 7.6).");
  return data.map((b) => ({ id: b.id, slug: b.slug, prefixosCep: b.prefixos_cep, padroesNome: b.padroes_nome }));
}

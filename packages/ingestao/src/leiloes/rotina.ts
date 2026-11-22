/**
 * Rotina coleta-leiloes (seção 4.4; épico 8.5.1; regras 11.19 e 11.20; seções 17 e 20).
 * Fluxo: alvos (11.19) → busca restrita à allowlist de leilão → até 3 páginas de lote raspadas com
 * o schema da 13.3 estendido → se a página não traz área privativa, PDF baixado só em memória e lido
 * pela Claude API (13.4) → allowlist de campos → casamento (11.20) → gravação → ultima_coleta_leilao_em.
 * Para no teto de créditos do Firecrawl e conclui (seção 17); para de ler PDFs no teto de documentos
 * da Claude API. Alvo com erro de API é pulado sem atualizar ultima_coleta_leilao_em (seção 12).
 * O PDF nunca sai da memória: nada aqui escreve em disco nem no Storage (seção 20).
 * Execução registrada com rotina coleta-leiloes e fonte edital_leilao (runRoutine).
 */
import Anthropic, { AnthropicError, APIError } from "@anthropic-ai/sdk";
import type { M2Client } from "@m2-real/db/server";
import {
  CASAMENTO_SIMILARIDADE_MINIMA, CLAUDE_MAX_DOCUMENTOS_PADRAO, FIRECRAWL_MAX_CREDITOS_PADRAO, LEILAO_ALVOS_JANELA_MESES,
  LEILAO_DOMINIOS_PADRAO, LEILAO_GUIAS_POR_MATRICULA, LEILAO_MAX_ALVOS_PADRAO, LEILAO_RESULTADOS_POR_ALVO, NATUREZAS_LEILAO_PREFIXOS,
} from "../config/regras.js";
import { fetchAllPages } from "../calibracao/dados.js";
import { allowedDomain, siteFilter } from "../anuncios/dominios.js";
import { createFirecrawl, ErroFirecrawl, TetoDeCreditos, type Firecrawl } from "../anuncios/firecrawl.js";
import { runRoutine, supabaseExecutionStore } from "../shared/execucao.js";
import { withRetry, type RetryOptions } from "../shared/retry.js";
import { pickAuctionTargets } from "./alvos.js";
import { casarEdital, type CasamentoEdital, type GuiaComMatricula, type UnidadeDoPredio } from "./casamento.js";
import { CAMPOS_EDITAL, coherentTotal, fromLotPage, PROMPT_PAGINA_LEILAO, SCHEMA_PAGINA_LEILAO, type EditalExtraido } from "./extracao.js";
import { downloadPdf, readDocument, type LeitorClaude } from "./pdf.js";

/** Colunas de m2_editais_leilao que a coleta grava (7.2). O teste confere que a linha não tem outras. */
export const COLUNAS_EDITAL = [
  "url", "dominio", "execucao_id", ...CAMPOS_EDITAL, "predio_id", "unidade_id", "status_casamento", "coletado_em",
] as const;

export interface ColetaLeiloesOptions {
  firecrawlApiKey: string;
  anthropicApiKey?: string;
  /** FIRECRAWL_MAX_CREDITOS_EXECUCAO (seção 17). */
  maxCreditos?: number;
  /** LEILAO_MAX_ALVOS_EXECUCAO (seção 18.4). */
  maxAlvos?: number;
  /** CLAUDE_MAX_DOCUMENTOS_EXECUCAO (seção 17). */
  maxDocumentos?: number;
  /** LEILAO_DOMINIOS (seção 18.4; padrão da assunção A10). */
  dominios?: readonly string[];
  /** chave_predio de um prédio específico (opção --predio). */
  predio?: string;
  // Dependências injetáveis (testes rodam sem rede).
  firecrawl?: Firecrawl;
  claude?: LeitorClaude;
  baixarPdf?: (url: string) => Promise<Buffer>;
  agora?: () => Date;
}

interface PredioAlvo {
  id: string;
  logradouro: string;
  numero: number | null;
}

/**
 * Texto da busca (8.5.1): "<logradouro sem o tipo>, <número>" leilão São Paulo + filtro de sites.
 * Recebe: prédio e allowlist. Devolve: a busca.
 */
export function auctionQuery(p: PredioAlvo, dominios: readonly string[] = LEILAO_DOMINIOS_PADRAO): string {
  const semTipo = p.logradouro.replace(/^(RUA|AVENIDA|ALAMEDA|PRACA|TRAVESSA|LARGO|ESTRADA|VIELA)\s+/, "");
  const nome = semTipo.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return `"${nome}${p.numero ? `, ${p.numero}` : ""}" leilão São Paulo ${siteFilter(dominios)}`;
}

/**
 * Junta o que veio do PDF (13.4) com o que veio da página do lote: o documento prevalece, a página
 * completa os campos que ele não traz. Recebe: edital do documento e da página. Devolve: o edital.
 */
export function mergeEdital(doc: EditalExtraido, pagina: EditalExtraido): EditalExtraido {
  const r = { ...doc };
  for (const k of CAMPOS_EDITAL) {
    if (r[k] === null && pagina[k] !== null) (r as Record<string, unknown>)[k] = pagina[k];
  }
  // A área total da página pode ser de outro lote: na mesma unidade, nunca é menor que a privativa.
  r.area_total = coherentTotal(r.area_total, r.area_privativa);
  return r;
}

/**
 * Monta a linha de m2_editais_leilao só com as colunas permitidas (seção 20; critério do 8.5.1).
 * Recebe: URL da página do lote, domínio, execução, edital (já filtrado) e casamento.
 * Devolve: o objeto do upsert, com exatamente as chaves de COLUNAS_EDITAL.
 */
export function buildEditalRow(url: string, dominio: string, execucaoId: string, e: EditalExtraido, c: CasamentoEdital, agora: Date) {
  const linha = { url, dominio, execucao_id: execucaoId } as Record<(typeof COLUNAS_EDITAL)[number], unknown>;
  for (const k of CAMPOS_EDITAL) linha[k] = e[k]; // allowlist positiva: só os campos de CAMPOS_EDITAL
  linha.predio_id = c.predioId;
  linha.unidade_id = c.unidadeId;
  linha.status_casamento = c.status;
  linha.coletado_em = agora.toISOString();
  return linha;
}

/**
 * Executa a coleta. Recebe: cliente service role e opções. Devolve: id da execução e contagens.
 */
export async function runAuctionCollection(db: M2Client, opts: ColetaLeiloesOptions) {
  const agora = opts.agora ?? (() => new Date());
  const maxCreditos = opts.maxCreditos ?? FIRECRAWL_MAX_CREDITOS_PADRAO;
  const maxAlvos = opts.maxAlvos ?? LEILAO_MAX_ALVOS_PADRAO;
  const maxDocumentos = opts.maxDocumentos ?? CLAUDE_MAX_DOCUMENTOS_PADRAO;
  const dominios = opts.dominios ?? LEILAO_DOMINIOS_PADRAO;
  const fc = opts.firecrawl ?? createFirecrawl({ apiKey: opts.firecrawlApiKey, maxCreditos });
  const baixar = opts.baixarPdf ?? ((url: string) => downloadPdf(url));
  let claude = opts.claude;
  const leitor = (): LeitorClaude => (claude ??= new Anthropic({ apiKey: opts.anthropicApiKey }));

  return runRoutine(supabaseExecutionStore(db), "coleta-leiloes", "edital_leilao", null, async (exec) => {
    const alvos = opts.predio ? await buildingByKey(db, opts.predio) : await auctionTargets(db, agora(), maxAlvos);
    let paginas = 0;
    let documentos = 0;
    let gravados = 0;
    let descartados = 0;
    let concluidos = 0;
    let pulados = 0;
    let parouNoTeto = false;

    for (const alvo of alvos.slice(0, maxAlvos)) {
      try {
        const resultados = await fc.buscar(auctionQuery(alvo, dominios), LEILAO_RESULTADOS_POR_ALVO);
        for (const r of resultados) {
          const dominio = allowedDomain(r.url, dominios);
          if (!dominio) { descartados++; continue; } // fora da allowlist: nunca é raspado
          const pagina = fromLotPage(await fc.extrair(r.url, SCHEMA_PAGINA_LEILAO, PROMPT_PAGINA_LEILAO));
          paginas++;
          if (!pagina) { descartados++; continue; } // não é página de lote de leilão

          let edital = pagina.edital;
          // Passo 4 do 8.5.1: sem área privativa na página, lê os PDFs do lote (só da allowlist).
          for (const link of edital.area_privativa === null ? pagina.links : []) {
            if (documentos >= maxDocumentos) break; // CLAUDE_MAX_DOCUMENTOS_EXECUCAO
            const urlPdf = resolveLink(link, r.url);
            if (!urlPdf || !allowedDomain(urlPdf, dominios)) continue;
            let pdf: Buffer | null;
            try {
              pdf = await baixar(urlPdf);
            } catch (erro) {
              console.warn(`PDF ignorado (${urlPdf}): ${(erro as Error).message}`);
              continue;
            }
            documentos++;
            let doc: EditalExtraido | null;
            try {
              doc = await readDocument(leitor(), pdf, urlPdf);
            } catch (erro) {
              // Erro permanente da API com este PDF (4xx que não seja 408/409/429; ex.: páginas
              // demais): ignora o PDF. Se pulasse o alvo, ele voltaria em toda rodada gastando créditos.
              if (!isPermanentApiError(erro)) throw erro;
              console.warn(`PDF ignorado pela Claude API (${urlPdf}): ${(erro as Error).message}`);
              continue;
            }
            pdf = null; // passo 5: o PDF é descartado (só existiu nesta variável)
            if (doc) edital = mergeEdital(doc, pagina.edital);
            if (edital.area_privativa !== null) break;
          }

          // 13.4: sem nenhuma área, não grava.
          if (edital.area_privativa === null && edital.area_total === null && edital.area_comum === null) { descartados++; continue; }
          const casamento = await matchEdital(db, edital);
          if ((await saveEdital(db, buildEditalRow(r.url, dominio, exec.id, edital, casamento, agora()))) === "gravado") gravados++;
          else descartados++; // regra 11.11: edital casado à mão fica como o admin deixou
        }
        await withRetry(
          () => db.from("m2_predios").update({ ultima_coleta_leilao_em: agora().toISOString() }).eq("id", alvo.id),
          "Falha ao atualizar ultima_coleta_leilao_em",
        );
        concluidos++;
      } catch (erro) {
        if (erro instanceof TetoDeCreditos) { parouNoTeto = true; break; }
        if (erro instanceof ErroFirecrawl || erro instanceof AnthropicError) {
          pulados++;
          console.warn(`Prédio ${alvo.id} pulado: ${(erro as Error).message}`);
          continue;
        }
        throw erro;
      }
    }

    console.log(
      `Coleta de leilões: ${concluidos} de ${alvos.length} alvos buscados, ${pulados} pulados por erro de API; ` +
        `${paginas} páginas raspadas, ${documentos} PDFs lidos (teto ${maxDocumentos}), ${gravados} editais gravados, ` +
        `${descartados} descartados; créditos usados: ${fc.creditosUsados()} de ${maxCreditos}${parouNoTeto ? " (parou no teto)" : ""}.`,
    );
    return { linhasLidas: paginas, linhasGravadas: gravados, linhasDescartadas: descartados };
  });
}

/**
 * Erro da Claude API que não melhora ao repetir: status 4xx, menos 408 (tempo), 409 e 429 (limite).
 * Recebe: o erro. Devolve: verdadeiro se for permanente.
 */
function isPermanentApiError(erro: unknown): boolean {
  return erro instanceof APIError && typeof erro.status === "number" && erro.status >= 400 && erro.status < 500 && ![408, 409, 429].includes(erro.status);
}

/** Link absoluto (http/https) a partir do link da página, ou nulo. */
function resolveLink(link: string, base: string): string | null {
  try {
    const u = new URL(link, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Prédio pela chave (opção --predio). */
async function buildingByKey(db: M2Client, chave: string): Promise<PredioAlvo[]> {
  const { data, error } = await db.from("m2_predios").select("id, logradouro, numero").eq("chave_predio", chave).maybeSingle();
  if (error || !data) throw new Error(`Prédio ${chave} não encontrado.`);
  return [{ id: data.id, logradouro: data.logradouro, numero: data.numero }];
}

/**
 * Regra 11.19 com dados do banco. Recebe: cliente, instante e teto. Devolve: os prédios da rodada.
 */
async function auctionTargets(db: M2Client, agora: Date, maxAlvos: number): Promise<PredioAlvo[]> {
  const desde = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - LEILAO_ALVOS_JANELA_MESES, agora.getUTCDate())).toISOString().slice(0, 10);
  const arrematacoes = new Map<string, string>();
  for (const prefixo of NATUREZAS_LEILAO_PREFIXOS) {
    const guias = await fetchAllPages<{ id: string; predio_id: string; data_transacao: string }>(
      (de, ate) => db.from("m2_transacoes").select("id, predio_id, data_transacao").like("natureza", `${prefixo}%`)
        .gte("data_transacao", desde).not("predio_id", "is", null).order("id").range(de, ate) as never,
      "Falha ao ler guias de leilão (11.19)",
    );
    for (const g of guias) if ((arrematacoes.get(g.predio_id) ?? "") < g.data_transacao) arrematacoes.set(g.predio_id, g.data_transacao);
  }
  const confirmadas = await fetchAllPages<{ id: string; predio_id: string }>(
    (de, ate) => db.from("m2_plantas").select("id, predio_id").eq("selo", "confirmada").order("id").range(de, ate),
    "Falha ao ler plantas confirmadas (11.19)",
  );
  const comConfirmada = new Set(confirmadas.map((p) => p.predio_id));
  const predios = await fetchAllPages<{ id: string; logradouro: string; numero: number | null; prioridade_coleta: number; ultima_coleta_leilao_em: string | null }>(
    (de, ate) => db.from("m2_predios").select("id, logradouro, numero, prioridade_coleta, ultima_coleta_leilao_em").order("id").range(de, ate),
    "Falha ao ler prédios (11.19)",
  );
  const ids = pickAuctionTargets(
    predios.map((p) => ({ id: p.id, prioridade: Number(p.prioridade_coleta), ultimaColetaLeilaoEm: p.ultima_coleta_leilao_em, temPlantaConfirmada: comConfirmada.has(p.id) })),
    arrematacoes, agora, maxAlvos,
  );
  const porId = new Map(predios.map((p) => [p.id, p]));
  return ids.map((id) => porId.get(id)!).map((p) => ({ id: p.id, logradouro: p.logradouro, numero: p.numero }));
}

/**
 * Regra 11.20 com dados do banco: prédio pelo endereço (mesmo critério da 11.8), depois unidades
 * e guias do ITBI com a matrícula do edital. Recebe: cliente e edital. Devolve: o casamento.
 */
async function matchEdital(db: M2Client, e: EditalExtraido): Promise<CasamentoEdital> {
  if (!e.logradouro_extraido || e.numero_extraido === null) return casarEdital(e, null, [], []);
  const achados = await withRetry(
    () => db.rpc("m2_buscar_predio_por_endereco", { texto: `${e.logradouro_extraido}, ${e.numero_extraido}`, limiar_similaridade: CASAMENTO_SIMILARIDADE_MINIMA, limite: 1 }),
    "Falha ao buscar prédio do edital",
  );
  const predioId = achados[0]?.predio_id ?? null;
  if (!predioId) return casarEdital(e, null, [], []);

  const unidades = await fetchAllPages<{ id: string; complemento: string | null }>(
    (de, ate) => db.from("m2_unidades").select("id, complemento").eq("predio_id", predioId).eq("tipo_unidade", "apartamento").order("id").range(de, ate),
    "Falha ao ler unidades do prédio do edital",
  );
  let guias: GuiaComMatricula[] = [];
  if (e.matricula) {
    const matricula = e.matricula;
    const linhas = await withRetry<{ unidade_id: string | null; matricula: string | null }[]>(
      () => db.from("m2_transacoes").select("unidade_id, matricula").eq("predio_id", predioId).eq("matricula", matricula).not("unidade_id", "is", null).limit(LEILAO_GUIAS_POR_MATRICULA),
      "Falha ao ler guias com a matrícula do edital",
    );
    guias = linhas.filter((g) => g.unidade_id && g.matricula).map((g) => ({ unidadeId: g.unidade_id!, matricula: g.matricula! }));
  }
  const lista: UnidadeDoPredio[] = unidades.map((u) => ({ id: u.id, complemento: u.complemento }));
  return casarEdital(e, predioId, lista, guias);
}

/**
 * Grava o edital (upsert por url). Regra 11.11: edital com casado_manual = true NÃO é alterado pelo
 * pipeline. Se a leitura de casado_manual falhar, lança erro em vez de gravar às cegas.
 * Recebe: cliente, linha montada por buildEditalRow e opções de repetição.
 * Devolve: "gravado" ou "mantido_manual".
 */
export async function saveEdital(
  db: M2Client,
  linha: ReturnType<typeof buildEditalRow>,
  retry: RetryOptions = {},
): Promise<"gravado" | "mantido_manual"> {
  const atual = await withRetry<{ casado_manual: boolean } | null>(
    () => db.from("m2_editais_leilao").select("casado_manual").eq("url", linha.url as string).maybeSingle(),
    "Falha ao ler casado_manual do edital",
    retry,
  );
  if (atual?.casado_manual) return "mantido_manual";
  await withRetry(() => db.from("m2_editais_leilao").upsert(linha as never, { onConflict: "url" }), "Falha ao gravar m2_editais_leilao", retry);
  return "gravado";
}

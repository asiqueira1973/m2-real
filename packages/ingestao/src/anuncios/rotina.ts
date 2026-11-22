/**
 * Rotina coleta-anuncios (seção 4.4; épico 8.5).
 * Fluxo: prioridade (11.13) → até 150 prédios → busca restrita à allowlist → até 5 páginas por
 * prédio raspadas com o schema da 13.3 → allowlist de campos → casamento (11.8) → gravação →
 * ultima_coleta_em. Para no teto de créditos e conclui (seção 17); prédio com erro de API é pulado
 * sem atualizar ultima_coleta_em (seção 12). Execução registrada com fonte "anuncio" (runRoutine).
 */
import type { M2Client } from "@m2-real/db/server";
import { CASAMENTO_SIMILARIDADE_MINIMA, COLETA_RESULTADOS_POR_PREDIO, FIRECRAWL_MAX_CREDITOS_PADRAO, PRIORIDADE_JANELA_MESES } from "../config/regras.js";
import { fetchAllPages } from "../calibracao/dados.js";
import { decadeOf, groupFor } from "../calibracao/fatores.js";
import { loadReferenceFactors } from "../calibracao/plantas.js";
import { runRoutine, supabaseExecutionStore } from "../shared/execucao.js";
import { withRetry, type RetryOptions } from "../shared/retry.js";
import { casarAnuncio, type Casamento, type PlantaDoPredio } from "./casamento.js";
import { allowedDomain, siteFilter } from "./dominios.js";
import { CAMPOS_EXTRAIDOS, checkTotalArea, PROMPT_ANUNCIO, SCHEMA_ANUNCIO, toAnuncio, type AnuncioExtraido } from "./extracao.js";
import { createFirecrawl, ErroFirecrawl, TetoDeCreditos, type Firecrawl } from "./firecrawl.js";
import { collectionPriority, pickBuildings, type SeloPlanta } from "./prioridade.js";

/** Colunas de m2_anuncios que a coleta grava (7.2). O teste confere que a linha não tem outras. */
export const COLUNAS_ANUNCIO = [
  "url", "dominio", "execucao_id", ...CAMPOS_EXTRAIDOS,
  "predio_id", "planta_id", "status_casamento", "confianca_casamento", "coletado_em",
] as const;

export interface ColetaOptions {
  apiKey: string;
  maxCreditos?: number;
  /** chave_predio de um prédio específico (testes e evidência do critério). */
  predio?: string;
  firecrawl?: Firecrawl;
  agora?: () => Date;
}

interface PredioAlvo {
  id: string;
  logradouro: string;
  numero: number | null;
  bairro: string;
}

/**
 * Monta a linha de m2_anuncios só com as colunas permitidas (princípio 4; critério do 8.5).
 * Recebe: URL, domínio, execução, campos extraídos e o casamento. Devolve: o objeto do upsert.
 */
export function buildAnuncioRow(url: string, dominio: string, execucaoId: string, a: AnuncioExtraido, c: Casamento, agora: Date) {
  const linha: Record<(typeof COLUNAS_ANUNCIO)[number], unknown> = {
    url,
    dominio,
    execucao_id: execucaoId,
    fonte: a.fonte,
    logradouro_extraido: a.logradouro_extraido,
    numero_extraido: a.numero_extraido,
    nome_condominio: a.nome_condominio,
    finalidade: a.finalidade,
    area_privativa: a.area_privativa,
    area_privativa_min: a.area_privativa_min,
    area_privativa_max: a.area_privativa_max,
    quartos: a.quartos,
    vagas: a.vagas,
    andar: a.andar,
    preco_pedido: a.preco_pedido,
    predio_id: c.predioId,
    planta_id: c.plantaId,
    status_casamento: c.status,
    confianca_casamento: c.confianca,
    coletado_em: agora.toISOString(),
  };
  return linha;
}

/**
 * Texto da busca (8.5): "<logradouro sem o tipo>, <número>" <bairro> São Paulo + filtro de sites.
 * Sem o tipo ("RUA"), a frase exata pega "R Joaquim Antunes, 577" e "Rua Joaquim Antunes, 577".
 */
export function searchQuery(p: PredioAlvo): string {
  const semTipo = p.logradouro.replace(/^(RUA|AVENIDA|ALAMEDA|PRACA|TRAVESSA|LARGO|ESTRADA|VIELA)\s+/, "");
  const nome = semTipo.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return `"${nome}${p.numero ? `, ${p.numero}` : ""}" ${p.bairro} São Paulo ${siteFilter()}`;
}

/**
 * Executa a coleta. Recebe: cliente service role e opções. Devolve: id da execução e contagens.
 */
export async function runAdsCollection(db: M2Client, opts: ColetaOptions) {
  const agora = opts.agora ?? (() => new Date());
  const maxCreditos = opts.maxCreditos ?? FIRECRAWL_MAX_CREDITOS_PADRAO;
  const fc = opts.firecrawl ?? createFirecrawl({ apiKey: opts.apiKey, maxCreditos });

  return runRoutine(supabaseExecutionStore(db), "coleta-anuncios", "anuncio", null, async (exec) => {
    const alvos = opts.predio ? await buildingByKey(db, opts.predio) : await prioritizedBuildings(db, agora());
    let paginas = 0;
    let gravados = 0;
    let descartados = 0;
    let concluidos = 0;
    let pulados = 0;
    let parouNoTeto = false;

    for (const alvo of alvos) {
      try {
        const resultados = await fc.buscar(searchQuery(alvo), COLETA_RESULTADOS_POR_PREDIO);
        for (const r of resultados) {
          const dominio = allowedDomain(r.url);
          if (!dominio) { descartados++; continue; } // fora da allowlist: nunca é raspado
          const { json, markdown } = await fc.extrairComTexto(r.url, SCHEMA_ANUNCIO, PROMPT_ANUNCIO);
          paginas++; // só conta depois do scrape: se o teto parar a rodada aqui, a página não foi raspada
          const anuncio = checkTotalArea(toAnuncio(json), markdown); // 13.3: área total nunca vira área privativa
          if (!anuncio) { descartados++; continue; } // "outro" ou sem área (13.3; seção 12)
          const casamento = await matchAd(db, anuncio);
          if ((await saveAd(db, buildAnuncioRow(r.url, dominio, exec.id, anuncio, casamento, agora()))) === "gravado") gravados++;
          else descartados++; // regra 11.11: anúncio casado à mão fica como o admin deixou
        }
        await withRetry(
          () => db.from("m2_predios").update({ ultima_coleta_em: agora().toISOString() }).eq("id", alvo.id),
          "Falha ao atualizar ultima_coleta_em",
        );
        concluidos++;
      } catch (erro) {
        if (erro instanceof TetoDeCreditos) { parouNoTeto = true; break; }
        if (erro instanceof ErroFirecrawl) { pulados++; console.warn(`Prédio ${alvo.id} pulado: ${erro.message}`); continue; }
        throw erro;
      }
    }

    console.log(
      `Coleta de anúncios: ${concluidos} de ${alvos.length} prédios coletados, ${pulados} pulados por erro da API; ` +
        `${paginas} páginas raspadas, ${gravados} gravadas, ${descartados} descartadas; ` +
        `créditos usados: ${fc.creditosUsados()} de ${maxCreditos}${parouNoTeto ? " (parou no teto)" : ""}.`,
    );
    return { linhasLidas: paginas, linhasGravadas: gravados, linhasDescartadas: descartados };
  });
}

/** Prédio pela chave (opção --predio). */
async function buildingByKey(db: M2Client, chave: string): Promise<PredioAlvo[]> {
  const { data, error } = await db.from("m2_predios").select("id, logradouro, numero, bairro:m2_bairros(nome)").eq("chave_predio", chave).maybeSingle();
  if (error || !data) throw new Error(`Prédio ${chave} não encontrado.`);
  return [{ id: data.id, logradouro: data.logradouro, numero: data.numero, bairro: (data.bairro as unknown as { nome: string }).nome }];
}

/**
 * Regra 11.13: recalcula prioridade_coleta de todos os prédios e devolve os da rodada.
 * Recebe: cliente e o instante. Devolve: prédios escolhidos, do mais prioritário.
 */
async function prioritizedBuildings(db: M2Client, agora: Date): Promise<PredioAlvo[]> {
  const desde = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - PRIORIDADE_JANELA_MESES, agora.getUTCDate())).toISOString().slice(0, 10);
  const vendas = await fetchAllPages<{ id: string; predio_id: string }>(
    (de, ate) => db.from("m2_vendas_consolidadas").select("id, predio_id").gte("data_transacao", desde).order("id").range(de, ate),
    "Falha ao ler vendas para a prioridade",
  );
  const plantas = await fetchAllPages<{ id: string; predio_id: string; selo: SeloPlanta }>(
    (de, ate) => db.from("m2_plantas").select("id, predio_id, selo").order("id").range(de, ate),
    "Falha ao ler plantas para a prioridade",
  );
  const predios = await fetchAllPages<{ id: string; logradouro: string; numero: number | null; ultima_coleta_em: string | null; bairro: { nome: string } }>(
    (de, ate) => db.from("m2_predios").select("id, logradouro, numero, ultima_coleta_em, bairro:m2_bairros(nome)").order("id").range(de, ate) as never,
    "Falha ao ler prédios",
  );
  const nVendas = new Map<string, number>();
  for (const v of vendas) nVendas.set(v.predio_id, (nVendas.get(v.predio_id) ?? 0) + 1);
  const selos = new Map<string, SeloPlanta[]>();
  for (const p of plantas) selos.set(p.predio_id, [...(selos.get(p.predio_id) ?? []), p.selo]);

  const prioridades = predios.map((p) => collectionPriority(nVendas.get(p.id) ?? 0, selos.get(p.id) ?? []));
  await withRetry(
    () => db.rpc("m2_atualizar_prioridades", { ids: predios.map((p) => p.id), prioridades }),
    "Falha ao gravar prioridade_coleta (11.13)",
  );
  const escolhidos = new Set(pickBuildings(predios.map((p, i) => ({ id: p.id, prioridade: prioridades[i]!, ultimaColetaEm: p.ultima_coleta_em })), agora));
  const ordem = new Map([...escolhidos].map((id, i) => [id, i]));
  return predios
    .filter((p) => escolhidos.has(p.id))
    .sort((a, b) => ordem.get(a.id)! - ordem.get(b.id)!)
    .map((p) => ({ id: p.id, logradouro: p.logradouro, numero: p.numero, bairro: p.bairro.nome }));
}

/**
 * Regra 11.8 com dados do banco: acha o prédio (endereço, depois nome do condomínio), as plantas e o fator.
 * Recebe: cliente e anúncio. Devolve: o casamento.
 */
async function matchAd(db: M2Client, a: AnuncioExtraido): Promise<Casamento> {
  let predio: { id: string; similaridade: number } | null = null;
  if (a.logradouro_extraido && a.numero_extraido !== null) {
    const achados = await withRetry(
      () => db.rpc("m2_buscar_predio_por_endereco", { texto: `${a.logradouro_extraido}, ${a.numero_extraido}`, limiar_similaridade: CASAMENTO_SIMILARIDADE_MINIMA, limite: 1 }),
      "Falha ao buscar prédio do anúncio",
    );
    if (achados[0]) predio = { id: achados[0].predio_id, similaridade: achados[0].similaridade };
  }
  if (!predio && a.nome_condominio && a.numero_extraido !== null) {
    // 11.8: nome do condomínio igual ao de outra página já casada no mesmo número.
    const nome = a.nome_condominio.replace(/[\\%_]/g, (c) => `\\${c}`); // ilike: % e _ do nome são literais
    const numero = a.numero_extraido;
    const data = await withRetry<{ predio_id: string | null }[]>(
      () => db.from("m2_anuncios").select("predio_id").ilike("nome_condominio", nome).eq("numero_extraido", numero).not("predio_id", "is", null).limit(1),
      "Falha ao buscar condomínio já casado",
    );
    if (data[0]?.predio_id) predio = { id: data[0].predio_id, similaridade: 1 };
  }
  if (!predio) return casarAnuncio(a, null, [], null);

  const predioId = predio.id;
  const plantas = await withRetry<{ id: string; area_iptu_referencia: number }[]>(
    () => db.from("m2_plantas").select("id, area_iptu_referencia").eq("predio_id", predioId),
    "Falha ao ler plantas do prédio do anúncio",
  );
  const p = await withRetry<{ fator_predio: number | null; bairro_id: number; ano_construcao: number | null; vagas_cadastro_proprio: boolean }>(
    () => db.from("m2_predios").select("fator_predio, bairro_id, ano_construcao, vagas_cadastro_proprio").eq("id", predioId).single(),
    "Falha ao ler fator do prédio",
  );
  // 11.8: fator do prédio ou, sem ele, o fator de referência do grupo (11.10, gravado pela calibração do 8.6).
  const fator = p.fator_predio != null
    ? Number(p.fator_predio)
    : groupFor(await loadReferenceFactors(db), p.bairro_id, decadeOf(p.ano_construcao), p.vagas_cadastro_proprio)?.fatorMediano ?? null;
  const lista: PlantaDoPredio[] = (plantas ?? []).map((x) => ({ id: x.id, areaIptuReferencia: Number(x.area_iptu_referencia) }));
  return casarAnuncio(a, predio, lista, fator);
}

/**
 * Grava a página (upsert por url). Regra 11.11: anúncio com casado_manual = true NÃO é alterado
 * pelo pipeline (nem vínculo nem campos extraídos). Se a leitura de casado_manual falhar, lança
 * erro em vez de gravar às cegas (o que sobrescreveria o vínculo do admin).
 * Recebe: cliente, linha montada por buildAnuncioRow e opções de repetição.
 * Devolve: "gravado" ou "mantido_manual".
 */
export async function saveAd(
  db: M2Client,
  linha: ReturnType<typeof buildAnuncioRow>,
  retry: RetryOptions = {},
): Promise<"gravado" | "mantido_manual"> {
  const atual = await withRetry<{ casado_manual: boolean } | null>(
    () => db.from("m2_anuncios").select("casado_manual").eq("url", linha.url as string).maybeSingle(),
    "Falha ao ler casado_manual do anúncio",
    retry,
  );
  if (atual?.casado_manual) return "mantido_manual";
  await withRetry(() => db.from("m2_anuncios").upsert(linha as never, { onConflict: "url" }), "Falha ao gravar m2_anuncios", retry);
  return "gravado";
}

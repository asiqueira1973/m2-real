/**
 * Consultas do servidor MCP (seção 13.2), com a credencial de serviço — SÓ SERVIDOR (seções 6.3 e 20).
 * Leituras paginadas em 1.000 (max_rows do PostgREST corta em silêncio) e sempre por índice.
 */
import type { M2Client } from "@m2-real/db";
import { monthsBefore } from "@/lib/estatistica";
import type { Candidata, VendaMcp } from "./calculos";

const PAGINA = 1000;
const falha = (o: string, e: { message: string }) => new Error(`Falha ao ler ${o}: ${e.message}`);

/** Lê todas as páginas de uma consulta. Recebe: função da página e rótulo. Devolve: as linhas. */
async function todas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, rotulo: string): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) throw falha(rotulo, error);
    linhas.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) return linhas;
  }
}

type LinhaVenda = {
  id: string; data_transacao: string; valor_total: number; valor_apartamento: number; valor_vagas: number; area_privativa: number | null;
  selo_area: string; m2_privativo: number | null; m2_iptu: number; vagas_inclusas_area: number | null; fora_da_curva: boolean;
  unidade: { complemento: string | null } | null;
};
const CAMPOS_VENDA = "id, data_transacao, valor_total, valor_apartamento, valor_vagas, area_privativa, selo_area, m2_privativo, m2_iptu, vagas_inclusas_area, fora_da_curva, unidade:m2_unidades(complemento)";
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Linha do banco → venda da 13.2. */
function toVenda(v: LinhaVenda): VendaMcp {
  return {
    data: v.data_transacao, unidade: v.unidade?.complemento ?? null, valor_total: Number(v.valor_total), valor_apartamento: Number(v.valor_apartamento),
    valor_vagas: Number(v.valor_vagas), area_privativa: num(v.area_privativa), selo_area: v.selo_area, m2_privativo: num(v.m2_privativo),
    m2_iptu: Number(v.m2_iptu), vagas_inclusas_area: num(v.vagas_inclusas_area), fora_da_curva: v.fora_da_curva,
  };
}

/** buscar_predio (13.2; regra 11.5). Recebe: cliente e endereço. Devolve: até 5 prédios. */
export async function searchBuilding(db: M2Client, endereco: string) {
  const { data, error } = await db.rpc("m2_buscar_predio_por_endereco", { texto: endereco });
  if (error) throw falha("prédios", error);
  return (data ?? []).map((p) => ({
    predio_id: p.predio_id, endereco: p.endereco, bairro: p.bairro, ano_construcao: p.ano_construcao, total_unidades: p.total_unidades,
    similaridade: Math.round(Number(p.similaridade) * 1000) / 1000,
  }));
}

/** ficha_predio (13.2). Recebe: cliente e id. Devolve: prédio e plantas, ou nulo. */
export async function buildingFile(db: M2Client, predioId: string) {
  const [predio, plantas] = await Promise.all([
    db.from("m2_predios").select("id, logradouro, numero, numeros_imovel, ano_construcao, qtd_pavimentos, padrao_iptu, total_unidades_residenciais, vagas_cadastro_proprio, fator_predio, bairro:m2_bairros(nome, slug)").eq("id", predioId).maybeSingle(),
    db.from("m2_plantas").select("area_iptu_referencia, area_privativa, fator, selo, fonte_area, faixa_erro_pct, vagas_inclusas, quartos, qtd_unidades, especial").eq("predio_id", predioId).order("area_iptu_referencia"),
  ]);
  if (predio.error) throw falha("prédio", predio.error);
  if (plantas.error) throw falha("plantas", plantas.error);
  if (!predio.data) return null;
  const p = predio.data;
  const bairro = p.bairro as unknown as { nome: string; slug: string } | null;
  return {
    predio_id: p.id, endereco: `${p.logradouro}${p.numero ? `, ${p.numero}` : ""}`, numeros_imovel: p.numeros_imovel, bairro: bairro?.nome ?? null,
    ano_construcao: p.ano_construcao, qtd_pavimentos: p.qtd_pavimentos, padrao_iptu: p.padrao_iptu, total_unidades: p.total_unidades_residenciais,
    vagas_cadastro_proprio: p.vagas_cadastro_proprio, fator_predio: num(p.fator_predio),
    plantas: plantas.data.map((pl) => ({
      area_iptu: Number(pl.area_iptu_referencia), area_privativa: num(pl.area_privativa), fator: num(pl.fator), selo: pl.selo, fonte_area: pl.fonte_area,
      faixa_erro_pct: num(pl.faixa_erro_pct), vagas_inclusas: pl.vagas_inclusas, quartos: pl.quartos, qtd_unidades: pl.qtd_unidades, especial: pl.especial,
    })),
  };
}

/** vendas_predio (13.2). Recebe: cliente, prédio e meses. Devolve: as vendas da janela, da mais recente. */
export async function buildingSales(db: M2Client, predioId: string, meses: number, agora = new Date()): Promise<VendaMcp[]> {
  const desde = monthsBefore(agora, meses);
  const linhas = await todas<LinhaVenda>(
    (de, ate) => db.from("m2_vendas_consolidadas").select(CAMPOS_VENDA).eq("predio_id", predioId).gte("data_transacao", desde)
      .order("data_transacao", { ascending: false }).order("id").range(de, ate) as never,
    "vendas do prédio",
  );
  return linhas.map(toVenda);
}

/**
 * m2_bairro (13.2; 11.17): estatística calculada no banco (m2_mediana_bairro; antes, trazer as vendas
 * da janela levava até 6 s). Recebe: cliente, slug, meses e quartos (opcional: quartos da planta).
 * Devolve: o resumo da 11.17 e o pct_cobertura da última foto — ou nulo se o slug não existe.
 */
export async function neighborhoodStats(db: M2Client, slug: string, meses: number, quartos: number | null) {
  const { data, error } = await db.rpc("m2_mediana_bairro", { bairro_slug: slug, janela_meses: meses, quartos: quartos as never });
  if (error) throw falha("mediana do bairro", error);
  const r = data?.[0];
  if (!r) return null;
  const b = await db.from("m2_bairros").select("id").eq("slug", slug).single();
  if (b.error) throw falha("bairro", b.error);
  const { data: cobertura, error: erroCobertura } = await db.from("m2_cobertura_bairros").select("pct_cobertura").eq("bairro_id", b.data.id).order("calculado_em", { ascending: false }).limit(1).maybeSingle();
  if (erroCobertura) throw falha("cobertura", erroCobertura);
  return {
    bairro: r.bairro, mediana_m2_privativo: num(r.mediana_m2_privativo), p25: num(r.p25), p75: num(r.p75), n_vendas: r.n_vendas,
    distribuicao_selos: (r.distribuicao_selos ?? {}) as Record<string, number>, com_vagas_inclusas: r.com_vagas_inclusas,
    pct_cobertura: cobertura ? Number(cobertura.pct_cobertura) : null,
  };
}

/**
 * Dados para comparaveis (13.2). Recebe: cliente, prédio, área informada (opcional), meses.
 * Devolve: o prédio de referência, a área usada (informada ou da planta com mais unidades) e as
 * candidatas do mesmo bairro na janela e na faixa de área — ou nulo se o prédio não existe.
 */
export async function comparableCandidates(db: M2Client, predioId: string, area: number | null, meses: number, faixa: number, agora = new Date()) {
  const { data: p, error } = await db.from("m2_predios").select("id, logradouro, bairro_id, ano_construcao").eq("id", predioId).maybeSingle();
  if (error) throw falha("prédio", error);
  if (!p) return null;
  let areaRef = area;
  let origemArea: "informada" | "planta_mais_comum" = "informada";
  if (areaRef === null) {
    const { data: pl, error: erroPlanta } = await db.from("m2_plantas").select("area_privativa, selo").eq("predio_id", predioId).not("area_privativa", "is", null)
      .order("qtd_unidades", { ascending: false }).limit(1).maybeSingle();
    if (erroPlanta) throw falha("a planta de referência", erroPlanta);
    areaRef = pl ? Number(pl.area_privativa) : null;
    origemArea = "planta_mais_comum";
  }
  if (areaRef === null) return { predio: p, areaRef: null, origemArea, candidatas: [] as Candidata[] };
  const desde = monthsBefore(agora, meses);
  const linhas = await todas<LinhaVenda & { predio_id: string; predio: { logradouro: string; numero: number | null; ano_construcao: number | null } }>(
    (de, ate) => db.from("m2_vendas_consolidadas")
      .select(`${CAMPOS_VENDA}, predio_id, predio:m2_predios!inner(logradouro, numero, ano_construcao, bairro_id)`)
      .eq("predio.bairro_id", p.bairro_id).gte("data_transacao", desde)
      .gte("area_privativa", areaRef! * (1 - faixa)).lte("area_privativa", areaRef! * (1 + faixa))
      .order("id").range(de, ate) as never,
    "comparáveis",
  );
  const candidatas: Candidata[] = linhas.map((v) => ({ ...toVenda(v), predio_id: v.predio_id, logradouro: v.predio.logradouro, numero: v.predio.numero, ano_construcao: v.predio.ano_construcao }));
  return { predio: p, areaRef, origemArea, candidatas };
}

/** atualizado_em (13.2): fim da última calibração concluída, ou nulo. */
export async function lastCalibration(db: M2Client): Promise<string | null> {
  const { data, error } = await db.from("m2_execucoes_ingestao").select("concluida_em").eq("rotina", "calibracao").eq("status", "concluida")
    .order("concluida_em", { ascending: false }).limit(1).maybeSingle();
  if (error) throw falha("a última calibração", error);
  return data?.concluida_em ?? null;
}

/**
 * Cobertura atual dos bairros (ferramenta sobre): última foto de cada bairro, pela m2_cobertura_atual.
 * Recebe: cliente service role. Devolve: uma linha por bairro (10 no máximo).
 */
export async function currentCoverage(db: M2Client) {
  const { data, error } = await db.rpc("m2_cobertura_atual");
  if (error) throw falha("cobertura", error);
  return data ?? [];
}

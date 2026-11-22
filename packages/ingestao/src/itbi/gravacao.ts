/**
 * Gravação das guias do ITBI (épico 8.3; regra 11.1).
 * - insert em lotes com "on conflict (hash_linha) do nothing" (idempotência);
 * - unidade_id / predio_id ligados pelo SQL (nulos se o SQL não existe no IPTU: unidade nova, 9.2);
 * - substituição do ano ao fim (m2_itbi_substituir_ano), só se tudo deu certo (seção 12);
 * - erro transitório do banco é repetido (shared/retry.ts): todas as operações são idempotentes.
 */
import type { M2Client } from "@m2-real/db/server";
import { withRetry, type RetryOptions } from "../shared/retry.js";
import type { GuiaComBairro } from "./bairro.js";

const LOTE_INSERT = 1000;
/**
 * SQLs por chamada de m2_unidades_por_sql. Cada SQL casa no máximo uma unidade, então um lote de
 * até 1.000 SQLs nunca passa do max_rows = 1.000 do PostgREST (que corta a resposta EM SILÊNCIO).
 */
const LOTE_SQLS = 1000;

export interface UnidadeDoSql {
  unidadeId: string;
  predioId: string;
  bairroId: number;
}

/**
 * Busca no IPTU carregado a unidade, o prédio e o bairro de cada SQL (regra 11.2, passo 2).
 * Recebe: cliente service role e SQLs. Devolve: mapa SQL → unidade (só os que existem).
 */
export async function lookupUnits(db: M2Client, sqls: readonly string[], retry: RetryOptions = {}): Promise<Map<string, UnidadeDoSql>> {
  const unicos = [...new Set(sqls)];
  const mapa = new Map<string, UnidadeDoSql>();
  for (let i = 0; i < unicos.length; i += LOTE_SQLS) {
    const lote = unicos.slice(i, i + LOTE_SQLS);
    const data = await withRetry(() => db.rpc("m2_unidades_por_sql", { sqls: lote }), "Falha ao buscar unidades por SQL", retry);
    for (const u of data) mapa.set(u.sql, { unidadeId: u.unidade_id, predioId: u.predio_id, bairroId: u.bairro_id });
  }
  return mapa;
}

/**
 * Grava as guias com bairro (regra 11.1: insert idempotente por hash_linha).
 * Recebe: cliente, guias com bairro (11.2), id da execução e o mapa SQL → unidade.
 * Devolve: quantas guias eram novas (as já existentes são ignoradas pelo on conflict).
 */
export async function insertGuias(
  db: M2Client,
  guias: readonly GuiaComBairro[],
  execucaoId: string,
  unidades: ReadonlyMap<string, UnidadeDoSql>,
  retry: RetryOptions = {},
): Promise<number> {
  // Guias idênticas na mesma planilha têm o mesmo hash: só a primeira entra (regra 11.1).
  const unicas = [...new Map(guias.map((g) => [g.guia.hashLinha, g])).values()];
  let novas = 0;
  for (let i = 0; i < unicas.length; i += LOTE_INSERT) {
    const linhas = unicas.slice(i, i + LOTE_INSERT).map(({ guia: g, bairroId, origem }) => {
      const u = unidades.get(g.sql);
      return {
        hash_linha: g.hashLinha,
        execucao_id: execucaoId,
        sql: g.sql,
        unidade_id: u?.unidadeId ?? null,
        predio_id: u?.predioId ?? null,
        bairro_id: bairroId,
        origem_bairro: origem,
        logradouro: g.logradouro,
        numero: g.numero,
        complemento: g.complemento,
        cep: g.cep,
        natureza: g.natureza,
        eh_compra_venda: g.ehCompraVenda,
        data_transacao: g.dataTransacao,
        mes_referencia: g.mesReferencia,
        valor_declarado: g.valorDeclarado,
        valor_venal_referencia: g.valorVenalReferencia,
        base_calculo: g.baseCalculo,
        proporcao_transmitida: g.proporcaoTransmitida,
        tipo_financiamento: g.tipoFinanciamento,
        valor_financiado: g.valorFinanciado,
        cartorio: g.cartorio,
        matricula: g.matricula,
        uso_iptu_guia: g.usoIptuGuia,
        area_construida_guia: g.areaConstruidaGuia,
        fracao_ideal_guia: g.fracaoIdealGuia,
        unidade_sem_cadastro_proprio: g.unidadeSemCadastroProprio,
      };
    });
    // Idempotente (on conflict do nothing): seguro repetir em erro transitório.
    const data = await withRetry(
      () => db.from("m2_transacoes").upsert(linhas, { onConflict: "hash_linha", ignoreDuplicates: true }).select("id"),
      "Falha ao gravar m2_transacoes",
      retry,
    );
    novas += data.length;
  }
  return novas;
}

/**
 * Regra 11.1: apaga do ano as guias de execuções anteriores que não vieram no arquivo novo e
 * marca essas execuções como "substituida". Recebe: cliente, ano, id da execução, hashes do
 * arquivo novo. Devolve: quantas guias foram apagadas.
 */
export async function replaceYear(
  db: M2Client,
  ano: number,
  execucaoId: string,
  hashes: readonly string[],
  retry: RetryOptions = {},
): Promise<number> {
  const unicos = [...new Set(hashes)];
  return withRetry(
    () => db.rpc("m2_itbi_substituir_ano", { ano, execucao_id: execucaoId, hashes: unicos }),
    `Falha na substituição do ano ${ano} (regra 11.1)`,
    retry,
  );
}

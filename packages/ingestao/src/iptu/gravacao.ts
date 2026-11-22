/**
 * Gravação idempotente de prédios, plantas e unidades do IPTU (épico 8.2).
 * - m2_predios: upsert por chave_predio (regra 11.4).
 * - m2_plantas: cada grupo da regra 11.7 reaproveita a planta existente do mesmo prédio
 *   com área de referência a até 3% (preserva área privativa, selo e confirmação — regra
 *   11.11); só grupos sem par viram plantas novas. Planta confirmada em revisão manual
 *   casa normalmente, mas nunca é regravada (regra 11.11). Plantas antigas sem par não são apagadas
 *   (podem ter calibrações e anúncios ligados; seção 7.5: sem exclusão).
 * - m2_unidades: upsert por sql.
 * Rodar duas vezes o mesmo arquivo não cria nenhuma linha nova (critério do 8.2).
 */
import { randomUUID } from "node:crypto";
import type { M2Client } from "@m2-real/db/server";
import { PLANTA_TOLERANCIA_AREA } from "../config/regras.js";
import type { Building, PlantGroup } from "./montagem.js";

const LOTE = 500;

/** Limite técnico (não é regra do spec): ids por filtro .in, para a URL não passar do limite do PostgREST. */
const IDS_POR_URL = 100;

/** max_rows padrão do PostgREST: respostas com mais linhas são cortadas sem erro. */
const MAX_LINHAS_RESPOSTA = 1000;

interface ExistingPlantRow {
  id: string;
  predio_id: string;
  area_iptu_referencia: number;
  selo: string;
  fonte_area: string | null;
}

/**
 * Lê as plantas dos prédios informados sem perder linhas para o max_rows do PostgREST:
 * se a resposta vier cheia (1.000 linhas), divide o lote ao meio e lê cada metade.
 * Recebe: cliente e ids de prédios. Devolve: todas as plantas desses prédios.
 */
async function fetchPlants(db: M2Client, ids: readonly string[]): Promise<ExistingPlantRow[]> {
  const { data, error } = await db
    .from("m2_plantas")
    .select("id, predio_id, area_iptu_referencia, selo, fonte_area")
    .in("predio_id", [...ids]);
  if (error) throw new Error(`Falha ao ler m2_plantas: ${error.message}`);
  if (data.length < MAX_LINHAS_RESPOSTA) return data as ExistingPlantRow[];
  if (ids.length === 1) throw new Error(`Prédio ${ids[0]} com ${MAX_LINHAS_RESPOSTA}+ plantas: inesperado.`);
  const meio = Math.ceil(ids.length / 2);
  return [...(await fetchPlants(db, ids.slice(0, meio))), ...(await fetchPlants(db, ids.slice(meio)))];
}

export interface ExistingPlant {
  id: string;
  areaIptuReferencia: number;
  /** Regra 11.11: confirmada em revisão manual — o pipeline casa, mas nunca altera. */
  bloqueada?: boolean;
}

/**
 * Casa os grupos novos (regra 11.7) com as plantas já gravadas do prédio.
 * Recebe: plantas existentes e grupos novos. Devolve, para cada grupo, o id da planta
 * existente mais próxima a até PLANTA_TOLERANCIA_AREA (3%), ou nulo; cada planta
 * existente casa com no máximo um grupo.
 */
export function matchPlants(existing: readonly ExistingPlant[], groups: readonly PlantGroup[]): (string | null)[] {
  // Todos os pares (grupo, planta) a até 3%, do mais próximo ao mais distante; atribuição gulosa global.
  const pares: { gi: number; id: string; dif: number }[] = [];
  groups.forEach((g, gi) => {
    for (const e of existing) {
      const dif = Math.abs(e.areaIptuReferencia - g.areaIptuReferencia) / g.areaIptuReferencia;
      if (dif <= PLANTA_TOLERANCIA_AREA) pares.push({ gi, id: e.id, dif });
    }
  });
  pares.sort((a, b) => a.dif - b.dif);
  const resultado: (string | null)[] = groups.map(() => null);
  const usadas = new Set<string>();
  for (const p of pares) {
    if (resultado[p.gi] !== null || usadas.has(p.id)) continue;
    resultado[p.gi] = p.id;
    usadas.add(p.id);
  }
  return resultado;
}

export interface WriteCounts {
  predios: number;
  plantasNovas: number;
  plantasAtualizadas: number;
  unidades: number;
}

/**
 * Grava os prédios montados.
 * Recebe: cliente service role e os prédios de assembleBuildings. Devolve: contagens.
 * Lança erro com o motivo do banco em qualquer falha (a execução fica "falhou", seção 12).
 */
export async function writeBuildings(db: M2Client, buildings: readonly Building[]): Promise<WriteCounts> {
  const counts: WriteCounts = { predios: 0, plantasNovas: 0, plantasAtualizadas: 0, unidades: 0 };
  for (let i = 0; i < buildings.length; i += LOTE) {
    const lote = buildings.slice(i, i + LOTE);

    // 1. Prédios (regra 11.4), upsert por chave_predio.
    const { data: predios, error: e1 } = await db
      .from("m2_predios")
      .upsert(
        lote.map((b) => ({
          chave_predio: b.chavePredio,
          setor: b.setor,
          quadra: b.quadra,
          numero_condominio: b.numeroCondominio,
          bairro_id: b.bairroId,
          logradouro: b.logradouro,
          numero: b.numero,
          numeros_imovel: b.numerosImovel, // P3: todos os números do condomínio
          cep: b.cep,
          ano_construcao: b.anoConstrucao,
          qtd_pavimentos: b.qtdPavimentos,
          padrao_iptu: b.padraoIptu,
          total_unidades_residenciais: b.totalUnidadesResidenciais,
          vagas_cadastro_proprio: b.vagasCadastroProprio,
          exercicio_iptu: b.exercicioIptu,
        })),
        { onConflict: "chave_predio" },
      )
      .select("id, chave_predio");
    if (e1) throw new Error(`Falha ao gravar m2_predios: ${e1.message}`);
    const idPorChave = new Map(predios.map((p) => [p.chave_predio, p.id]));
    counts.predios += predios.length;

    // 2. Plantas existentes desses prédios, em pedaços: o filtro .in vai na URL, que tem
    // limite de tamanho (bug da 1ª carga real: "URI too long" com 500 UUIDs), e a resposta é
    // cortada em max_rows = 1.000 linhas pelo PostgREST (fetchPlants divide o lote se encher).
    const ids = [...idPorChave.values()];
    const existentes: ExistingPlantRow[] = [];
    for (let k = 0; k < ids.length; k += IDS_POR_URL) existentes.push(...(await fetchPlants(db, ids.slice(k, k + IDS_POR_URL))));
    const existentesPorPredio = new Map<string, ExistingPlant[]>();
    for (const p of existentes) {
      const lista = existentesPorPredio.get(p.predio_id) ?? [];
      lista.push({
        id: p.id,
        areaIptuReferencia: Number(p.area_iptu_referencia),
        bloqueada: p.selo === "confirmada" && p.fonte_area === "revisao_manual", // regra 11.11
      });
      existentesPorPredio.set(p.predio_id, lista);
    }

    // 3. Casa grupos com plantas (regra 11.11: não perder calibração) e prepara unidades.
    const plantas: { id: string; predio_id: string; area_iptu_referencia: number; qtd_unidades: number }[] = [];
    const unidades: Record<string, unknown>[] = [];
    for (const b of lote) {
      const predioId = idPorChave.get(b.chavePredio)!;
      const doPredio = existentesPorPredio.get(predioId) ?? [];
      const bloqueadas = new Set(doPredio.filter((e) => e.bloqueada).map((e) => e.id));
      const pares = matchPlants(doPredio, b.plantas);
      const idsPlantas = b.plantas.map((g, gi) => {
        const id = pares[gi] ?? randomUUID();
        if (pares[gi]) counts.plantasAtualizadas++;
        else counts.plantasNovas++;
        // Regra 11.11: planta confirmada manualmente recebe as unidades, mas não é regravada.
        if (!bloqueadas.has(id)) {
          plantas.push({ id, predio_id: predioId, area_iptu_referencia: g.areaIptuReferencia, qtd_unidades: g.qtdUnidades });
        }
        return id;
      });
      for (const u of b.units) {
        unidades.push({
          sql: u.sql,
          predio_id: predioId,
          planta_id: u.plantaIndex === null ? null : idsPlantas[u.plantaIndex],
          tipo_unidade: u.tipoUnidade,
          complemento: u.complemento,
          uso_iptu: u.usoIptu,
          area_construida: u.areaConstruida,
          fracao_ideal: u.fracaoIdeal,
          andar_inferido: u.andarInferido,
        });
      }
    }

    // Só área de referência e quantidade mudam; selo, área privativa etc. ficam como estão.
    const { error: e3 } = await db.from("m2_plantas").upsert(plantas, { onConflict: "id" });
    if (e3) throw new Error(`Falha ao gravar m2_plantas: ${e3.message}`);

    for (let j = 0; j < unidades.length; j += LOTE * 4) {
      const { error: e4 } = await db
        .from("m2_unidades")
        .upsert(unidades.slice(j, j + LOTE * 4) as never, { onConflict: "sql" });
      if (e4) throw new Error(`Falha ao gravar m2_unidades: ${e4.message}`);
    }
    counts.unidades += unidades.length;
  }
  return counts;
}

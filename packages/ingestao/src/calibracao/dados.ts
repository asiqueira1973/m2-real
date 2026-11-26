/**
 * Leitura dos dados da calibração (épico 8.4). Toda leitura é paginada por id em páginas de até
 * 1.000 linhas: o PostgREST corta respostas maiores em silêncio (max_rows; pegadinha do CLAUDE.md).
 */
import type { M2Client } from "@m2-real/db/server";
import { withRetry, type RetryOptions } from "../shared/retry.js";
import type { GuiaCompraVenda, Selo } from "./consolidar.js";

const PAGINA = 1000;

/**
 * Lê todas as linhas de uma consulta, página a página, em ordem de id.
 * Recebe: função que monta a consulta para o intervalo [de, ate] e um rótulo para erros.
 * Devolve: todas as linhas. Para quando uma página vem com menos de PAGINA linhas.
 */
export async function fetchAllPages<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
  rotulo: string,
  retry: RetryOptions = {},
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const linhas = await withRetry(() => pagina(de, de + PAGINA - 1), rotulo, retry);
    todas.push(...linhas);
    if (linhas.length < PAGINA) return todas;
  }
}

/**
 * Lê todas as linhas por chave (id > último lido, em ordem de id), em páginas de PAGINA. Ao contrário
 * do OFFSET (range), o custo de cada página não cresce com a posição: com ~90 mil guias, as páginas
 * finais por OFFSET passavam dos 8 s do PostgREST (calibração na nuvem, 8.14).
 * Recebe: a consulta de uma página a partir do último id (nulo na primeira), rótulo e retry.
 * Devolve: todas as linhas. Só para leitura idempotente.
 */
export async function fetchAllByKey<T extends { id: string }>(
  pagina: (depoisDe: string | null, limite: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
  rotulo: string,
  retry: RetryOptions = {},
): Promise<T[]> {
  const todas: T[] = [];
  for (let ultimo: string | null = null; ; ) {
    const linhas = await withRetry(() => pagina(ultimo, PAGINA), rotulo, retry);
    todas.push(...linhas);
    if (linhas.length < PAGINA) return todas;
    ultimo = linhas[linhas.length - 1]!.id;
  }
}

interface LinhaGuia {
  id: string;
  predio_id: string;
  unidade_id: string;
  data_transacao: string;
  valor_declarado: number;
  valor_venal_referencia: number | null;
  matricula: string | null;
  unidade_sem_cadastro_proprio: boolean;
  unidade: {
    tipo_unidade: "apartamento" | "vaga" | "outro";
    area_construida: number;
    planta_id: string | null;
    planta: { area_privativa: number | null; selo: Selo; vagas_inclusas: number | null } | null;
  } | null;
  predio: { bairro_id: number } | null;
}

/**
 * Guias de compra e venda já ligadas a uma unidade do IPTU, com a planta e o bairro do prédio
 * (entrada da regra 11.15). Recebe: cliente service role. Devolve: guias no formato de consolidar.ts.
 */
export async function loadPurchaseSlips(db: M2Client, retry: RetryOptions = {}): Promise<GuiaCompraVenda[]> {
  const linhas = await fetchAllByKey<LinhaGuia>(
    (depoisDe, limite) => {
      const q = db
        .from("m2_transacoes")
        .select(
          "id, predio_id, unidade_id, data_transacao, valor_declarado, valor_venal_referencia, matricula, unidade_sem_cadastro_proprio, " +
            "unidade:m2_unidades(tipo_unidade, area_construida, planta_id, planta:m2_plantas(area_privativa, selo, vagas_inclusas)), " +
            "predio:m2_predios(bairro_id)",
        )
        .eq("eh_compra_venda", true)
        .not("unidade_id", "is", null);
      return (depoisDe ? q.gt("id", depoisDe) : q).order("id").limit(limite) as unknown as PromiseLike<{ data: LinhaGuia[] | null; error: { message: string } | null }>;
    },
    "Falha ao ler as guias de compra e venda",
    retry,
  );
  return linhas
    .filter((l) => l.unidade && l.predio)
    .map((l) => ({
      id: l.id,
      predioId: l.predio_id,
      unidadeId: l.unidade_id,
      bairroId: l.predio!.bairro_id,
      tipoUnidade: l.unidade!.tipo_unidade,
      dataTransacao: l.data_transacao,
      valorDeclarado: Number(l.valor_declarado),
      valorVenalReferencia: l.valor_venal_referencia === null ? null : Number(l.valor_venal_referencia),
      matricula: l.matricula,
      unidadeSemCadastroProprio: l.unidade_sem_cadastro_proprio,
      areaConstruida: Number(l.unidade!.area_construida),
      plantaId: l.unidade!.planta_id,
      plantaAreaPrivativa: l.unidade!.planta?.area_privativa == null ? null : Number(l.unidade!.planta.area_privativa),
      plantaSelo: l.unidade!.planta?.selo ?? "sem_dado",
      plantaVagasInclusas: l.unidade!.planta?.vagas_inclusas ?? null,
    }));
}

/**
 * Vendas em que o admin marcou ou desmarcou "fora da curva" (regra 11.11).
 * Recebe: cliente. Devolve: id da guia do apartamento → fora_da_curva definido pelo admin.
 */
export async function loadManualOutliers(db: M2Client, retry: RetryOptions = {}): Promise<Map<string, boolean>> {
  const linhas = await fetchAllPages<{ id: string; transacao_apartamento_id: string; fora_da_curva: boolean }>(
    (de, ate) =>
      db
        .from("m2_vendas_consolidadas")
        .select("id, transacao_apartamento_id, fora_da_curva")
        .eq("marcado_manual", true)
        .order("id")
        .range(de, ate),
    "Falha ao ler as vendas marcadas pelo admin",
    retry,
  );
  return new Map(linhas.map((l) => [l.transacao_apartamento_id, l.fora_da_curva]));
}

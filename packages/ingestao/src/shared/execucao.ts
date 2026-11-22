/**
 * Registro de execuções das rotinas (seção 12; observabilidade O1, plans/8.2-iptu.md).
 * Toda rotina roda dentro de runRoutine: ela abre a linha em m2_execucoes_ingestao,
 * fecha como "concluida" com as contagens ou como "falhou" com a mensagem, e antes
 * disso marca como "falhou" ("tempo esgotado") o que estiver em andamento há mais de 6 h.
 * Uma falha relança o erro, então o processo sai com código ≠ 0 e o GitHub Actions
 * manda o e-mail de falha (canal de alerta escolhido pelo usuário).
 */
import { EXECUCAO_TEMPO_ESGOTADO_HORAS, type Rotina } from "../config/regras.js";
import type { M2Client } from "@m2-real/db/server";

export type FonteDado = "itbi" | "iptu" | "anuncio" | "pagina_condominio" | "edital_leilao" | "calibracao";

/** Contagens e metadados que a rotina devolve ao terminar. */
export interface RoutineResult {
  linhasLidas: number;
  linhasGravadas: number;
  linhasDescartadas: number;
  referencia?: string | null;
  arquivoUrl?: string | null;
  arquivoHash?: string | null;
  caminhoStorage?: string | null;
}

/** Dados que a rotina pode gravar na execução enquanto roda (ex.: referência e hash). */
export interface RunningExecution {
  id: string;
}

/** Operações de banco usadas aqui; implementadas por supabaseExecutionStore e por fakes nos testes. */
export interface ExecutionStore {
  expireStale(olderThan: Date, mensagem: string): Promise<number>;
  start(rotina: Rotina, fonte: FonteDado, referencia: string | null): Promise<string>;
  finish(id: string, result: RoutineResult): Promise<void>;
  fail(id: string, mensagem: string): Promise<void>;
}

export const MENSAGEM_TEMPO_ESGOTADO = "tempo esgotado";

/**
 * Executa uma rotina com registro de execução (seção 12).
 * Recebe: store, rotina e fonte (4.4/7.2), referência (ano/exercício ou nulo), a função
 * da rotina e o relógio (injetável nos testes).
 * Devolve: o resultado da rotina e o id da execução. Em erro: grava "falhou" com a
 * mensagem e relança (o processo termina com código ≠ 0).
 */
export async function runRoutine(
  store: ExecutionStore,
  rotina: Rotina,
  fonte: FonteDado,
  referencia: string | null,
  fn: (exec: RunningExecution) => Promise<RoutineResult>,
  now: () => Date = () => new Date(),
): Promise<{ id: string; result: RoutineResult }> {
  // Seção 12: "em_andamento há mais de 6 horas é marcada falhou pela rotina seguinte".
  const limite = new Date(now().getTime() - EXECUCAO_TEMPO_ESGOTADO_HORAS * 3_600_000);
  await store.expireStale(limite, MENSAGEM_TEMPO_ESGOTADO);

  const id = await store.start(rotina, fonte, referencia);
  try {
    const result = await fn({ id });
    await store.finish(id, result);
    return { id, result };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await store.fail(id, mensagem.slice(0, 2000));
    throw erro;
  }
}

/**
 * Implementação de ExecutionStore sobre o Supabase (service role, só servidor).
 * Recebe: cliente tipado. Devolve: o store. Cada operação lança erro se o banco recusar.
 */
export function supabaseExecutionStore(db: M2Client): ExecutionStore {
  return {
    async expireStale(olderThan, mensagem) {
      const { data, error } = await db
        .from("m2_execucoes_ingestao")
        .update({ status: "falhou", mensagem_erro: mensagem, concluida_em: new Date().toISOString() })
        .eq("status", "em_andamento")
        .lt("iniciada_em", olderThan.toISOString())
        .select("id");
      if (error) throw new Error(`Falha ao expirar execuções travadas: ${error.message}`);
      return data.length;
    },
    async start(rotina, fonte, referencia) {
      const { data, error } = await db
        .from("m2_execucoes_ingestao")
        .insert({ rotina, fonte, referencia })
        .select("id")
        .single();
      if (error) throw new Error(`Falha ao abrir execução: ${error.message}`);
      return data.id;
    },
    async finish(id, r) {
      const { error } = await db
        .from("m2_execucoes_ingestao")
        .update({
          status: "concluida",
          concluida_em: new Date().toISOString(),
          linhas_lidas: r.linhasLidas,
          linhas_gravadas: r.linhasGravadas,
          linhas_descartadas: r.linhasDescartadas,
          ...(r.referencia !== undefined && { referencia: r.referencia }),
          ...(r.arquivoUrl !== undefined && { arquivo_url: r.arquivoUrl }),
          ...(r.arquivoHash !== undefined && { arquivo_hash: r.arquivoHash }),
          ...(r.caminhoStorage !== undefined && { caminho_storage: r.caminhoStorage }),
        })
        .eq("id", id);
      if (error) throw new Error(`Falha ao concluir execução: ${error.message}`);
    },
    async fail(id, mensagem) {
      const { error } = await db
        .from("m2_execucoes_ingestao")
        .update({ status: "falhou", mensagem_erro: mensagem, concluida_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Falha ao registrar erro da execução: ${error.message}`);
    },
  };
}

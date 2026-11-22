/**
 * Repetição de chamadas ao banco com erro transitório (épico 8.3; bug da 1ª carga completa do
 * ITBI, quando chamadas passaram do limite de 8 s do PostgREST com o Docker sob carga).
 * Só para operações idempotentes (consultas, insert com on conflict do nothing, substituição).
 * Erro definitivo (dado inválido, permissão) falha na hora; transitório repete com espera e,
 * esgotadas as tentativas, falha com a mensagem do banco (a execução fica "falhou", seção 12).
 */

/** Esperas padrão entre tentativas (limite técnico, não regra do spec): 3 repetições. */
export const ESPERAS_PADRAO_MS: readonly number[] = [1_000, 5_000, 15_000];

export interface RetryOptions {
  /** Espera antes de cada repetição; o tamanho define quantas repetições (testes usam zeros). */
  esperasMs?: readonly number[];
}

/** Resposta no formato do supabase-js. */
interface DbResponse<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/** Códigos do Postgres e mensagens de rede que indicam falha passageira. */
const CODIGOS_TRANSITORIOS = new Set(["57014", "40001", "40P01", "08000", "08003", "08006", "53300"]);
const MENSAGEM_TRANSITORIA = /statement timeout|timed out|ECONNRESET|ECONNREFUSED|fetch failed|socket hang up|\b50[234]\b/i;

/**
 * Diz se o erro do banco é passageiro.
 * Recebe: erro do supabase-js. Devolve: true para timeout, deadlock, conexão caída, 502/503/504.
 */
export function isTransient(error: { message: string; code?: string }): boolean {
  return (!!error.code && CODIGOS_TRANSITORIOS.has(error.code)) || MENSAGEM_TRANSITORIA.test(error.message);
}

/**
 * Executa a chamada e repete enquanto o erro for transitório.
 * Recebe: a chamada (que devolve {data, error}), um rótulo para a mensagem e as opções.
 * Devolve: os dados. Lança erro "<rótulo>: <mensagem do banco>" se falhar de vez.
 */
export async function withRetry<T>(op: () => PromiseLike<DbResponse<T>>, rotulo: string, opts: RetryOptions = {}): Promise<T> {
  const esperas = opts.esperasMs ?? ESPERAS_PADRAO_MS;
  for (let tentativa = 0; ; tentativa++) {
    const { data, error } = await op();
    if (!error) return data as T;
    if (!isTransient(error) || tentativa >= esperas.length) throw new Error(`${rotulo}: ${error.message}`);
    console.warn(`${rotulo}: erro transitório (${error.message}); tentativa ${tentativa + 2} em ${esperas[tentativa]} ms.`);
    await new Promise((r) => setTimeout(r, esperas[tentativa]));
  }
}

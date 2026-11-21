/**
 * Pacote compartilhado de acesso ao banco (seção 18.3: tipos gerados e cliente).
 *
 * O cliente com service role ignora o RLS e por isso só pode rodar no servidor:
 * na ingestão (GitHub Actions) e em apps/web/src/server/ (seções 6.3 e 20).
 * Nunca importar este cliente em código de navegador (hook guard-secrets.sh).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.js";

export type { Database } from "./types.js";
export type M2Client = SupabaseClient<Database>;

/**
 * Cria o cliente Supabase com a credencial de serviço (papel do pipeline, seção 5).
 * Recebe: variáveis de ambiente (padrão: process.env) com NEXT_PUBLIC_SUPABASE_URL
 * e SUPABASE_SERVICE_ROLE_KEY.
 * Devolve: cliente tipado, sem sessão persistida.
 * Lança erro com mensagem clara se faltar alguma das duas variáveis.
 */
export function createServiceClient(env: NodeJS.ProcessEnv = process.env): M2Client {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente (seção 18.4).",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Variáveis públicas do Supabase (seção 18.4). Recebe: o ambiente. Devolve: URL e chave anon.
 * Lança erro claro se faltarem.
 */
export function supabaseEnv(env: Record<string, string | undefined> = process.env): { url: string; anonKey: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY (seção 18.4).");
  return { url, anonKey };
}

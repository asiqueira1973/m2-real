/**
 * Cliente Supabase do painel com a SESSÃO DO USUÁRIO (chave anon + JWT do cookie), para Server
 * Components, Server Actions e Route Handlers. O RLS (m2_eh_admin(), seção 6.4) decide o que ele
 * lê; a credencial de serviço nunca é usada aqui (seções 6.3 e 20).
 * Recebe: nada (lê os cookies da requisição). Devolve: cliente tipado.
 */
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@m2-real/db";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

export async function createSessionClient() {
  const loja = await cookies();
  const { url, anonKey } = supabaseEnv();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        // Em Server Components o Next não deixa gravar cookie; a renovação fica com o proxy.
        try {
          for (const { name, value, options } of lista) loja.set(name, value, options);
        } catch {
          /* chamado de um Server Component: ignorado (o proxy renova a sessão) */
        }
      },
    },
  });
}

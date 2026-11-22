/**
 * Sessão de admin para rotas e server actions do painel (seções 5 e 6.1). Recebe: nada.
 * Devolve: o cliente da sessão e o usuário, ou o motivo da recusa (sem sessão → 401; sem perfil
 * admin ativo → 403; falha ao ler o perfil → 500). Toda escrita do 8.8 passa por aqui antes.
 */
import type { User } from "@supabase/supabase-js";
import { accessDecision } from "./acesso";
import { createSessionClient } from "./supabase/servidor";

export type SessaoAdmin =
  | { ok: true; supabase: Awaited<ReturnType<typeof createSessionClient>>; usuario: User }
  | { ok: false; status: 401 | 403 | 500; erro: string };

export async function requireAdmin(): Promise<SessaoAdmin> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  const usuario = data.user;
  const leitura = usuario
    ? await supabase.from("m2_perfis").select("papel, ativo").eq("id", usuario.id).maybeSingle()
    : { data: null, error: null };
  const decisao = accessDecision(!!usuario, leitura.data, leitura.error);
  if (decisao === "login") return { ok: false, status: 401, erro: "Sessão expirada. Entre de novo." };
  if (decisao === "sem-perfil") return { ok: false, status: 403, erro: "Acesso não autorizado. Fale com o administrador do Fechou por Quanto." };
  if (decisao === "erro") return { ok: false, status: 500, erro: "Não foi possível conferir o seu acesso. Tente de novo." };
  return { ok: true, supabase, usuario: usuario! };
}

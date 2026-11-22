/**
 * Contas de cliente MCP (seção 5; 6.5; regra 11.21; épico 8.10). SÓ SERVIDOR.
 */
import { createServiceClient } from "@m2-real/db/server";
import { CLIENTES_NOVOS_POR_DIA } from "@m2-real/ingestao/regras";
import { cookies } from "next/headers";
import { SESSAO_CLIENTE_COOKIE, verifyClientSession } from "@/server/auth/sessao-cliente";

export type Situacao = "existente" | "nova" | "bloqueada" | "pausado";

/**
 * Entrada pelo Google (6.5, passo 2; regra 11.21). Recebe: sub e e-mail verificados.
 * Devolve: o id da conta (nulo se pausado) e a situação.
 */
export async function enterClient(sub: string, email: string): Promise<{ clienteId: string | null; situacao: Situacao }> {
  const { data, error } = await createServiceClient().rpc("m2_entra_cliente", { p_sub: sub, p_email: email, p_limite_novos_dia: CLIENTES_NOVOS_POR_DIA });
  if (error) throw new Error(`Falha na entrada do cliente: ${error.message}`);
  const linha = data?.[0];
  if (!linha) throw new Error("Falha na entrada do cliente: sem resposta");
  return { clienteId: linha.cliente_id, situacao: linha.situacao as Situacao };
}

/** Conta da sessão (cookie assinado), se existir e não estiver bloqueada. Devolve: id e e-mail, ou nulo. */
export async function currentClient(): Promise<{ id: string; email: string } | null> {
  const id = await verifyClientSession((await cookies()).get(SESSAO_CLIENTE_COOKIE)?.value);
  if (!id) return null;
  const { data, error } = await createServiceClient().from("m2_clientes").select("id, email, bloqueado_em").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao ler a conta: ${error.message}`);
  return data && !data.bloqueado_em ? { id: data.id, email: data.email } : null;
}

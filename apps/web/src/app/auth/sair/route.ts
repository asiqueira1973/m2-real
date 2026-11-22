/**
 * GET /auth/sair (seção 6.1): encerra a sessão e volta ao login. Usada pelo layout do painel
 * quando o usuário está autenticado mas não tem perfil admin ativo ("é desconectado"): um Server
 * Component não pode apagar cookies, um Route Handler pode. Com ?erro=sem-perfil o login mostra a
 * mensagem da seção 15. Recebe: a requisição. Devolve: redirecionamento para /login.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/servidor";

export async function GET(request: NextRequest) {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  const destino = request.nextUrl.clone();
  destino.pathname = "/login";
  destino.search = request.nextUrl.searchParams.get("erro") === "sem-perfil" ? "?erro=sem-perfil" : "";
  return NextResponse.redirect(destino);
}

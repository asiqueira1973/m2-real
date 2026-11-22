/**
 * Proxy do Next 16 (antigo middleware; seção 6.1). Em toda requisição do painel:
 *  - renova a sessão do Supabase e grava os cookies novos na resposta;
 *  - sem usuário, manda para /login (rotas /api/* recebem 401 em JSON) (checagem otimista: a autorização de verdade é o layout do
 *    painel, que confere o perfil admin, e o RLS no banco).
 * Recebe: a requisição. Devolve: a resposta (seguir ou redirecionar).
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, unauthenticatedResponse } from "./lib/acesso";
import { supabaseEnv } from "./lib/supabase/env";

export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  const { url, anonKey } = supabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista, cabecalhos) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(cabecalhos)) resposta.headers.set(k, v);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && !isPublicPath(request.nextUrl.pathname)) {
    if (unauthenticatedResponse(request.nextUrl.pathname) === "json-401") {
      return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
    }
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  return resposta;
}

export const config = {
  // Tudo, menos estáticos do Next e a rota do MCP (que usa chave de API, seção 6.3).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/mcp).*)"],
};

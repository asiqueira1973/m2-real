/**
 * Layout do painel (seções 6.1 e 16). Confere no servidor, a cada requisição:
 *  - sem sessão → /login;
 *  - sessão sem perfil admin ativo em m2_perfis → é desconectado e vê "Acesso não autorizado";
 *  - falha ao ler o perfil → estado de erro (app/error.tsx), sem desconectar;
 *  - admin → menu lateral + página.
 * Recebe: a página. Devolve: o painel.
 */
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MenuLateral } from "@/components/menu-lateral";
import { accessDecision } from "@/lib/acesso";
import { createSessionClient } from "@/lib/supabase/servidor";
import { sair } from "../(auth)/acoes";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  const usuario = data.user;
  const leitura = usuario
    ? await supabase.from("m2_perfis").select("papel, ativo").eq("id", usuario.id).maybeSingle()
    : { data: null, error: null };
  const decisao = accessDecision(!!usuario, leitura.data, leitura.error);
  if (decisao === "login") redirect("/login");
  // Falha ao ler o perfil (banco fora do ar): erro da tela, sem desconectar o admin.
  if (decisao === "erro") throw new Error(`Falha ao conferir o perfil: ${leitura.error!.message}`);
  if (decisao === "sem-perfil") redirect("/auth/sair?erro=sem-perfil");

  return (
    <div className="flex h-screen">
      <MenuLateral email={usuario!.email ?? ""} ambiente={process.env.VERCEL_ENV === "production" ? "prod" : "dev"} sair={sair} />
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
    </div>
  );
}

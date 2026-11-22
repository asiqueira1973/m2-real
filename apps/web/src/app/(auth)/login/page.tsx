/**
 * [Admin] Login (seção 10): e-mail, senha e "esqueci a senha". Com ?erro=sem-perfil mostra a
 * mensagem da seção 15 (o layout do painel desconectou um usuário sem perfil admin ativo).
 */
import Link from "next/link";
import { MENSAGENS } from "@/lib/acesso";
import { entrar } from "../acoes";
import { FormularioAuth } from "../formulario";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-base font-medium">Entrar</h1>
      <FormularioAuth
        acao={entrar}
        botao="Entrar"
        aviso={erro === "sem-perfil" ? MENSAGENS.semPerfil : undefined}
        campos={[
          { nome: "email", rotulo: "E-mail", tipo: "email", autocomplete: "email" },
          { nome: "senha", rotulo: "Senha", tipo: "password", autocomplete: "current-password" },
        ]}
      />
      <Link href="/esqueci-senha" className="mt-4 block text-center text-sm text-primary hover:underline">Esqueci a senha</Link>
    </>
  );
}

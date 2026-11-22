/** "Esqueci a senha" (seção 6.1): pede o e-mail e dispara o e-mail padrão do Supabase. */
import Link from "next/link";
import { pedirRecuperacao } from "../acoes";
import { FormularioAuth } from "../formulario";

export default function EsqueciSenhaPage() {
  return (
    <>
      <h1 className="mb-4 text-base font-medium">Recuperar a senha</h1>
      <FormularioAuth acao={pedirRecuperacao} botao="Enviar link" campos={[{ nome: "email", rotulo: "E-mail", tipo: "email", autocomplete: "email" }]} />
      <Link href="/login" className="mt-4 block text-center text-sm text-primary hover:underline">Voltar ao login</Link>
    </>
  );
}

"use server";
/**
 * Ações de autenticação do painel (seção 6.1): entrar, pedir recuperação de senha, redefinir e sair.
 * Usam a sessão do Supabase Auth (chave anon). Sem autocadastro.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/servidor";

/** Tamanho mínimo da senha nova. Escolha técnica (o spec não fixa), acima do mínimo do Supabase (6). */
const SENHA_MIN_CARACTERES = 8;

export interface EstadoForm {
  erro?: string;
  ok?: string;
  /** Valores digitados (menos senhas), para o formulário não perdê-los depois de um erro. */
  valores?: Record<string, string>;
}

/** Entrar com e-mail e senha. Recebe: o formulário. Devolve: erro, ou redireciona para a Visão geral. */
export async function entrar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha.", valores: { email } };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: "E-mail ou senha inválidos.", valores: { email } };
  redirect("/");
}

/**
 * "Esqueci a senha": e-mail padrão do Supabase com link para /auth/confirmar (seção 6.1).
 * Recebe: o formulário. Devolve: sempre a mesma mensagem (não revela se o e-mail existe).
 */
export async function pedirRecuperacao(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { erro: "Informe o e-mail.", valores: { email } };
  const origem = (await headers()).get("origin") ?? "";
  const supabase = await createSessionClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origem}/auth/confirmar?proximo=/redefinir-senha` });
  return { ok: "Se o e-mail estiver cadastrado, você vai receber um link para criar uma senha nova.", valores: { email } };
}

/** Redefine a senha da sessão aberta pelo link do e-mail. Recebe: o formulário. Devolve: erro, ou vai para a Visão geral. */
export async function redefinirSenha(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const senha = String(form.get("senha") ?? "");
  const confirmacao = String(form.get("confirmacao") ?? "");
  if (senha.length < SENHA_MIN_CARACTERES) return { erro: `A senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.` };
  if (senha !== confirmacao) return { erro: "As senhas não conferem." };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) return { erro: "Não foi possível trocar a senha. Peça um link novo." };
  redirect("/");
}

/** Sair (rodapé do menu, seção 16). Encerra a sessão e volta ao login. */
export async function sair(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}

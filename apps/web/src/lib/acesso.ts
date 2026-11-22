/**
 * Regras de acesso do painel (seção 6.1). Funções puras, usadas pelo proxy e pelo layout.
 */

/** Rotas abertas sem sessão: login, recuperação de senha e a confirmação do link do e-mail. */
const PUBLICAS = ["/login", "/esqueci-senha", "/redefinir-senha", "/auth/confirmar", "/auth/sair"];

/** Recebe: caminho da URL. Devolve: verdadeiro se a rota não exige sessão. */
export function isPublicPath(caminho: string): boolean {
  return PUBLICAS.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

export type Decisao = "entrar" | "login" | "sem-perfil" | "erro";

/**
 * Seção 6.1: só entra quem tem linha em m2_perfis com papel admin e ativo.
 * Recebe: se há usuário autenticado, o perfil dele (ou nulo) e o erro da leitura do perfil (ou nulo).
 * Devolve: entrar; ir para o login (sem sessão); "sem-perfil" (autenticado sem perfil admin ativo:
 * é desconectado e vê a mensagem "Acesso não autorizado" da seção 15); ou "erro" quando a leitura
 * do perfil falhou — falha de banco não é ausência de perfil e não pode desconectar o admin.
 */
export function accessDecision(
  temUsuario: boolean,
  perfil: { papel: string; ativo: boolean } | null,
  erroLeitura: { message: string } | null = null,
): Decisao {
  if (!temUsuario) return "login";
  if (erroLeitura) return "erro";
  return perfil && perfil.papel === "admin" && perfil.ativo ? "entrar" : "sem-perfil";
}

/** Mensagens fixas da seção 15 usadas no painel. */
export const MENSAGENS = {
  semPerfil: "Acesso não autorizado. Fale com o administrador do Fechou por Quanto.",
} as const;

/**
 * Mensagens fixas da seção 15 do fluxo OAuth e dos limites do MCP (épico 8.10; regras 11.21 e 11.22).
 */
import { LIMITE_MENSAGEM_MINUTOS_S } from "@m2-real/ingestao/regras";

export const MENSAGENS_OAUTH = {
  entrarTitulo: "Conectar ao Fechou por Quanto",
  entrarTexto: "Entre com sua conta Google para conectar seu assistente às vendas de apartamentos do Fechou por Quanto.",
  entrarBotao: "Entrar com Google",
  erroLogin: {
    falha: "Não foi possível entrar com o Google. Tente de novo.",
    pausado: "Os cadastros novos estão pausados por hoje. Tente de novo amanhã.",
    bloqueada: "Esta conta está bloqueada. Fale com o administrador do Fechou por Quanto.",
  },
  pedidoInvalidoTitulo: "Pedido de conexão inválido",
  pedidoInvalidoTexto: "Volte ao seu assistente e comece a conexão de novo.",
  titulo: (cliente: string) => `${cliente} quer acessar o Fechou por Quanto`,
  pode: "Poderá: buscar prédios e consultar vendas, fichas, comparáveis e o m² dos bairros cobertos.",
  naoPode: "Não poderá: alterar dados nem ver qualquer informação pessoal.",
  voltaPara: (host: string) => `Depois de permitir, você volta para ${host}.`,
  comoConta: (email: string) => `Conectando como ${email}.`,
  trocarConta: "Usar outra conta",
  permitir: "Permitir",
  cancelar: "Cancelar",
  conectadoTitulo: "Conta conectada",
  conectadoTexto: "Volte ao seu assistente para continuar.",
} as const;

/** Erros do endpoint de token e do registro (RFC 6749 / 7591), com a descrição em português. */
export const ERROS_OAUTH = {
  grantType: "Só authorization_code é aceito.",
  faltando: "Faltam code, client_id, redirect_uri ou code_verifier (43 a 128 caracteres).",
  cliente: "Cliente OAuth desconhecido.",
  grant: "Código inválido, vencido, já usado ou PKCE incorreto.",
  servidor: "Erro interno. Tente de novo.",
  registroCorpo: "Envie redirect_uris (1 a 5) e, se quiser, client_name.",
  registroUri: "redirect_uri precisa ser https, ou http em localhost.",
  registroLimite: "Muitos registros de cliente agora. Tente de novo em alguns minutos.",
} as const;

/** Regra 11.22: mensagem de limite atingido. Recebe: segundos até liberar. */
export const limiteAtingido = (segundos: number) =>
  `Limite de uso atingido. Tente de novo em ${segundos >= LIMITE_MENSAGEM_MINUTOS_S ? `${Math.ceil(segundos / 60)} minutos` : `${segundos} segundos`}.`;

export type ErroLogin = keyof typeof MENSAGENS_OAUTH.erroLogin;
export const isErroLogin = (v: unknown): v is ErroLogin => typeof v === "string" && v in MENSAGENS_OAUTH.erroLogin;

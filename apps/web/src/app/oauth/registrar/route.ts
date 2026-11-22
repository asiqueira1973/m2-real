/**
 * POST /oauth/registrar — RFC 7591; seção 6.5, passo 3 (épico 8.10): registro dinâmico de cliente
 * público (sem segredo). redirect_uris: 1 a 5, só https ou http em localhost/127.0.0.1.
 * Devolve: 201 com o client_id; corpo inválido → 400; limite de registros por hora → 429.
 */
import { OAUTH_CLIENTE_NOME_MAX, OAUTH_REDIRECT_URIS_MAX } from "@m2-real/ingestao/regras";
import { z } from "zod";
import { ERROS_OAUTH } from "@/server/oauth/mensagens";
import { acceptableRedirectUri, oauthError, oauthJson, preflight, registerClient } from "@/server/oauth/server";

const Corpo = z.object({
  redirect_uris: z.array(z.string()).min(1).max(OAUTH_REDIRECT_URIS_MAX),
  client_name: z.string().trim().min(1).max(OAUTH_CLIENTE_NOME_MAX).optional(),
});

export async function POST(req: Request) {
  const corpo = Corpo.safeParse(await req.json().catch(() => null));
  if (!corpo.success) return oauthError("invalid_client_metadata", ERROS_OAUTH.registroCorpo);
  if (!corpo.data.redirect_uris.every(acceptableRedirectUri)) return oauthError("invalid_redirect_uri", ERROS_OAUTH.registroUri);
  try {
    const c = await registerClient(corpo.data.client_name ?? "Cliente MCP", corpo.data.redirect_uris);
    if (!c) return oauthError("temporarily_unavailable", ERROS_OAUTH.registroLimite, 429);
    return oauthJson({
      client_id: c.id,
      client_name: c.nome,
      redirect_uris: c.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }, 201);
  } catch (e) {
    console.error((e as Error).message);
    return oauthError("server_error", ERROS_OAUTH.servidor, 500);
  }
}

export const OPTIONS = preflight;

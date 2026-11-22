/**
 * GET /.well-known/oauth-protected-resource (e /…/mcp) — RFC 9728; seção 6.5, passo 1 (épico 8.10).
 * Diz ao cliente MCP qual é o recurso e onde autorizar. Sem autenticação. A forma com o sufixo do
 * caminho (/mcp) é a que alguns clientes pedem primeiro.
 */
import { mcpResource, oauthJson, preflight, siteOrigin } from "@/server/oauth/server";

export function GET() {
  return oauthJson({ resource: mcpResource(), authorization_servers: [siteOrigin()], bearer_methods_supported: ["header"] });
}

export const OPTIONS = preflight;

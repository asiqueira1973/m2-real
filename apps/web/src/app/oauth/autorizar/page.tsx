/**
 * [Cliente MCP] Autorizar conexão (seção 6.5, passo 4; 8.10). Sem sessão, vai para /oauth/entrar e
 * volta para cá. Mostra o nome do cliente, o que ele poderá e não poderá fazer, o host de volta e a
 * conta. "Permitir" e "Cancelar" enviam o formulário para /oauth/autorizar/decidir, que confere tudo
 * de novo. Pedido inválido → tela de erro, sem redirecionar (nunca um redirecionador aberto).
 */
import { redirect } from "next/navigation";
import { AUTHORIZE_PARAMS, checkAuthorizeParams, redirectHost } from "@/server/oauth/authorize";
import { currentClient } from "@/server/oauth/contas";
import { MENSAGENS_OAUTH as M } from "@/server/oauth/mensagens";

export default async function AutorizarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = Object.fromEntries(AUTHORIZE_PARAMS.map((k) => [k, typeof sp[k] === "string" ? sp[k] : undefined])) as Record<string, string | undefined>;
  const check = await checkAuthorizeParams(p);
  if (!check.ok) {
    return (
      <div role="alert">
        <h1 className="mb-2 text-base font-medium">{M.pedidoInvalidoTitulo}</h1>
        <p className="text-sm text-muted-foreground">{M.pedidoInvalidoTexto}</p>
      </div>
    );
  }
  const query = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();
  const volta = `/oauth/autorizar?${query}`;
  const conta = await currentClient();
  if (!conta) redirect(`/oauth/entrar?${new URLSearchParams({ volta })}`);
  return (
    <form method="post" action="/oauth/autorizar/decidir" className="space-y-3">
      <h1 className="text-base font-medium">{M.titulo(check.req.client.nome)}</h1>
      <p className="text-sm">{M.pode}</p>
      <p className="text-sm">{M.naoPode}</p>
      <p className="text-xs text-muted-foreground">{M.voltaPara(redirectHost(check.req.redirectUri))}</p>
      <p className="text-xs text-muted-foreground">
        {M.comoConta(conta.email)}{" "}
        <a href={`/api/auth/google?${new URLSearchParams({ volta })}`} className="text-primary hover:underline">{M.trocarConta}</a>
      </p>
      {AUTHORIZE_PARAMS.map((k) => (p[k] ? <input key={k} type="hidden" name={k} value={p[k]} /> : null))}
      <div className="flex gap-2 pt-2">
        <button type="submit" name="decisao" value="cancelar" className="h-10 flex-1 rounded-lg border border-border text-sm font-medium hover:bg-muted">{M.cancelar}</button>
        <button type="submit" name="decisao" value="permitir" className="h-10 flex-1 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">{M.permitir}</button>
      </div>
    </form>
  );
}

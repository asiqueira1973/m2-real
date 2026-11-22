/**
 * [Admin] Chaves de API (seção 10; 6.3; critério 5 do 8.8): criar (mostrada uma vez), lista pelo
 * prefixo (nome, prefixo, criada em, último uso, ativa) e revogar. Épico 8.10: "Contas conectadas"
 * (clientes MCP que entraram com Google pelo OAuth), com uso nas últimas 24 h e bloqueio.
 */
import { CONTAS_CONECTADAS_POR_PAGINA } from "@m2-real/ingestao/regras";
import Link from "next/link";
import { BloquearConta, CriarChave, RevogarChave } from "@/components/chaves";
import { EstadoVazio } from "@/components/estado-vazio";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadClientAccounts, loadKeys } from "@/features/operacao/dados";
import { dataHora } from "@/lib/formato";

export default async function ChavesPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const pagina = Math.max(1, Number.parseInt((await searchParams).pagina ?? "1", 10) || 1);
  const [chaves, { contas, total }] = await Promise.all([loadKeys(), loadClientAccounts(pagina)]);
  const paginas = Math.max(1, Math.ceil(total / CONTAS_CONECTADAS_POR_PAGINA));
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Chaves de API</h1>
      <p className="text-sm text-muted-foreground">Chaves do servidor MCP (cabeçalho <code>Authorization: Bearer &lt;chave&gt;</code>). O banco guarda só o hash.</p>
      <CriarChave />
      {chaves.length === 0 ? <EstadoVazio mensagem="Nenhuma chave criada ainda." /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome</TableHead><TableHead>Prefixo</TableHead><TableHead>Criada em</TableHead><TableHead>Último uso</TableHead><TableHead>Situação</TableHead><TableHead>Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {chaves.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.nome}</TableCell>
                <TableCell><code>{c.prefixo}…</code></TableCell>
                <TableCell className="tabular-nums">{dataHora(c.criado_em)}</TableCell>
                <TableCell className="tabular-nums">{c.ultimo_uso_em ? dataHora(c.ultimo_uso_em) : "nunca"}</TableCell>
                <TableCell>{c.ativa ? "Ativa" : <span className="text-muted-foreground">Revogada</span>}</TableCell>
                <TableCell>{c.ativa ? <RevogarChave id={c.id} /> : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <h2 className="pt-4 text-lg font-semibold">Contas conectadas</h2>
      <p className="text-sm text-muted-foreground">Quem conectou um assistente pelo OAuth (login com Google). Limite por conta: regra 11.22.</p>
      {contas.length === 0 ? <EstadoVazio mensagem="Nenhuma conta conectada ainda." /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>E-mail</TableHead><TableHead>Criada em</TableHead><TableHead>Último uso</TableHead><TableHead className="text-right">Chamadas 24 h</TableHead><TableHead className="text-right">Conexões</TableHead><TableHead>Situação</TableHead><TableHead>Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {contas.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.email}</TableCell>
                <TableCell className="tabular-nums">{dataHora(c.criado_em)}</TableCell>
                <TableCell className="tabular-nums">{c.ultimo_uso_em ? dataHora(c.ultimo_uso_em) : "nunca"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.chamadas_24h}</TableCell>
                <TableCell className="text-right tabular-nums">{c.tokens_ativos}</TableCell>
                <TableCell>{c.bloqueado_em ? <span className="text-destructive">Bloqueada</span> : "Ativa"}</TableCell>
                <TableCell><BloquearConta id={c.id} bloqueada={!!c.bloqueado_em} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {paginas > 1 && (
        <nav className="flex items-center gap-3 text-sm" aria-label="Páginas das contas conectadas">
          {pagina > 1 && <Link href={`/chaves?pagina=${pagina - 1}`} className="text-primary hover:underline">Anterior</Link>}
          <span className="text-muted-foreground tabular-nums">Página {pagina} de {paginas} · {total} contas</span>
          {pagina < paginas && <Link href={`/chaves?pagina=${pagina + 1}`} className="text-primary hover:underline">Próxima</Link>}
        </nav>
      )}
    </div>
  );
}

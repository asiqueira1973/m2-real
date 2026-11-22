/**
 * [Admin] Chaves de API (seção 10; 6.3; critério 5 do 8.8): criar (mostrada uma vez), lista pelo
 * prefixo (nome, prefixo, criada em, último uso, ativa) e revogar.
 */
import { CriarChave, RevogarChave } from "@/components/chaves";
import { EstadoVazio } from "@/components/estado-vazio";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadKeys } from "@/features/operacao/dados";
import { dataHora } from "@/lib/formato";

export default async function ChavesPage() {
  const chaves = await loadKeys();
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
    </div>
  );
}

"use client";
/**
 * Criar e revogar chaves de API (seção 10; 6.3; critério 5 do 8.8). A chave criada aparece uma
 * única vez, com a mensagem da seção 15. Recebe: nada (criar) ou o id (revogar).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NOME_CHAVE_MAX, NOME_CHAVE_MIN } from "@/lib/chaves-regras";

export function CriarChave() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [chave, setChave] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const valido = nome.trim().length >= NOME_CHAVE_MIN && nome.trim().length <= NOME_CHAVE_MAX;
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); iniciar(async () => {
        const r = await fetch("/api/chaves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }) });
        const j = await r.json().catch(() => null);
        if (r.status === 201) { setChave(j.chave); setErro(null); setNome(""); router.refresh(); }
        else setErro(j?.erro ?? `Erro ${r.status}`);
      }); }}>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Nome da chave
          <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={NOME_CHAVE_MAX} placeholder="ex.: Claude do Alexandre" className="w-72" />
        </label>
        <Button type="submit" disabled={!valido || pendente}>{pendente ? "Criando…" : "Criar chave"}</Button>
      </form>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {chave && (
        <div role="status" className="space-y-2 rounded-lg bg-primary/5 p-3">
          <p className="text-sm font-medium">Copie a chave agora. Ela não será mostrada de novo.</p>
          <code className="block break-all rounded bg-white px-2 py-1.5 text-xs">{chave}</code>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(chave)}>Copiar</Button>
            <Button size="sm" variant="ghost" onClick={() => setChave(null)}>Já copiei</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RevogarChave({ id }: { id: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button type="button" disabled={pendente} className="text-xs text-primary hover:underline disabled:opacity-50"
        onClick={() => {
          if (!window.confirm("Revogar esta chave? Os agentes que a usam deixam de acessar o MCP.")) return;
          iniciar(async () => {
            const r = await fetch(`/api/chaves/${id}/revogar`, { method: "POST" });
            if (r.status === 204) { setErro(null); router.refresh(); } else setErro((await r.json().catch(() => null))?.erro ?? `Erro ${r.status}`);
          });
        }}>{pendente ? "…" : "Revogar"}</button>
      {erro && <span role="alert" className="text-xs text-destructive">{erro}</span>}
    </span>
  );
}

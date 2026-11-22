"use client";
/**
 * "Executar agora" (seção 10; critério 4 do 8.8): POST /api/execucoes/disparar, que chama o
 * workflow_dispatch do GitHub no servidor. Recebe: a rotina. Devolve: o botão com o resultado.
 */
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ExecutarAgora({ rotina }: { rotina: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" disabled={pendente} onClick={() => iniciar(async () => {
        const r = await fetch("/api/execucoes/disparar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rotina }) });
        setMsg(r.status === 204
          ? { ok: true, texto: "Pedido enviado ao GitHub. A execução aparece aqui quando começar." }
          : { ok: false, texto: (await r.json().catch(() => null))?.erro ?? `Erro ${r.status}` });
      })}>{pendente ? "Enviando…" : "Executar agora"}</Button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-muted-foreground" : "text-destructive"}`}>{msg.texto}</span>}
    </span>
  );
}

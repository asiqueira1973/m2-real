"use client";
/**
 * Formulário genérico das telas de autenticação (login, esqueci a senha, redefinir senha).
 * Recebe: a server action, os campos, o rótulo do botão e um aviso inicial (ex.: "sem perfil").
 * Devolve: o formulário com a mensagem de erro ou de sucesso da ação.
 */
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoForm } from "./acoes";

interface Campo {
  nome: string;
  rotulo: string;
  tipo: "email" | "password";
  autocomplete: string;
}

export function FormularioAuth({ acao, campos, botao, aviso }: {
  acao: (estado: EstadoForm, form: FormData) => Promise<EstadoForm>;
  campos: readonly Campo[];
  botao: string;
  aviso?: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const erro = estado.erro ?? aviso;
  return (
    <form action={enviar} className="space-y-4">
      {campos.map((c) => (
        <div key={c.nome} className="space-y-1.5">
          <Label htmlFor={c.nome}>{c.rotulo}</Label>
          {/* O React 19 limpa o formulário depois da ação; o e-mail volta pelo estado (senha nunca). */}
          <Input id={c.nome} name={c.nome} type={c.tipo} autoComplete={c.autocomplete} required
            key={estado.valores?.[c.nome] ?? ""} defaultValue={c.tipo === "password" ? undefined : estado.valores?.[c.nome]} />
        </div>
      ))}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {estado.ok && <p role="status" className="text-sm text-foreground">{estado.ok}</p>}
      <Button type="submit" className="w-full" disabled={pendente}>{pendente ? "Aguarde…" : botao}</Button>
    </form>
  );
}

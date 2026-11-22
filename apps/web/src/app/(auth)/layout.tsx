/**
 * Layout das telas sem sessão (login e recuperação de senha, seção 6.1): cartão centralizado.
 * Recebe: a página. Devolve: a página dentro do cartão.
 */
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border p-8">
        <p className="mb-6 text-lg font-semibold">Fechou por Quanto</p>
        {children}
      </div>
    </main>
  );
}

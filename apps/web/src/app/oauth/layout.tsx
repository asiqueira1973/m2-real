/**
 * Layout das telas do OAuth do cliente MCP (seção 6.5; seção 16: Inter, #0071E3, hairlines; 8.10):
 * cartão centralizado, como o login do painel. Recebe: a página. Devolve: a página no cartão.
 */
import type { ReactNode } from "react";

export default function OAuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border p-8">
        <p className="mb-6 text-lg font-semibold">Fechou por Quanto</p>
        {children}
      </div>
    </main>
  );
}

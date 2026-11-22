/**
 * Página de texto legal (privacidade e termos; épico 8.10, exigência da tela de consentimento do
 * Google; seção 16: Inter, hairlines). Recebe: título, data de atualização e seções. Devolve: a página.
 */
export type SecaoLegal = { titulo: string; paragrafos: readonly string[] };

export function PaginaLegal({ titulo, atualizada, secoes }: { titulo: string; atualizada: string; secoes: readonly SecaoLegal[] }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="mb-8 text-lg font-semibold">Fechou por Quanto</p>
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Atualizada em {atualizada}</p>
      {secoes.map((s) => (
        <section key={s.titulo} className="mt-8 border-t border-border pt-6">
          <h2 className="text-base font-medium">{s.titulo}</h2>
          {s.paragrafos.map((p) => <p key={p} className="mt-3 text-sm leading-relaxed">{p}</p>)}
        </section>
      ))}
    </main>
  );
}

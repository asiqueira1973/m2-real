"use client";
/**
 * Menu lateral estilo App Store Connect (seção 16). No 8.7 só o grupo Base existe (decisão do
 * usuário, plans/8.7-painel.md); Qualidade e Operação entram no 8.8 com as telas.
 * Recebe: e-mail do usuário, ambiente (dev/prod) e a ação de sair. Devolve: o menu.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const GRUPOS = [{ titulo: "Base", itens: [{ rotulo: "Visão geral", href: "/" }, { rotulo: "Prédios", href: "/predios" }] }] as const;

/** Item ativo: "/" só na raiz; os demais também nas subpáginas (/predios/[id]). */
function ativo(caminho: string, href: string): boolean {
  return href === "/" ? caminho === "/" : caminho === href || caminho.startsWith(`${href}/`);
}

export function MenuLateral({ email, ambiente, sair }: { email: string; ambiente: "dev" | "prod"; sair: () => Promise<void> }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-white">
      <p className="px-5 pt-6 pb-4 text-sm font-semibold">Fechou por Quanto</p>
      <div className="flex-1 overflow-y-auto">
        {GRUPOS.map((g, i) => (
          <div key={g.titulo} className={i > 0 ? "border-t border-border pt-3" : ""}>
            <p className="px-5 pb-1 text-sm font-bold text-foreground">{g.titulo}</p>
            <ul className="pb-3">
              {g.itens.map((item) => {
                const atual = ativo(caminho, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={atual ? "page" : undefined}
                      className={`mx-3 block rounded-full px-5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        atual ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted"
                      }`}
                    >
                      {item.rotulo}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-5 py-4 text-xs">
        <p className="truncate text-muted-foreground" title={email}>{email}</p>
        <div className="mt-2 flex items-center justify-between">
          <form action={sair}>
            <button type="submit" className="text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">Sair</button>
          </form>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{ambiente}</span>
        </div>
      </div>
    </nav>
  );
}

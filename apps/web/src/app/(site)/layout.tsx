/**
 * Layout do site público (épico 8.11): cabeçalho, rodapé "Um produto DabLab" e as fontes do site
 * (Geist nos títulos, Inter no texto, Geist Mono no endereço). Recebe: a página. Devolve: a página.
 */
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { RODAPE } from "@/features/site/conteudo";
import s from "@/features/site/site.module.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-display" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${s.site} ${geist.variable} ${mono.variable}`}>
      <header className={s.header}>
        <div className={`${s.wrap} ${s.headerInner}`}>
          <Link href="/" className={s.marca}>Fechou por Quanto</Link>
          <nav className={s.nav} aria-label="Seções">
            <Link href="/#como-funciona">Como funciona</Link>
            <Link href="/#perguntas">Perguntas</Link>
            <Link href="/#bairros">Bairros</Link>
            <Link href="/conectar" className={s.navCta}>Conectar</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className={s.rodape}>
        <div className={`${s.wrap} ${s.rodapeGrid}`}>
          <div>
            <p className={s.rodapeProduto}>{RODAPE.produto}</p>
            <p className={s.rodapeFrase}>{RODAPE.frase}</p>
          </div>
          <nav className={s.rodapeLinks} aria-label="Rodapé">
            {RODAPE.links.map((l) => <a key={l.href} href={l.href}>{l.rotulo}</a>)}
            <a href={RODAPE.dablab.href} className={s.dablab}>{RODAPE.dablab.rotulo}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

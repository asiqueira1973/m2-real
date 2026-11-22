/**
 * [Público] Site do Fechou por Quanto (épico 8.11; seção 10): explica o produto em linguagem de
 * negócio, mostra uma conversa de exemplo com vendas reais do ITBI, os selos (11.9), perguntas de
 * exemplo, os bairros cobertos com a cobertura atual e o resumo de como conectar. Relido uma vez por dia.
 */
import { SITE_COBERTURA_MINIMA_PCT } from "@m2-real/ingestao/regras";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ATUALIZACAO, BAIRROS, COMO_FUNCIONA, CONECTAR, CONVERSA, ENDERECO_MCP, FAQ, HERO, PAGINA_CONECTAR, PERGUNTAS, PROBLEMA, SELOS,
} from "@/features/site/conteudo";
import { Copiar } from "@/features/site/copiar";
import s from "@/features/site/site.module.css";
import { loadSiteData } from "@/server/site/dados";

// Next exige número literal aqui; é o SITE_REVALIDAR_S de regras.ts (um dia), conferido em teste.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Fechou por Quanto · Por quanto o apartamento foi vendido, de verdade",
  description: HERO.subtitulo,
};

const numero = new Intl.NumberFormat("pt-BR");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10-06" → "6 de outubro de 2026". */
function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m! - 1]} de ${a}`;
}

export default async function SitePage() {
  const { cobertura, vendaMaisRecente } = await loadSiteData();
  return (
    <main>
      <section className={s.hero}>
        <div className={`${s.wrap} ${s.heroGrid}`}>
          <div>
            <p className={s.kicker}>{HERO.selo}</p>
            <h1 className={`${s.display} ${s.heroTitulo}`}>{HERO.titulo.map((l) => <span key={l}>{l}</span>)}</h1>
            <p className={s.heroSub}>{HERO.subtitulo}</p>
            <div className={s.acoes}>
              <Link href="/conectar" className={s.botao}>{HERO.acaoPrincipal}</Link>
              <a href="#perguntas" className={s.botaoSec}>{HERO.acaoSecundaria}</a>
            </div>
            <p className={s.assistentes}>{HERO.assistentes}</p>
          </div>
          <div className={s.conversa} aria-label="Exemplo de conversa com dados reais">
            <div className={s.conversaTopo}><span>Seu assistente</span><span>Exemplo real</span></div>
            <div className={s.conversaCorpo}>
              <div className={s.balao}>{CONVERSA.pergunta}</div>
              <div className={s.consulta}>
                <strong>Consultando Fechou por Quanto</strong>
                {CONVERSA.consultas.map((c) => (
                  <div key={c.nome} className={s.consultaLinha}><span>{c.nome}</span><span className={s.num}>{c.tempo}</span></div>
                ))}
              </div>
              <div className={s.resposta}>
                <p>{CONVERSA.resumo}</p>
                <table className={`${s.ficha} ${s.num}`}>
                  <tbody>
                    {CONVERSA.vendas.map((v) => (
                      <tr key={v.quando + v.valor}><td>{v.quando}</td><td>{v.valor}</td><td>{v.nota}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className={s.fecho}>{CONVERSA.fecho}</p>
              </div>
            </div>
          </div>
        </div>
        <div className={`${s.wrap} ${s.foto}`}>
          <Image src="/site/fachada.webp" alt="Fachada de um prédio residencial modernista em São Paulo" width={1600} height={1200} priority sizes="(max-width: 1120px) 100vw, 1120px" />
        </div>
      </section>

      <section className={s.secao}>
        <div className={s.wrap}>
          <p className={s.rotulo}>{PROBLEMA.rotulo}</p>
          <h2 className={`${s.display} ${s.titulo}`}>{PROBLEMA.titulo}</h2>
          <div className={s.colunas3} style={{ marginTop: 48 }}>
            {PROBLEMA.itens.map((i) => <div key={i.titulo} className={s.item}><h3 className={s.display}>{i.titulo}</h3><p>{i.texto}</p></div>)}
          </div>
        </div>
      </section>

      <section id="como-funciona" className={`${s.secao} ${s.secaoAlt}`}>
        <div className={s.wrap}>
          <p className={s.rotulo}>{COMO_FUNCIONA.rotulo}</p>
          <h2 className={`${s.display} ${s.titulo}`}>{COMO_FUNCIONA.titulo}</h2>
          <div className={s.colunas3} style={{ marginTop: 48 }}>
            {COMO_FUNCIONA.passos.map((p) => (
              <div key={p.numero} className={s.item}><span className={s.passoNum}>{p.numero}</span><h3 className={s.display}>{p.titulo}</h3><p>{p.texto}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.secao}>
        <div className={`${s.wrap} ${s.duas}`}>
          <div>
            <p className={s.rotulo}>{ATUALIZACAO.rotulo}</p>
            <h2 className={`${s.display} ${s.titulo}`}>{ATUALIZACAO.titulo}</h2>
            <p className={s.lead} style={{ marginBottom: 0 }}>{ATUALIZACAO.texto}</p>
            {vendaMaisRecente && (
              <>
                <p className={s.dataRotulo}>{ATUALIZACAO.rotuloData}</p>
                <p className={`${s.dataGrande} ${s.num}`}>{dataPorExtenso(vendaMaisRecente)}</p>
              </>
            )}
          </div>
          <Image src="/site/rua.webp" alt="Rua arborizada de um bairro residencial de São Paulo" width={1800} height={1160} sizes="(max-width: 860px) 100vw, 540px" />
        </div>
      </section>

      <section className={`${s.secao} ${s.secaoAlt}`}>
        <div className={`${s.wrap} ${s.duas}`} style={{ alignItems: "start" }}>
          <div>
            <p className={s.rotulo}>{SELOS.rotulo}</p>
            <h2 className={`${s.display} ${s.titulo}`}>{SELOS.titulo}</h2>
            <p className={s.lead}>{SELOS.texto}</p>
            <Image src="/site/varandas.webp" alt="Varandas de um prédio residencial ao fim da tarde" width={1200} height={1600} sizes="(max-width: 860px) 100vw, 540px" />
          </div>
          <div className={s.selos}>
            {SELOS.itens.map((i) => (
              <div key={i.nome} className={s.selo}>
                <span className={`${s.seloNome} ${s[i.classe]}`}>{i.nome}</span>
                <p className={s.seloTexto}>{i.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="perguntas" className={s.secao}>
        <div className={s.wrap}>
          <p className={s.rotulo}>{PERGUNTAS.rotulo}</p>
          <h2 className={`${s.display} ${s.titulo}`}>{PERGUNTAS.titulo}</h2>
          <p className={s.lead}>{PERGUNTAS.texto}</p>
          <div className={s.grupos}>
            {PERGUNTAS.grupos.map((g) => (
              <div key={g.quem} className={s.grupo}>
                <h3>{g.quem}</h3>
                {g.perguntas.map((p) => (
                  <div key={p} className={s.pergunta}><p>{p}</p><Copiar texto={p} className={s.copiar} /></div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="bairros" className={`${s.secao} ${s.secaoAlt}`}>
        <div className={s.wrap}>
          <p className={s.rotulo}>{BAIRROS.rotulo}</p>
          <h2 className={`${s.display} ${s.titulo}`}>{BAIRROS.titulo}</h2>
          <p className={s.lead}>{BAIRROS.texto}</p>
          <div className={s.bairros}>
            {cobertura.map((c) => (
              <div key={c.bairro} className={s.bairro}>
                <p className={s.bairroNome}>{c.bairro}</p>
                <p className={`${s.bairroNum} ${s.num}`}>{numero.format(c.vendas24m)}</p>
                <p className={s.bairroRotulo}>{BAIRROS.rotuloVendas}</p>
                <p className={s.bairroRotulo}>{c.pct >= SITE_COBERTURA_MINIMA_PCT ? `${numero.format(Math.round(c.pct))}% ${BAIRROS.rotuloCobertura}` : BAIRROS.rotuloCalibrando}</p>
              </div>
            ))}
          </div>
          <div className={s.fotoLarga}>
            <Image src="/site/vista.webp" alt="Vista do alto de prédios residenciais da zona oeste de São Paulo" width={1800} height={1020} sizes="(max-width: 1120px) 100vw, 1120px" />
          </div>
        </div>
      </section>

      <section id="conectar" className={s.secao}>
        <div className={`${s.wrap} ${s.duas}`} style={{ alignItems: "start" }}>
          <div>
            <p className={s.rotulo}>{CONECTAR.rotulo}</p>
            <h2 className={`${s.display} ${s.titulo}`}>{CONECTAR.titulo}</h2>
            <div className={s.endereco}><code>{ENDERECO_MCP}</code><Copiar texto={ENDERECO_MCP} rotulo={PAGINA_CONECTAR.copiar} copiado={PAGINA_CONECTAR.copiado} /></div>
            <Link href="/conectar" className={s.linkSeta}>{CONECTAR.link}</Link>
          </div>
          <div className={s.selos}>
            {CONECTAR.passos.map((p, i) => (
              <div key={p.titulo} className={s.selo}>
                <span className={s.display}>{String(i + 1).padStart(2, "0")} · {p.titulo}</span>
                <p className={s.seloTexto}>{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.secao} ${s.secaoAlt}`}>
        <div className={s.wrap}>
          <p className={s.rotulo}>{FAQ.rotulo}</p>
          <div className={s.faq}>
            {FAQ.itens.map((f) => <details key={f.p}><summary>{f.p}</summary><p>{f.r}</p></details>)}
          </div>
        </div>
      </section>
    </main>
  );
}

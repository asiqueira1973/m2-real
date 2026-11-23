"use client";
/**
 * "Teste aqui" (épico 8.13; regra 11.23): campo de endereço, Turnstile e o resultado com as 3 vendas
 * mais recentes, seguido do convite para conectar o assistente. Recebe: a chave pública do Turnstile.
 */
import { MCP_ENDERECO_MAX, MCP_ENDERECO_MIN } from "@m2-real/ingestao/regras";
import Link from "next/link";
import Script from "next/script";
import { useActionState, useEffect, useRef } from "react";
import { testarEndereco } from "@/app/(site)/acoes";
import type { ResultadoTeste } from "@/server/site/teste";
import { TESTE } from "./conteudo";
import s from "./site.module.css";

type Turnstile = {
  render: (el: HTMLElement, opcoes: { sitekey: string; language: string; theme: string }) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-09-21" → "set/2026". */
const mesAno = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;

export function TesteEndereco({ siteKey }: { siteKey: string }) {
  const [resultado, enviar, pendente] = useActionState<ResultadoTeste | null, FormData>(testarEndereco, null);
  const widget = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);

  // Desenha o widget quando o script e o container existem (renderização explícita: a implícita
  // não roda quando a página chega pela navegação interna do Next).
  const desenhar = () => {
    const ts = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (!ts || !widget.current || id.current) return;
    id.current = ts.render(widget.current, { sitekey: siteKey, language: "pt-br", theme: "light" });
  };
  useEffect(() => {
    desenhar();
    return () => {
      const ts = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (ts && id.current) ts.remove(id.current);
      id.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O token vale para um envio só: renova depois de cada resposta. Falha ao renovar não derruba a tela.
  useEffect(() => {
    if (!resultado || !id.current) return;
    try {
      (window as unknown as { turnstile?: Turnstile }).turnstile?.reset(id.current);
    } catch {
      /* no pior caso, a próxima busca pede o desafio de novo */
    }
  }, [resultado]);

  return (
    <div className={s.teste}>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={desenhar} />
      <form action={enviar} className={s.testeForm}>
        <label className={s.testeRotulo} htmlFor="endereco">{TESTE.rotuloCampo}</label>
        <div className={s.testeLinha}>
          <input id="endereco" name="endereco" required minLength={MCP_ENDERECO_MIN} maxLength={MCP_ENDERECO_MAX} placeholder={TESTE.exemplo} className={s.testeCampo} autoComplete="street-address" />
          <button type="submit" disabled={pendente} className={s.botao}>{pendente ? TESTE.buscando : TESTE.botao}</button>
        </div>
        <div ref={widget} />
      </form>
      <div aria-live="polite">
        {resultado?.tipo === "erro" && <p role="alert" className={s.testeAviso}>{resultado.mensagem}</p>}
        {resultado?.tipo === "fora" && <p className={s.testeAviso}>{resultado.mensagem}</p>}
        {resultado?.tipo === "limite" && (
          <div className={s.testeResultado}>
            <p>{TESTE.limite}</p>
            <Link href="/conectar" className={s.botao}>{TESTE.conectar}</Link>
          </div>
        )}
        {resultado?.tipo === "ok" && (
          <div className={s.testeResultado}>
            <p className={s.testePredio}>
              {resultado.predio.endereco}
              {resultado.predio.bairro ? ` · ${resultado.predio.bairro}` : ""}
              {resultado.predio.ano_construcao ? ` · ${resultado.predio.ano_construcao}` : ""}
            </p>
            {resultado.vendas.length === 0 ? <p>{TESTE.semVendas}</p> : (
              <table className={`${s.ficha} ${s.num}`}>
                <tbody>
                  {resultado.vendas.map((v, i) => (
                    <tr key={v.data + i}>
                      <td>{mesAno(v.data)}</td>
                      <td>{moeda.format(v.valor_total)}</td>
                      <td>{v.valor_vagas > 0 ? `${TESTE.vagaJunto} ${moeda.format(v.valor_vagas)}` : TESTE.semVaga}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className={s.fecho}>{TESTE.convite}</p>
            <Link href="/conectar" className={s.botao}>{TESTE.conectar}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

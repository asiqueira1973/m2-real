/**
 * [Público] Conectar (épico 8.11; seção 10): o endereço do MCP com botão de copiar e o passo a passo
 * do Claude, do ChatGPT e do Grok em abas, com a dica de selecionar o conector na conversa.
 */
import type { Metadata } from "next";
import Image from "next/image";
import { AbasAssistentes } from "@/features/site/abas";
import { ASSISTENTES, ENDERECO_MCP, PAGINA_CONECTAR } from "@/features/site/conteudo";
import { Copiar } from "@/features/site/copiar";
import s from "@/features/site/site.module.css";

export const metadata: Metadata = {
  title: "Conectar · Fechou por Quanto",
  description: PAGINA_CONECTAR.texto,
};

export default function ConectarPage() {
  return (
    <main className={s.secao}>
      <div className={s.wrap}>
        <h1 className={`${s.display} ${s.titulo}`}>{PAGINA_CONECTAR.titulo}</h1>
        <p className={s.lead}>{PAGINA_CONECTAR.texto}</p>
        <p className={s.rotulo}>{PAGINA_CONECTAR.rotuloEndereco}</p>
        <div className={s.endereco}><code>{ENDERECO_MCP}</code><Copiar texto={ENDERECO_MCP} rotulo={PAGINA_CONECTAR.copiar} copiado={PAGINA_CONECTAR.copiado} /></div>
        <AbasAssistentes assistentes={ASSISTENTES} classes={{ abas: s.abas!, aba: s.aba!, passos: s.passos! }} />
        <p className={s.nota}>{PAGINA_CONECTAR.dica}</p>
        <p className={s.nota}>{PAGINA_CONECTAR.teste}</p>
        <div className={s.fotoLarga}>
          <Image src="/site/por-do-sol.webp" alt="Vista da Praça do Pôr do Sol para os prédios de Pinheiros ao entardecer" width={1800} height={1020} sizes="(max-width: 1120px) 100vw, 1120px" />
        </div>
      </div>
    </main>
  );
}

"use server";
/**
 * Server action do "Teste aqui" (épico 8.13; regra 11.23). Fica na página do site, que está fora do
 * proxy, e não em /api (que exige sessão do painel). Recebe: o FormData com o endereço e o token do
 * Turnstile. Devolve: o resultado para a tela. Gera o evento fechou_por_quanto_teste_site.
 */
import { createServiceClient } from "@m2-real/db/server";
import { headers } from "next/headers";
import { track } from "@/server/eventos/visao";
import { clientIp, runSiteTest, type ResultadoTeste } from "@/server/site/teste";

export async function testarEndereco(_anterior: ResultadoTeste | null, form: FormData): Promise<ResultadoTeste> {
  const endereco = String(form.get("endereco") ?? "");
  const token = String(form.get("cf-turnstile-response") ?? "");
  try {
    const { resultado, hash } = await runSiteTest(createServiceClient(), endereco, token, clientIp(await headers()));
    if (resultado.tipo !== "erro") {
      track("fechou_por_quanto_teste_site", async () => ({
        quem: `anon_${hash.slice(0, 12)}`,
        propriedades: { encontrou: resultado.tipo !== "fora", permitido: resultado.tipo === "ok", vendas: resultado.tipo === "ok" ? resultado.vendas.length : 0 },
      }));
    }
    return resultado;
  } catch (e) {
    console.error("teste_site_falhou", (e as Error).message);
    return { tipo: "erro", mensagem: "Não foi possível consultar agora. Tente de novo em instantes." };
  }
}

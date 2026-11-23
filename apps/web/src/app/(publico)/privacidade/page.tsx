/**
 * [Público] Política de privacidade (épico 8.10; seção 20; princípio 4). Exigida pela tela de
 * consentimento do Google e mostrada a quem conecta o MCP.
 */
import type { Metadata } from "next";
import { PaginaLegal } from "@/components/pagina-legal";

export const metadata: Metadata = { title: "Privacidade · Fechou por Quanto" };

const SECOES = [
  { titulo: "Quem somos", paragrafos: [
    "O Fechou por Quanto é um serviço da DabLab que mostra por quanto os apartamentos de alguns bairros de São Paulo foram vendidos, a partir de dados públicos da Prefeitura (ITBI e IPTU). Contato: alexandre@dablab.com.br.",
  ] },
  { titulo: "O que guardamos sobre você", paragrafos: [
    "Ao conectar um assistente (como o Claude) com sua conta Google, guardamos só o identificador da conta Google e o e-mail. Não guardamos nome, foto, contatos nem nada do seu Google além disso.",
    "Guardamos também o nome do aplicativo que você conectou, a data da conexão, a data do último uso e quantas consultas foram feitas por minuto, para aplicar os limites de uso e evitar abuso.",
    "Não guardamos o conteúdo das suas conversas com o assistente; recebemos só as consultas que ele faz às ferramentas (por exemplo, um endereço).",
    "No teste de endereço do site, sem login, guardamos por 30 dias só um código irreversível gerado a partir do seu endereço IP e o prédio consultado, para limitar o teste a um prédio por pessoa. O IP em si não é guardado.",
  ] },
  { titulo: "Para que usamos", paragrafos: [
    "Para identificar a sua conexão, aplicar os limites de uso, bloquear uso abusivo e entender como o serviço é usado. Não vendemos seus dados a ninguém e não mandamos e-mails de marketing.",
    "Para medir o uso, registramos dois eventos no Visão de Produto, a ferramenta de métricas da própria DabLab: quando você se conecta pela primeira vez e cada consulta que o seu assistente faz. Cada evento leva o seu e-mail, o nome da ferramenta consultada e o nome do aplicativo (Claude, ChatGPT…). Nunca levam o endereço consultado nem o texto da sua pergunta.",
  ] },
  { titulo: "Dados das vendas", paragrafos: [
    "As vendas vêm de bases públicas da Prefeitura de São Paulo. O Fechou por Quanto não guarda nome, CPF ou qualquer dado de compradores, vendedores ou proprietários.",
  ] },
  { titulo: "Onde ficam e por quanto tempo", paragrafos: [
    "Os dados ficam em um banco Supabase, o site roda na Vercel e os eventos de uso ficam no Visão de Produto, da DabLab. A contagem de uso é apagada depois de 2 dias. A conta fica guardada enquanto existir; você pode pedir a exclusão a qualquer momento pelo e-mail acima, e ela é feita em até 15 dias.",
  ] },
  { titulo: "Seus direitos", paragrafos: [
    "Pela LGPD, você pode pedir acesso, correção ou exclusão dos seus dados e revogar a conexão. Remover o conector no seu assistente faz ele parar de usar a conexão, mas o acesso só é cancelado no Fechou por Quanto quando você pede: escreva para alexandre@dablab.com.br e a conta é bloqueada ou excluída.",
  ] },
] as const;

export default function PrivacidadePage() {
  return <PaginaLegal titulo="Política de privacidade" atualizada="23/11/2026" secoes={SECOES} />;
}

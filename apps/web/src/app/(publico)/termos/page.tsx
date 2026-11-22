/**
 * [Público] Termos de uso (épico 8.10; regras 11.21 e 11.22). Exigidos pela tela de consentimento
 * do Google e mostrados a quem conecta o MCP.
 */
import type { Metadata } from "next";
import { PaginaLegal } from "@/components/pagina-legal";

export const metadata: Metadata = { title: "Termos de uso · Fechou por Quanto" };

const SECOES = [
  { titulo: "O serviço", paragrafos: [
    "O Fechou por Quanto oferece consultas às vendas de apartamentos registradas no ITBI da Prefeitura de São Paulo, com a área calibrada pelo próprio serviço, por meio de um servidor MCP usado por assistentes de IA. O uso é gratuito.",
  ] },
  { titulo: "Não é avaliação", paragrafos: [
    "Os valores são declarados pelas partes na transmissão do imóvel e podem não refletir o preço real. A área privativa é estimada e cada resposta traz o selo de confiança dela. Nada aqui é laudo, avaliação imobiliária nem recomendação de compra ou venda.",
  ] },
  { titulo: "Uso aceitável", paragrafos: [
    "Cada conta tem limite de consultas por minuto e por dia. É proibido tentar copiar a base em massa, contornar os limites, usar várias contas para somar limites ou atrapalhar o serviço. Contas que fizerem isso podem ser bloqueadas sem aviso.",
  ] },
  { titulo: "Disponibilidade", paragrafos: [
    "O serviço é oferecido como está, sem garantia de disponibilidade ou de exatidão, e pode mudar ou ser encerrado. Os dados são atualizados conforme a Prefeitura publica.",
  ] },
  { titulo: "Privacidade", paragrafos: [
    "O tratamento dos seus dados está descrito na Política de privacidade, em fechouporquanto.com.br/privacidade.",
  ] },
  { titulo: "Contato e foro", paragrafos: [
    "Dúvidas: alexandre@dablab.com.br. Estes termos seguem a lei brasileira, com foro na cidade de São Paulo.",
  ] },
] as const;

export default function TermosPage() {
  return <PaginaLegal titulo="Termos de uso" atualizada="23/11/2026" secoes={SECOES} />;
}

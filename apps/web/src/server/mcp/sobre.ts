/**
 * Ferramenta `sobre` e instruções do servidor MCP (seção 13.2, acréscimo pedido pelo usuário em
 * 23/11/2026). Explica ao assistente o que o Fechou por Quanto é, quais bairros cobre, de onde vêm os
 * dados, como o m² é calculado, o que os selos significam e qual é a cobertura atual de cada bairro,
 * para que ele responda sem inventar. SÓ SERVIDOR.
 */
import { NOMES_BAIRROS } from "@m2-real/ingestao/bairros";
import { MCP_CHAMADAS_POR_DIA, MCP_CHAMADAS_POR_MINUTO } from "@m2-real/ingestao/regras";

/** Os bairros da tabela 11.2, com o nome de exibição (fonte única em @m2-real/ingestao/bairros). */
export const BAIRROS_COBERTOS = NOMES_BAIRROS;

/** Instruções do servidor (campo `instructions` do initialize do MCP): o resumo que o assistente lê ao conectar. */
export const INSTRUCOES_MCP = [
  `Fechou por Quanto: por quanto os apartamentos foram realmente vendidos em ${BAIRROS_COBERTOS.length} bairros de São Paulo, nas zonas oeste e sul e no centro expandido`,
  `(${BAIRROS_COBERTOS.join(", ")}), a partir do ITBI da Prefeitura, com a área privativa calibrada por anúncios e editais.`,
  "Diferencial: as vendas vêm do ITBI, carregado todo mês (dia 8), assim que a Prefeitura publica; não são preços de anúncio.",
  "Todo m² vem com um selo de confiança da área privativa: Confirmada (edital ou revisão), Calibrada (2+ anúncios que concordam),",
  "Indicativa (1 anúncio), Estimada (área do IPTU × fator de prédios parecidos) ou Sem dado.",
  "Para perguntas sobre o próprio serviço (o que é, bairros, fontes, método, selos, cobertura), chame a ferramenta `sobre`.",
  "Para um endereço, chame primeiro `buscar_predio` e use o predio_id nas outras ferramentas.",
  "Sempre informe o selo junto de cada m² e não trate os valores como avaliação.",
].join(" ");

/** Selos da regra 11.9, do mais forte ao mais fraco, em linguagem simples. */
export const SELOS_EXPLICADOS = [
  { selo: "Confirmada", como: "Revisão manual ou edital de leilão casado com a unidade (documento oficial)." },
  { selo: "Calibrada", como: "Dois ou mais anúncios de sites diferentes da mesma planta, com áreas que batem a até 3%." },
  { selo: "Indicativa", como: "Um anúncio só, ou dois que concordam a até 8%." },
  { selo: "Estimada", como: "Sem anúncio da planta: área do IPTU × fator de referência aprendido com prédios parecidos (bairro, década, vagas)." },
  { selo: "Sem dado", como: "Sem anúncio e ainda sem fator de referência; o m² privativo não é calculado." },
] as const;

export type CoberturaBairro = { bairro_nome: string; vendas_24m: number; pct_cobertura: number; calculado_em: string };

/**
 * Conteúdo da ferramenta `sobre`. Recebe: a última foto de cobertura de cada bairro e a data da venda mais recente.
 * Devolve: o texto estruturado (o envelope da 13.2 é acrescentado por runTool).
 */
export function aboutPayload(cobertura: readonly CoberturaBairro[], vendaMaisRecente: string | null) {
  return {
    o_que_e: "O Fechou por Quanto mostra por quanto os apartamentos foram realmente vendidos, prédio a prédio, com o m² calculado sobre a área privativa (a do anúncio), e não sobre a área do IPTU.",
    atualizacao: {
      destaque: "Vendas reais e recentes: o ITBI é carregado todo mês, no dia 8, assim que a Prefeitura publica a planilha. Não são preços pedidos em anúncios.",
      venda_mais_recente: vendaMaisRecente,
      itbi: "mensal (dia 8)",
      anuncios: "semanal (segundas-feiras)",
      editais_de_leilao: "semanal (quartas-feiras)",
      iptu: "anual",
    },
    bairros: BAIRROS_COBERTOS,
    regioes: "Zona oeste e centro expandido (Perdizes a Itaim Bibi) e zona sul (Moema, Vila Nova Conceição, Brooklin e Campo Belo).",
    fontes: [
      { fonte: "ITBI da Prefeitura de São Paulo", uso: "Vendas reais: data, valor declarado e unidade. Carregado todo mês, no dia 8." },
      { fonte: "IPTU (GeoSampa)", uso: "Prédios, unidades, área construída e ano de construção. Carga anual." },
      { fonte: "Anúncios de imóveis", uso: "Área privativa de cada planta. Coleta semanal, priorizando prédios com mais vendas e selo mais fraco." },
      { fonte: "Editais de leilão", uso: "Área privativa oficial da unidade (matrícula ou laudo). Coleta semanal." },
    ],
    metodo: [
      "As unidades do IPTU com o mesmo setor, quadra e condomínio formam o prédio; unidades de área parecida formam uma planta.",
      "Cada venda do ITBI é ligada à unidade; vagas vendidas em guia separada são somadas ao apartamento da mesma data.",
      "O m² privativo é o valor da venda dividido pela área privativa da planta. A área privativa vem de anúncios e editais, e o selo diz de onde veio.",
      "Vendas muito fora da mediana do prédio (ou do bairro) são marcadas como fora da curva e ficam fora das medianas.",
      "As medianas usam só vendas com selo Estimada ou melhor e sempre vêm com o número de vendas e a distribuição por selo.",
    ],
    selos: SELOS_EXPLICADOS,
    cobertura_atual: cobertura.map((c) => ({ bairro: c.bairro_nome, vendas_24m: c.vendas_24m, pct_cobertura: Number(c.pct_cobertura), calculado_em: c.calculado_em })),
    cobertura_explicada: "pct_cobertura = parte das vendas dos últimos 24 meses do bairro com selo Estimada ou melhor (ou seja, com m² privativo calculado).",
    ferramentas: {
      buscar_predio: "Acha o prédio pelo endereço (comece por aqui).",
      ficha_predio: "Plantas, áreas e selos de um prédio.",
      vendas_predio: "Vendas do prédio com m² privativo e mediana.",
      m2_bairro: "Mediana, p25 e p75 do m² no bairro, com filtro de quartos.",
      comparaveis: "Vendas parecidas no bairro (área ±20%, década ±1).",
      sobre: "Este resumo.",
    },
    limites: `Cada conta conectada pode fazer até ${MCP_CHAMADAS_POR_MINUTO} consultas por minuto e ${MCP_CHAMADAS_POR_DIA} por dia.`,
    avisos: [
      "Os valores são os declarados no ITBI e podem diferir do preço negociado.",
      "Nada aqui é laudo ou avaliação imobiliária.",
      "O Fechou por Quanto não guarda nem mostra dados de compradores, vendedores ou proprietários.",
    ],
    site: "https://fechouporquanto.com.br",
  };
}

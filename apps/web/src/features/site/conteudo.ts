/**
 * Texto do site público (épico 8.11), todo num lugar só para revisar. Linguagem de negócio, sem
 * jargão técnico. Os números do exemplo são vendas reais do ITBI (Rua João Ramalho, 586, Perdizes),
 * sem o número do apartamento.
 */

import { MCP_CHAMADAS_POR_DIA, MCP_CHAMADAS_POR_MINUTO } from "@m2-real/ingestao/regras";

/** Endereço do servidor MCP que a pessoa cola no assistente. */
export const ENDERECO_MCP = "https://fechouporquanto.com.br/mcp";

export const HERO = {
  selo: "Vendas registradas na Prefeitura de São Paulo",
  titulo: ["Por quanto o apartamento foi vendido.", "De verdade."],
  subtitulo:
    "Pergunte ao seu assistente de IA e receba o valor das vendas reais, prédio a prédio, com a área certa e o grau de confiança de cada número.",
  acaoPrincipal: "Conectar ao meu assistente",
  acaoSecundaria: "Ver perguntas de exemplo",
  assistentes: "Funciona no Claude, no ChatGPT e no Grok",
};

/** Mock da conversa do hero: dados reais do ITBI, sem o número da unidade. */
export const CONVERSA = {
  pergunta: "Por quanto foram vendidos os últimos apartamentos da Rua João Ramalho, 586?",
  consultas: [
    { nome: "Encontrar o prédio", tempo: "0,4 s" },
    { nome: "Vendas do prédio", tempo: "0,3 s" },
  ],
  resumo: "Prédio de 1974 em Perdizes. As quatro vendas mais recentes registradas no ITBI:",
  vendas: [
    { quando: "set/2026", valor: "R$ 1.600.000", nota: "2 vagas vendidas junto" },
    { quando: "set/2026", valor: "R$ 1.820.000", nota: "1 vaga" },
    { quando: "jan/2026", valor: "R$ 1.710.000", nota: "1 vaga" },
    { quando: "dez/2025", valor: "R$ 1.550.000", nota: "2 vagas" },
  ],
  fecho: "Valores declarados na transferência do imóvel. A vaga de garagem tem escritura própria e foi somada ao apartamento.",
};

export const PROBLEMA = {
  rotulo: "O problema",
  titulo: "O m² que circula por aí costuma estar errado.",
  itens: [
    { titulo: "Anúncio não é venda", texto: "O preço do anúncio é o que o dono pede. O que foi pago de fato só aparece no registro da Prefeitura, e quase ninguém consulta." },
    { titulo: "A área do IPTU engana", texto: "O IPTU soma parede, área comum e às vezes a vaga. Dividir o preço por essa área faz o m² parecer mais barato do que é." },
    { titulo: "A vaga vem separada", texto: "Em muitos prédios a vaga tem escritura própria. Quem não soma as duas guias subestima o valor da venda." },
  ],
};

export const COMO_FUNCIONA = {
  rotulo: "Como funciona",
  titulo: "Do registro da Prefeitura à resposta no seu assistente.",
  passos: [
    { numero: "01", titulo: "A Prefeitura registra a venda", texto: "Toda compra de imóvel em São Paulo paga ITBI, e a Prefeitura publica cada transação com data, valor e unidade." },
    { numero: "02", titulo: "Ligamos a venda ao apartamento", texto: "Cada venda é ligada ao prédio, à planta e à vaga. A área real do apartamento vem de anúncios e editais, conferidos entre si." },
    { numero: "03", titulo: "Seu assistente responde", texto: "Você pergunta em português, do seu jeito. A resposta vem com o valor, o m² e quanto dá para confiar naquele número." },
  ],
};

export const ATUALIZACAO = {
  rotulo: "Sempre recente",
  titulo: "Atualizado todo mês, assim que a Prefeitura publica.",
  texto:
    "Todo dia 8 conferimos a planilha do ITBI e trazemos as vendas novas. A Prefeitura publica cada venda com cerca de um mês de defasagem. Anúncios e editais são conferidos toda semana, e o cadastro do IPTU é renovado uma vez por ano.",
  rotuloConferencia: "Última conferência na Prefeitura",
  rotuloData: "Vendas registradas até",
};

export const SELOS = {
  rotulo: "Transparência",
  titulo: "Quanto confiar em cada número.",
  texto: "Todo m² vem com um selo que diz de onde veio a área do apartamento. Você decide o peso de cada resposta.",
  itens: [
    { nome: "Confirmada", classe: "confirmada", texto: "A área vem de um documento oficial, como o edital de um leilão, ou foi revisada por nós." },
    { nome: "Calibrada", classe: "calibrada", texto: "Dois ou mais anúncios diferentes mostram a mesma área para aquela planta." },
    { nome: "Indicativa", classe: "indicativa", texto: "Um anúncio só, ou anúncios que concordam com uma margem um pouco maior." },
    { nome: "Estimada", classe: "estimada", texto: "Sem anúncio da planta: a área é estimada a partir de prédios parecidos do mesmo bairro e época." },
    { nome: "Sem dado", classe: "sem-dado", texto: "Ainda não há base para a área. O valor da venda aparece, mas o m² fica de fora." },
  ],
};

export const PERGUNTAS = {
  rotulo: "Perguntas de exemplo",
  titulo: "Pergunte como você perguntaria a um colega.",
  texto: "Copie uma pergunta e cole no seu assistente. Antes, selecione o Fechou por Quanto na conversa.",
  grupos: [
    {
      quem: "Para quem vai comprar",
      perguntas: [
        "Por quanto foram vendidos os apartamentos da Rua João Ramalho, 586 nos últimos dois anos?",
        "Qual o m² mediano de apartamentos de 3 quartos em Perdizes?",
      ],
    },
    {
      quem: "Para quem vai vender",
      perguntas: [
        "Tenho um apartamento de 95 m² no Itaim Bibi. Por quanto foram vendidos os parecidos na região?",
        "Qual a faixa de preço do m² em Jardins nos últimos 24 meses?",
      ],
    },
    {
      quem: "Para corretores e avaliadores",
      perguntas: [
        "Compare o m² mediano de Pinheiros, Vila Madalena e Alto de Pinheiros.",
        "Quantas vendas teve o prédio da Rua Iguatemi, 150 e qual foi a mais recente?",
      ],
    },
    {
      quem: "Para começar",
      perguntas: [
        "O que é o Fechou por Quanto e quais bairros ele cobre?",
        "O que significam os selos Calibrada e Estimada?",
      ],
    },
  ],
};

export const BAIRROS = {
  rotulo: "Onde funciona",
  titulo: "Dez bairros da zona oeste e do centro expandido.",
  texto: "Começamos onde há mais vendas e mais dúvida sobre o preço. O número embaixo de cada bairro é quantas vendas de apartamento a Prefeitura registrou nos últimos dois anos.",
  rotuloVendas: "vendas em 24 meses",
};

export const CONECTAR = {
  rotulo: "Como conectar",
  titulo: "Três minutos, sem instalar nada.",
  passos: [
    { titulo: "Copie o endereço", texto: "É o mesmo para todos os assistentes." },
    { titulo: "Cole no seu assistente", texto: "Na área de conectores ou aplicativos do Claude, do ChatGPT ou do Grok." },
    { titulo: "Entre com o Google", texto: "Autorize a conexão e pronto. Não pedimos cartão nem cadastro longo." },
  ],
  link: "Ver o passo a passo de cada assistente",
};

export const FAQ = {
  rotulo: "Perguntas frequentes",
  itens: [
    { p: "É grátis?", r: `Sim. Cada conta pode fazer até ${MCP_CHAMADAS_POR_MINUTO} consultas por minuto e ${MCP_CHAMADAS_POR_DIA.toLocaleString("pt-BR")} por dia, o bastante para o uso de uma pessoa.` },
    { p: "Isso é uma avaliação do imóvel?", r: "Não. São os valores declarados nas vendas registradas na Prefeitura. Eles ajudam a entender o mercado, mas não substituem um laudo." },
    { p: "Vocês veem quem comprou ou vendeu?", r: "Não. O Fechou por Quanto não guarda nome, CPF ou qualquer dado de compradores, vendedores ou proprietários. Da sua conta, guardamos só o e-mail do Google." },
    { p: "Com que frequência os dados mudam?", r: "As vendas entram todo mês, no dia 8. Os anúncios e editais que calibram a área são conferidos toda semana." },
    { p: "Por que o m² às vezes não aparece?", r: "Quando ainda não há base para a área real do apartamento, mostramos o valor da venda com o selo Sem dado, em vez de arriscar um m² errado." },
    { p: "Meu bairro não está na lista. E agora?", r: "Começamos por dez bairros. Escreva para alexandre@dablab.com.br contando qual bairro você quer ver; isso ajuda a decidir os próximos." },
  ],
};

export const RODAPE = {
  produto: "Fechou por Quanto",
  frase: "Preço real de apartamentos em São Paulo, direto no seu assistente.",
  links: [
    { rotulo: "Privacidade", href: "/privacidade" },
    { rotulo: "Termos", href: "/termos" },
    { rotulo: "Código aberto no GitHub", href: "https://github.com/asiqueira1973/m2-real" },
  ],
  dablab: { rotulo: "Um produto DabLab", href: "https://dablab.com.br" },
};

/** Passo a passo de cada assistente (página /conectar), com os nomes de menu que o usuário testou. */
export const ASSISTENTES = [
  {
    id: "claude",
    nome: "Claude",
    passos: [
      "No Claude (site ou app), abra Configurações e depois Conectores.",
      "Clique em Adicionar conector personalizado.",
      "Em nome, escreva Fechou por Quanto. Em URL, cole o endereço acima. Clique em Adicionar.",
      "Clique em Conectar, entre com sua conta Google e clique em Permitir.",
      "Numa conversa nova, abra o menu de ferramentas e deixe o Fechou por Quanto ligado.",
    ],
  },
  {
    id: "chatgpt",
    nome: "ChatGPT",
    passos: [
      "No ChatGPT, abra Configurações e depois Aplicativos e conectores.",
      "Em Configurações avançadas, ligue o Modo desenvolvedor.",
      "Clique em Criar. Em nome, escreva Fechou por Quanto; em URL, cole o endereço acima; em autenticação, escolha OAuth.",
      "Confirme, entre com sua conta Google e clique em Permitir.",
      "Na conversa, clique em +, escolha Modo desenvolvedor e selecione o Fechou por Quanto.",
    ],
  },
  {
    id: "grok",
    nome: "Grok",
    passos: [
      "No Grok, abra Configurações e depois Connect Apps.",
      "Clique em Add MCP Server.",
      "Em nome, escreva Fechou por Quanto. Em URL, cole o endereço acima. Clique em conectar.",
      "Entre com sua conta Google e clique em Permitir.",
      "Na caixa de mensagem, selecione o Fechou por Quanto antes de perguntar.",
    ],
  },
] as const;

export const PAGINA_CONECTAR = {
  titulo: "Conecte o Fechou por Quanto ao seu assistente",
  texto: "O endereço é o mesmo para todos. Escolha o seu assistente e siga os passos; leva uns três minutos.",
  rotuloEndereco: "Endereço do Fechou por Quanto",
  copiar: "Copiar",
  copiado: "Copiado",
  dica: "Dica: o assistente só consulta o Fechou por Quanto quando ele está selecionado na conversa. Se a resposta vier de buscas na internet, selecione o conector e pergunte de novo.",
  teste: "Para testar, pergunte: “O que é o Fechou por Quanto e quais bairros ele cobre?”",
};

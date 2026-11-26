/**
 * Limiares e parâmetros das regras de negócio do Fechou por Quanto.
 *
 * Seção 18.2 do spec: todo número de regra (3%, 12%, 60%, 8 plantas, 150 prédios,
 * 90 dias…) fica aqui, um por constante, com o número da regra no comentário.
 * Nenhum número mágico espalhado pelo código.
 *
 * As constantes entram épico a épico, conforme cada regra é implementada.
 */

/**
 * Rotinas agendadas da seção 4.4. A CLI (`tsx src/cli.ts <rotina>`) e a rota
 * `/api/execucoes/disparar` (seção 13.1) só aceitam estes nomes.
 */
export const ROTINAS = [
  "ingestao-itbi",
  "ingestao-iptu",
  "coleta-anuncios",
  "coleta-leiloes",
  "calibracao",
] as const;

export type Rotina = (typeof ROTINAS)[number];

// ---------------------------------------------------------------------------
// Regra 11.5 — busca de endereço (função m2_buscar_predio_por_endereco).
// Os defaults da função SQL espelham estes valores; o MCP (8.9) passa estas
// constantes explicitamente. Um teste confere que a migration bate com elas.
// ---------------------------------------------------------------------------

/** Regra 11.5: similaridade trigram mínima do logradouro para aceitar um prédio. */
export const BUSCA_SIMILARIDADE_MINIMA = 0.4;

/** Regra 11.5: quantos prédios a busca devolve no máximo ("até 5 prédios", 7.4). */
export const BUSCA_LIMITE_RESULTADOS = 5;

// ---------------------------------------------------------------------------
// Regras 11.3, 11.4, 11.6 e 11.7 — montagem de prédios, unidades e plantas (IPTU).
// ---------------------------------------------------------------------------

/** Regra 11.3: uso IPTU que começa com este texto (sem acento, maiúsculas) → apartamento. */
export const USO_APARTAMENTO_PREFIXO = "APARTAMENTO EM CONDOMINIO";

/** Regra 11.3: uso IPTU que contém este texto (sem acento, maiúsculas) → vaga. */
export const USO_VAGA_CONTEM = "GARAGEM";

/** Regra 11.4: só vira prédio o grupo (setor, quadra, condomínio) com pelo menos 4 apartamentos. */
export const PREDIO_MIN_APARTAMENTOS = 4;

/**
 * Regra 11.7 (andar inferido): só números de complemento com até 4 dígitos são número de
 * apartamento (o maior exemplo do spec é "APTO 1201"). Números maiores são matrícula ou
 * código ("VG M.98063") e não geram andar. Limite técnico de interpretação, plans/8.2-iptu.md.
 */
export const ANDAR_MAX_DIGITOS_NUMERO = 4;

/**
 * Regra 11.7: abre uma planta nova quando a área construída se afasta mais que 3%
 * da mediana da planta corrente. O mesmo limiar casa plantas entre cargas do IPTU,
 * para preservar calibração e confirmação (regra 11.11; plans/8.2-iptu.md).
 */
export const PLANTA_TOLERANCIA_AREA = 0.03;

// ---------------------------------------------------------------------------
// Seção 12 — máquina de estados das execuções.
// ---------------------------------------------------------------------------

/** Seção 12: execução em_andamento há mais de 6 horas é marcada falhou ("tempo esgotado"). */
export const EXECUCAO_TEMPO_ESGOTADO_HORAS = 6;

// ---------------------------------------------------------------------------
// Observabilidade das cargas (acréscimo pedido pelo usuário em 21/11/2026;
// plans/8.2-iptu.md, O2). Valores aprovados pelo usuário como ponto de partida.
// ---------------------------------------------------------------------------

/** Atraso máximo, em dias, desde a última execução concluída de cada rotina. */
export const SAUDE_ATRASO_MAXIMO_DIAS: Readonly<Record<Rotina, number>> = {
  "ingestao-itbi": 35,
  "ingestao-iptu": 400,
  "coleta-anuncios": 8,
  "coleta-leiloes": 8,
  calibracao: 8,
};

/** Volume anômalo: linhas gravadas abaixo desta fração da mediana das execuções anteriores. */
export const SAUDE_VOLUME_FRACAO_MINIMA = 0.5;

/** Quantas execuções concluídas anteriores da mesma rotina formam a mediana de volume. */
export const SAUDE_VOLUME_JANELA_EXECUCOES = 3;

/** Queda de cobertura (pontos percentuais) de um bairro entre duas calibrações que gera alerta. */
export const SAUDE_QUEDA_COBERTURA_PONTOS = 5;

// ---------------------------------------------------------------------------
// Regra 11.2 — bairro por votação (guias do ITBI no 8.3; prédios do IPTU no 8.2,
// por decisão do usuário em 21/11/2026, plans/8.2-iptu.md).
// ---------------------------------------------------------------------------

/** Regra 11.2: o bairro vencedor da votação precisa de pelo menos 60% dos votos. */
export const BAIRRO_VOTO_FRACAO_MINIMA = 0.6;

/** Regra 11.2: e de pelo menos 2 votos. */
export const BAIRRO_VOTO_MINIMO = 2;

// ---------------------------------------------------------------------------
// Épico 8.3 — ITBI (regras 11.1, 11.14 e assunção A2).
// ---------------------------------------------------------------------------

/** Assunção A2: histórico do ITBI a partir de 2021. */
export const ITBI_ANO_INICIAL = 2021;

/** Seção 7.2 (eh_compra_venda): natureza que começa com "1." é compra e venda. */
export const NATUREZA_COMPRA_VENDA_PREFIXO = "1.";

/**
 * Regra 11.14: complemento que indica unidade dentro de um SQL sem cadastro próprio.
 * Aplicado ao complemento normalizado (maiúsculas, sem acento).
 */
export const UNIDADE_SEM_CADASTRO_REGEX = /\b(AP|APTO|APART|UNID|TORRE|T\s?\d|BL|CJ|SALA)\b/;

/** Regra 11.14: fração ideal a partir da qual a guia é do lote inteiro (ou nula). */
export const UNIDADE_SEM_CADASTRO_FRACAO_MINIMA = 1;

/** Regra 11.19: naturezas do ITBI que apontam leilão (usadas no 8.5.1). */
export const NATUREZAS_LEILAO_PREFIXOS = ["4.", "17."] as const;

// ---------------------------------------------------------------------------
// Épico 8.4 — consolidação de vendas (regras 11.15 e 11.16).
// ---------------------------------------------------------------------------

/** Regra 11.15: no máximo 3 guias de vaga agregadas a uma venda de apartamento. */
export const VAGAS_MAX_POR_VENDA = 3;

/** Regra 11.16: com pelo menos 3 vendas do prédio na janela, usa a mediana do prédio. */
export const FORA_CURVA_MIN_VENDAS_PREDIO = 3;

/** Regra 11.16: janela de 36 meses (terminando na data da venda, plans/8.4-consolidacao.md). */
export const FORA_CURVA_JANELA_MESES = 36;

/** Regra 11.16: fora da curva se m2_privativo < 0,6 × a mediana de referência. */
export const FORA_CURVA_FATOR_MIN = 0.6;

/** Regra 11.16: fora da curva se m2_privativo > 1,6 × a mediana de referência. */
export const FORA_CURVA_FATOR_MAX = 1.6;

/** Regra 11.16: fora da curva se valor_declarado < 0,5 × o valor venal de referência. */
export const FORA_CURVA_VENAL_FRACAO = 0.5;

// ---------------------------------------------------------------------------
// Épico 8.5 — coleta de anúncios (regras 11.8, 11.13; seções 12 e 17; assunção A4).
// ---------------------------------------------------------------------------

/** Regra 11.13: coletar no máximo os 150 prédios de maior prioridade por rodada. */
export const COLETA_MAX_PREDIOS = 150;

/** Regra 11.13: prédio coletado não é recoletado antes de 90 dias. */
export const COLETA_RECOLETA_DIAS = 90;

/** Regra 11.13: vendas de compra e venda dos últimos 24 meses entram na prioridade. */
export const PRIORIDADE_JANELA_MESES = 24;

/** Regra 11.13: peso do pior selo das plantas do prédio na prioridade de coleta. */
export const PRIORIDADE_PESO_SELO = {
  sem_dado: 4,
  estimada: 3,
  indicativa: 2,
  calibrada: 0,
  confirmada: 0,
} as const;

/** Épico 8.5: até 5 resultados da busca são raspados por prédio. */
export const COLETA_RESULTADOS_POR_PREDIO = 5;

/** Assunção A4: domínios da allowlist de anúncios e páginas de condomínio (seção 20: sai daqui se pedir para parar). */
export const ANUNCIO_DOMINIOS = ["lopes.com.br", "quintoandar.com.br", "loft.com.br"] as const;

/** Regra 11.8: similaridade mínima do logradouro para casar anúncio com prédio. */
export const CASAMENTO_SIMILARIDADE_MINIMA = 0.6;

/** Regra 11.8: a planta escolhida tem área IPTU a até 12% da área IPTU estimada pelo anúncio. */
export const CASAMENTO_TOLERANCIA_PLANTA = 0.12;

/** Seção 12: em 429/5xx do Firecrawl, até 3 tentativas com espera de 10, 30 e 90 s. */
export const FIRECRAWL_ESPERAS_S = [10, 30, 90] as const;

/**
 * Teto padrão de créditos do Firecrawl por execução (FIRECRAWL_MAX_CREDITOS_EXECUCAO; seção 17).
 * O spec diz 600; o usuário decidiu 100 em 22/11/2026: plano grátis do Firecrawl (1.000/mês)
 * dividido com outros apps dele. Vale para anúncios (8.5) e editais (8.5.1); ~4 prédios por rodada.
 */
export const FIRECRAWL_MAX_CREDITOS_PADRAO = 100;

/** Custo previsto de uma busca (créditos), só para decidir se cabe no teto; a conta usa o creditsUsed real. */
export const FIRECRAWL_CUSTO_BUSCA = 2;

/** Custo previsto de um scrape com extração JSON (créditos), idem. */
export const FIRECRAWL_CUSTO_SCRAPE = 5;

// ---------------------------------------------------------------------------
// Épico 8.5.1 — editais de leilão (regras 11.19 e 11.20; seções 4.2, 17 e 18.4; assunção A10).
// ---------------------------------------------------------------------------

/** Regra 11.19 (a): guias de arrematação/consolidação fiduciária dos últimos 36 meses apontam alvos. */
export const LEILAO_ALVOS_JANELA_MESES = 36;

/** Regra 11.19 (b): os 100 prédios de maior prioridade_coleta sem planta confirmada. */
export const LEILAO_ALVOS_MAX_PRIORIDADE = 100;

/** Regra 11.19: cada prédio é buscado em leilões no máximo uma vez a cada 180 dias. */
export const LEILAO_RECOLETA_DIAS = 180;

/** Épico 8.5.1 / seção 18.4: teto padrão de alvos por execução (LEILAO_MAX_ALVOS_EXECUCAO). */
export const LEILAO_MAX_ALVOS_PADRAO = 100;

/** Seção 17: teto padrão de documentos lidos pela Claude API por execução (CLAUDE_MAX_DOCUMENTOS_EXECUCAO). */
export const CLAUDE_MAX_DOCUMENTOS_PADRAO = 150;

/** Épico 8.5.1: até 3 resultados da busca são raspados por alvo. */
export const LEILAO_RESULTADOS_POR_ALVO = 3;

/** Assunção A10: allowlist inicial de leilões (LEILAO_DOMINIOS substitui, seção 18.4). */
export const LEILAO_DOMINIOS_PADRAO = [
  "venda-imoveis.caixa.gov.br",
  "portalzuk.com.br",
  "megaleiloes.com.br",
  "sodresantoro.com.br",
  "frazaoleiloes.com.br",
  "biasileiloes.com.br",
  "lancejudicial.com.br",
] as const;

/**
 * Limite técnico: tamanho máximo do PDF enviado à Claude API. A requisição aceita 32 MB e o PDF
 * vai em base64 (+33%), então o PDF cru fica em 23 MB (24 MB em base64 já dá os 32 MB, sem folga para o resto).
 */
export const PDF_TAMANHO_MAXIMO_BYTES = 23 * 1024 * 1024;

/** Limite técnico: tokens de saída da leitura do PDF (a resposta é só o JSON da 13.4). */
export const PDF_MAX_TOKENS_RESPOSTA = 4096;

/** Limite técnico: guias lidas por matrícula no casamento da 11.20 (uma matrícula é de uma unidade). */
export const LEILAO_GUIAS_POR_MATRICULA = 100;

/** Seção 4.2: leitura de PDFs de leilão com o Sonnet da geração atual. */
export const MODELO_EXTRACAO_PDF = "claude-sonnet-5";

// ---------------------------------------------------------------------------
// Épico 8.6 — calibração (regras 11.9, 11.10 e 11.12; seção 8.6; D12; assunção A6).
// ---------------------------------------------------------------------------

/** Regra 11.9: evidências concordam para "calibrada" se ficam a até 3% da mediana delas. */
export const CALIBRADA_CONCORDANCIA = 0.03;

/** Regra 11.9: "calibrada" exige ≥ 2 evidências concordantes, de URLs distintas. */
export const CALIBRADA_MIN_EVIDENCIAS = 2;

/** Regra 11.9: ≥ 2 evidências que não concordam a 3% mas concordam a 8% → "indicativa". */
export const INDICATIVA_CONCORDANCIA = 0.08;

/** Regra 11.9: "indicativa" por concordância a 8% exige ≥ 2 evidências (com 1 só, é indicativa direto). */
export const INDICATIVA_MIN_EVIDENCIAS = 2;

/** Regra 11.9: 2+ editais na mesma planta valem pela mediana se concordam a 3%. */
export const EDITAIS_CONCORDANCIA = 0.03;

/** Seção 8.6: edital que diverge mais de 5% da área calibrada por anúncios → revisão edital_divergente. */
export const EDITAL_DIVERGENCIA_ANUNCIOS = 0.05;

/** Regra 11.10: usa o grupo de fator mais específico com pelo menos 8 plantas. */
export const FATOR_GRUPO_MIN_PLANTAS = 8;

/** Regra 11.12: cada fator deve ficar a até 10% do fator_predio. */
export const COERENCIA_FATOR_PREDIO = 0.1;

/** Regra 11.12: a coerência só se aplica a prédios com ≥ 2 plantas de selo ≥ indicativa. */
export const COERENCIA_MIN_PLANTAS = 2;

/** Regra 11.12: planta especial tem no máximo 2 unidades… */
export const ESPECIAL_MAX_UNIDADES = 2;

/** Regra 11.12: …e área ≥ 1,4 × a da planta seguinte. */
export const ESPECIAL_RAZAO_AREA = 1.4;

/** D12 / 7.2 (cobertura_bairros.vendas_24m): vendas consolidadas dos últimos 24 meses. */
export const COBERTURA_JANELA_MESES = 24;

// ---------------------------------------------------------------------------
// Épico 8.8 — rotina "vigia" (observabilidade O3, acréscimo pedido pelo usuário).
// ---------------------------------------------------------------------------

/** O3: sonda sintética — este endereço (prédio de teste do 8.1/8.2) precisa ser achado pela busca da 11.5. */
export const VIGIA_SONDA_ENDERECO = "Rua Joaquim Antunes, 577";

/** O3: execuções mais recentes lidas para avaliar a saúde (cobre a janela de volume e a última de cada rotina). */
export const VIGIA_EXECUCOES_LIDAS = 200;

/** O3: fotos de cobertura mais recentes lidas (duas por bairro bastam para a queda de cobertura). */
export const VIGIA_COBERTURAS_LIDAS = 40;

// ---------------------------------------------------------------------------
// Épico 8.9 — servidor MCP (seção 13.2; regra 11.17; princípio 1).
// ---------------------------------------------------------------------------

/** 13.2 vendas_predio: janela padrão e máxima, em meses. */
export const MCP_VENDAS_MESES_PADRAO = 36;
export const MCP_VENDAS_MESES_MAX = 120;

/** 13.2 m2_bairro: janela padrão e máxima, em meses (11.17: "padrão 24 meses"). */
export const MCP_BAIRRO_MESES_PADRAO = 24;
export const MCP_BAIRRO_MESES_MAX = 60;

/** 13.2 comparaveis: janela padrão (meses), limite padrão e máximo de vendas. */
export const MCP_COMPARAVEIS_MESES_PADRAO = 24;
export const MCP_COMPARAVEIS_LIMITE_PADRAO = 10;
export const MCP_COMPARAVEIS_LIMITE_MAX = 30;

/** 13.2 comparaveis: área privativa a ±20% da informada (ou da planta mais comum do prédio). */
export const MCP_COMPARAVEIS_FAIXA_AREA = 0.2;

/** 13.2 comparaveis: década de construção a ±1. */
export const MCP_COMPARAVEIS_DECADAS = 1;

/** 13.2 buscar_predio: endereço com 3 a 200 caracteres. */
export const MCP_ENDERECO_MIN = 3;
export const MCP_ENDERECO_MAX = 200;

/** Regra 11.17: selos que entram nas medianas (≥ estimada; sem_dado fica de fora). */
export const MEDIANA_SELOS = ["estimada", "indicativa", "calibrada", "confirmada"] as const;

/** O5: a avaliação de saúde é guardada por 5 minutos em cada instância do servidor MCP. */
export const MCP_SAUDE_CACHE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Épico 8.10 — OAuth do MCP e contas de cliente (seções 6.3 e 6.5; regras 11.21 e 11.22).
// ---------------------------------------------------------------------------

/** Regra 11.21: contas de cliente novas aceitas nas últimas 24 h (quem já tem conta entra sempre). */
export const CLIENTES_NOVOS_POR_DIA = 50;

/** Regra 11.22: chamadas ao MCP por token OAuth no minuto corrente. */
export const MCP_CHAMADAS_POR_MINUTO = 30;

/** Regra 11.22: chamadas ao MCP por token OAuth nas últimas 24 h. */
export const MCP_CHAMADAS_POR_DIA = 1000;

/** 6.5, passo 4: validade do código de autorização, em segundos (10 min). */
export const OAUTH_CODIGO_SEGUNDOS = 600;

/** 6.5, passo 3: máximo de redirect_uris por cliente registrado e tamanhos máximos. */
export const OAUTH_REDIRECT_URIS_MAX = 5;
export const OAUTH_REDIRECT_URI_MAX = 500;
export const OAUTH_CLIENTE_NOME_MAX = 100;

/** RFC 7636: tamanho do code_verifier do PKCE. */
export const PKCE_VERIFIER_MIN = 43;
export const PKCE_VERIFIER_MAX = 128;

/** 6.5, passo 2: validade do cookie do login com Google (state e PKCE), em segundos. */
export const LOGIN_GOOGLE_COOKIE_SEGUNDOS = 600;

/** 6.5: validade da sessão do cliente nas telas do OAuth, em dias. */
export const SESSAO_CLIENTE_DIAS = 30;

/** 6.5, passo 3: clientes OAuth registrados por hora (freio contra quem enche a tabela). */
export const OAUTH_REGISTROS_POR_HORA = 200;

/** 6.5, passo 3: clientes OAuth que nunca autorizaram nada são apagados depois destes dias. */
export const OAUTH_CLIENTE_SEM_USO_DIAS = 30;

/** 6.5, passo 2: tempo máximo da troca do código com o Google, em ms. */
export const GOOGLE_TOKEN_TIMEOUT_MS = 5000;

/** Seção 15 / regra 11.22: a partir deste tempo de espera (s), a mensagem fala em minutos. */
export const LIMITE_MENSAGEM_MINUTOS_S = 120;

/** Seção 16: contas conectadas por página na tela Chaves de API (abaixo do corte de 1.000 do PostgREST). */
export const CONTAS_CONECTADAS_POR_PAGINA = 50;

// ---------------------------------------------------------------------------
// Épico 8.11 — site público.
// ---------------------------------------------------------------------------

/** 8.11: o site relê a cobertura e a venda mais recente uma vez por dia (s). */
export const SITE_REVALIDAR_S = 86400;

// ---------------------------------------------------------------------------
// Épico 8.12 — eventos de produto no Visão de Produto (seção 21).
// ---------------------------------------------------------------------------

/** Seção 21: tempo máximo do envio de um evento ao Visão de Produto, em ms (nunca atrasa a resposta). */
export const VISAO_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Épico 8.13 — "Teste aqui" no site (regra 11.23).
// ---------------------------------------------------------------------------

/** Regra 11.23: uma busca por IP a cada tantos dias (o hash do IP é apagado depois). */
export const SITE_TESTE_JANELA_DIAS = 30;

/** Regra 11.23: vendas mostradas na amostra do site (as mais recentes). */
export const SITE_TESTE_VENDAS = 3;

/** Regra 11.23: janela das vendas da amostra, em meses. */
export const SITE_TESTE_MESES = 36;

/** 8.13: tempo máximo da conferência do Turnstile, em ms. */
export const TURNSTILE_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Épico 8.14 — bairros da zona sul.
// ---------------------------------------------------------------------------

/** 8.14: guias por chamada de m2_itbi_reatribuir_bairros na carga forçada do ITBI (abaixo do corte de 1.000). */
export const REATRIBUIR_LOTE = 500;

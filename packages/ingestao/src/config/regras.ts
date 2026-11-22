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

/** Seção 17: teto padrão de créditos do Firecrawl por execução (FIRECRAWL_MAX_CREDITOS_EXECUCAO). */
export const FIRECRAWL_MAX_CREDITOS_PADRAO = 600;

/** Custo previsto de uma busca (créditos), só para decidir se cabe no teto; a conta usa o creditsUsed real. */
export const FIRECRAWL_CUSTO_BUSCA = 2;

/** Custo previsto de um scrape com extração JSON (créditos), idem. */
export const FIRECRAWL_CUSTO_SCRAPE = 5;

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

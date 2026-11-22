/**
 * Rótulos em português dos valores de enum mostrados no painel (seção 15: "português claro").
 */
export const ROTULO_MOTIVO: Readonly<Record<string, string>> = {
  fator_incoerente: "Fator incoerente", anuncios_divergentes: "Anúncios divergentes", anuncio_ambiguo: "Anúncio ambíguo",
  planta_especial: "Planta especial", venda_fora_da_curva: "Venda fora da curva", edital_divergente: "Edital divergente",
};

export const ROTULO_FONTE: Readonly<Record<string, string>> = {
  itbi: "ITBI", iptu: "IPTU", anuncio: "Anúncio", pagina_condominio: "Página de condomínio", edital_leilao: "Edital de leilão",
  revisao_manual: "Revisão manual", fator_referencia: "Fator de referência", calibracao: "Calibração",
};

export const ROTULO_STATUS_CASAMENTO: Readonly<Record<string, string>> = {
  casado_planta: "Casado à planta", casado_predio: "Casado ao prédio", casado_unidade: "Casado à unidade",
  ambiguo: "Ambíguo", sem_predio: "Sem prédio", descartado: "Descartado",
};

/** Recebe: tabela de rótulos e valor. Devolve: o rótulo, ou o próprio valor, ou "—". */
export function label(tabela: Readonly<Record<string, string>>, v: string | null | undefined): string {
  return v ? (tabela[v] ?? v) : "—";
}

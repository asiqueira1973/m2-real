
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "m2_anuncios": {
                  Row: {
                    "andar": number | null,"area_privativa": number | null,"area_privativa_max": number | null,"area_privativa_min": number | null,"atualizado_em": string,"casado_manual": boolean,"coletado_em": string,"confianca_casamento": number | null,"criado_em": string,"dominio": string,"execucao_id": string,"finalidade": Database["public"]['Enums']["m2_finalidade_anuncio"] | null,"fonte": Database["public"]['Enums']["m2_fonte_dado"],"id": string,"logradouro_extraido": string | null,"nome_condominio": string | null,"numero_extraido": number | null,"planta_id": string | null,"preco_pedido": number | null,"predio_id": string | null,"quartos": number | null,"status_casamento": Database["public"]['Enums']["m2_status_casamento"],"url": string,"vagas": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "andar"?: number | null,"area_privativa"?: number | null,"area_privativa_max"?: number | null,"area_privativa_min"?: number | null,"atualizado_em"?: string,"casado_manual"?: boolean,"coletado_em"?: string,"confianca_casamento"?: number | null,"criado_em"?: string,"dominio": string,"execucao_id": string,"finalidade"?: Database["public"]['Enums']["m2_finalidade_anuncio"] | null,"fonte": Database["public"]['Enums']["m2_fonte_dado"],"id"?: string,"logradouro_extraido"?: string | null,"nome_condominio"?: string | null,"numero_extraido"?: number | null,"planta_id"?: string | null,"preco_pedido"?: number | null,"predio_id"?: string | null,"quartos"?: number | null,"status_casamento"?: Database["public"]['Enums']["m2_status_casamento"],"url": string,"vagas"?: number | null
                  }
                  Update: {
                    "andar"?: number | null,"area_privativa"?: number | null,"area_privativa_max"?: number | null,"area_privativa_min"?: number | null,"atualizado_em"?: string,"casado_manual"?: boolean,"coletado_em"?: string,"confianca_casamento"?: number | null,"criado_em"?: string,"dominio"?: string,"execucao_id"?: string,"finalidade"?: Database["public"]['Enums']["m2_finalidade_anuncio"] | null,"fonte"?: Database["public"]['Enums']["m2_fonte_dado"],"id"?: string,"logradouro_extraido"?: string | null,"nome_condominio"?: string | null,"numero_extraido"?: number | null,"planta_id"?: string | null,"preco_pedido"?: number | null,"predio_id"?: string | null,"quartos"?: number | null,"status_casamento"?: Database["public"]['Enums']["m2_status_casamento"],"url"?: string,"vagas"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_anuncios_execucao_id_fkey"
      columns: ["execucao_id"]
isOneToOne: false
      referencedRelation: "m2_execucoes_ingestao"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_anuncios_planta_id_fkey"
      columns: ["planta_id"]
isOneToOne: false
      referencedRelation: "m2_plantas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_anuncios_predio_id_fkey"
      columns: ["predio_id"]
isOneToOne: false
      referencedRelation: "m2_predios"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_bairros": {
                  Row: {
                    "ativo": boolean,"atualizado_em": string,"criado_em": string,"id": number,"nome": string,"padroes_nome": (string)[],"prefixos_cep": (string)[],"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizado_em"?: string,"criado_em"?: string,"id"?: never,"nome": string,"padroes_nome": (string)[],"prefixos_cep": (string)[],"slug": string
                  }
                  Update: {
                    "ativo"?: boolean,"atualizado_em"?: string,"criado_em"?: string,"id"?: never,"nome"?: string,"padroes_nome"?: (string)[],"prefixos_cep"?: (string)[],"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"m2_calibracoes": {
                  Row: {
                    "anuncios_ids": (string)[],"area_privativa": number | null,"autor": string,"criado_em": string,"editais_ids": (string)[],"fator": number | null,"fonte": Database["public"]['Enums']["m2_fonte_dado"],"id": string,"observacao": string | null,"planta_id": string,"selo": Database["public"]['Enums']["m2_selo_area"],"vagas_inclusas": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anuncios_ids"?: (string)[],"area_privativa"?: number | null,"autor": string,"criado_em"?: string,"editais_ids"?: (string)[],"fator"?: number | null,"fonte": Database["public"]['Enums']["m2_fonte_dado"],"id"?: string,"observacao"?: string | null,"planta_id": string,"selo": Database["public"]['Enums']["m2_selo_area"],"vagas_inclusas"?: number | null
                  }
                  Update: {
                    "anuncios_ids"?: (string)[],"area_privativa"?: number | null,"autor"?: string,"criado_em"?: string,"editais_ids"?: (string)[],"fator"?: number | null,"fonte"?: Database["public"]['Enums']["m2_fonte_dado"],"id"?: string,"observacao"?: string | null,"planta_id"?: string,"selo"?: Database["public"]['Enums']["m2_selo_area"],"vagas_inclusas"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_calibracoes_planta_id_fkey"
      columns: ["planta_id"]
isOneToOne: false
      referencedRelation: "m2_plantas"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_chaves_api": {
                  Row: {
                    "ativa": boolean,"atualizado_em": string,"criada_por": string,"criado_em": string,"hash_chave": string,"id": string,"nome": string,"prefixo": string,"ultimo_uso_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativa"?: boolean,"atualizado_em"?: string,"criada_por": string,"criado_em"?: string,"hash_chave": string,"id"?: string,"nome": string,"prefixo": string,"ultimo_uso_em"?: string | null
                  }
                  Update: {
                    "ativa"?: boolean,"atualizado_em"?: string,"criada_por"?: string,"criado_em"?: string,"hash_chave"?: string,"id"?: string,"nome"?: string,"prefixo"?: string,"ultimo_uso_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_chaves_api_criada_por_fkey"
      columns: ["criada_por"]
isOneToOne: false
      referencedRelation: "m2_perfis"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_clientes": {
                  Row: {
                    "atualizado_em": string,"bloqueado_em": string | null,"criado_em": string,"email": string,"google_sub": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"bloqueado_em"?: string | null,"criado_em"?: string,"email": string,"google_sub": string,"id"?: string
                  }
                  Update: {
                    "atualizado_em"?: string,"bloqueado_em"?: string | null,"criado_em"?: string,"email"?: string,"google_sub"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"m2_cobertura_bairros": {
                  Row: {
                    "bairro_id": number,"calculado_em": string,"criado_em": string,"id": string,"pct_cobertura": number,"vendas_24m": number,"vendas_calibrada": number,"vendas_confirmada": number,"vendas_estimada": number,"vendas_indicativa": number,"vendas_sem_dado": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bairro_id": number,"calculado_em"?: string,"criado_em"?: string,"id"?: string,"pct_cobertura": number,"vendas_24m": number,"vendas_calibrada": number,"vendas_confirmada": number,"vendas_estimada": number,"vendas_indicativa": number,"vendas_sem_dado": number
                  }
                  Update: {
                    "bairro_id"?: number,"calculado_em"?: string,"criado_em"?: string,"id"?: string,"pct_cobertura"?: number,"vendas_24m"?: number,"vendas_calibrada"?: number,"vendas_confirmada"?: number,"vendas_estimada"?: number,"vendas_indicativa"?: number,"vendas_sem_dado"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_cobertura_bairros_bairro_id_fkey"
      columns: ["bairro_id"]
isOneToOne: false
      referencedRelation: "m2_bairros"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_editais_leilao": {
                  Row: {
                    "area_comum": number | null,"area_privativa": number | null,"area_total": number | null,"atualizado_em": string,"cartorio": string | null,"casado_manual": boolean,"coletado_em": string,"complemento_extraido": string | null,"criado_em": string,"data_leilao": string | null,"dominio": string,"execucao_id": string,"fracao_ideal": number | null,"id": string,"logradouro_extraido": string | null,"matricula": string | null,"numero_extraido": number | null,"origem_documento": string,"predio_id": string | null,"status_casamento": Database["public"]['Enums']["m2_status_casamento_edital"],"unidade_id": string | null,"url": string,"url_documento": string | null,"vagas": number | null,"vagas_vinculadas_area": boolean | null,"valor_avaliacao": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area_comum"?: number | null,"area_privativa"?: number | null,"area_total"?: number | null,"atualizado_em"?: string,"cartorio"?: string | null,"casado_manual"?: boolean,"coletado_em"?: string,"complemento_extraido"?: string | null,"criado_em"?: string,"data_leilao"?: string | null,"dominio": string,"execucao_id": string,"fracao_ideal"?: number | null,"id"?: string,"logradouro_extraido"?: string | null,"matricula"?: string | null,"numero_extraido"?: number | null,"origem_documento": string,"predio_id"?: string | null,"status_casamento"?: Database["public"]['Enums']["m2_status_casamento_edital"],"unidade_id"?: string | null,"url": string,"url_documento"?: string | null,"vagas"?: number | null,"vagas_vinculadas_area"?: boolean | null,"valor_avaliacao"?: number | null
                  }
                  Update: {
                    "area_comum"?: number | null,"area_privativa"?: number | null,"area_total"?: number | null,"atualizado_em"?: string,"cartorio"?: string | null,"casado_manual"?: boolean,"coletado_em"?: string,"complemento_extraido"?: string | null,"criado_em"?: string,"data_leilao"?: string | null,"dominio"?: string,"execucao_id"?: string,"fracao_ideal"?: number | null,"id"?: string,"logradouro_extraido"?: string | null,"matricula"?: string | null,"numero_extraido"?: number | null,"origem_documento"?: string,"predio_id"?: string | null,"status_casamento"?: Database["public"]['Enums']["m2_status_casamento_edital"],"unidade_id"?: string | null,"url"?: string,"url_documento"?: string | null,"vagas"?: number | null,"vagas_vinculadas_area"?: boolean | null,"valor_avaliacao"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_editais_leilao_execucao_id_fkey"
      columns: ["execucao_id"]
isOneToOne: false
      referencedRelation: "m2_execucoes_ingestao"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_editais_leilao_predio_id_fkey"
      columns: ["predio_id"]
isOneToOne: false
      referencedRelation: "m2_predios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_editais_leilao_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "m2_unidades"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_execucoes_ingestao": {
                  Row: {
                    "arquivo_hash": string | null,"arquivo_url": string | null,"atualizado_em": string,"caminho_storage": string | null,"concluida_em": string | null,"criado_em": string,"fonte": Database["public"]['Enums']["m2_fonte_dado"],"id": string,"iniciada_em": string,"linhas_descartadas": number,"linhas_gravadas": number,"linhas_lidas": number,"mensagem_erro": string | null,"referencia": string | null,"rotina": string,"status": Database["public"]['Enums']["m2_status_execucao"]
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivo_hash"?: string | null,"arquivo_url"?: string | null,"atualizado_em"?: string,"caminho_storage"?: string | null,"concluida_em"?: string | null,"criado_em"?: string,"fonte": Database["public"]['Enums']["m2_fonte_dado"],"id"?: string,"iniciada_em"?: string,"linhas_descartadas"?: number,"linhas_gravadas"?: number,"linhas_lidas"?: number,"mensagem_erro"?: string | null,"referencia"?: string | null,"rotina": string,"status"?: Database["public"]['Enums']["m2_status_execucao"]
                  }
                  Update: {
                    "arquivo_hash"?: string | null,"arquivo_url"?: string | null,"atualizado_em"?: string,"caminho_storage"?: string | null,"concluida_em"?: string | null,"criado_em"?: string,"fonte"?: Database["public"]['Enums']["m2_fonte_dado"],"id"?: string,"iniciada_em"?: string,"linhas_descartadas"?: number,"linhas_gravadas"?: number,"linhas_lidas"?: number,"mensagem_erro"?: string | null,"referencia"?: string | null,"rotina"?: string,"status"?: Database["public"]['Enums']["m2_status_execucao"]
                  }
                  Relationships: [
                    
                  ]
                },"m2_fatores_referencia": {
                  Row: {
                    "atualizado_em": string,"bairro_id": number | null,"calculado_em": string,"criado_em": string,"decada_construcao": number | null,"fator_mediano": number,"fator_p25": number,"fator_p75": number,"id": string,"qtd_plantas": number,"vagas_cadastro_proprio": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"bairro_id"?: number | null,"calculado_em"?: string,"criado_em"?: string,"decada_construcao"?: number | null,"fator_mediano": number,"fator_p25": number,"fator_p75": number,"id"?: string,"qtd_plantas": number,"vagas_cadastro_proprio": boolean
                  }
                  Update: {
                    "atualizado_em"?: string,"bairro_id"?: number | null,"calculado_em"?: string,"criado_em"?: string,"decada_construcao"?: number | null,"fator_mediano"?: number,"fator_p25"?: number,"fator_p75"?: number,"id"?: string,"qtd_plantas"?: number,"vagas_cadastro_proprio"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_fatores_referencia_bairro_id_fkey"
      columns: ["bairro_id"]
isOneToOne: false
      referencedRelation: "m2_bairros"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_oauth_clientes": {
                  Row: {
                    "criado_em": string,"id": string,"nome": string,"redirect_uris": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"id"?: string,"nome": string,"redirect_uris": (string)[]
                  }
                  Update: {
                    "criado_em"?: string,"id"?: string,"nome"?: string,"redirect_uris"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"m2_oauth_codigos": {
                  Row: {
                    "cliente_id": string,"code_challenge": string,"codigo_hash": string,"criado_em": string,"expira_em": string,"oauth_cliente_id": string,"redirect_uri": string,"token_id": string | null,"usado_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": string,"code_challenge": string,"codigo_hash": string,"criado_em"?: string,"expira_em": string,"oauth_cliente_id": string,"redirect_uri": string,"token_id"?: string | null,"usado_em"?: string | null
                  }
                  Update: {
                    "cliente_id"?: string,"code_challenge"?: string,"codigo_hash"?: string,"criado_em"?: string,"expira_em"?: string,"oauth_cliente_id"?: string,"redirect_uri"?: string,"token_id"?: string | null,"usado_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_oauth_codigos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "m2_clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_oauth_codigos_oauth_cliente_id_fkey"
      columns: ["oauth_cliente_id"]
isOneToOne: false
      referencedRelation: "m2_oauth_clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_oauth_codigos_token_id_fkey"
      columns: ["token_id"]
isOneToOne: false
      referencedRelation: "m2_tokens_mcp"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_perfis": {
                  Row: {
                    "ativo": boolean,"atualizado_em": string,"criado_em": string,"email": string,"id": string,"papel": Database["public"]['Enums']["m2_papel_usuario"]
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"atualizado_em"?: string,"criado_em"?: string,"email": string,"id": string,"papel"?: Database["public"]['Enums']["m2_papel_usuario"]
                  }
                  Update: {
                    "ativo"?: boolean,"atualizado_em"?: string,"criado_em"?: string,"email"?: string,"id"?: string,"papel"?: Database["public"]['Enums']["m2_papel_usuario"]
                  }
                  Relationships: [
                    
                  ]
                },"m2_plantas": {
                  Row: {
                    "area_iptu_referencia": number,"area_privativa": number | null,"atualizado_em": string,"criado_em": string,"especial": boolean,"faixa_erro_pct": number | null,"fator": number | null,"fonte_area": Database["public"]['Enums']["m2_fonte_dado"] | null,"id": string,"motivo_revisao": Database["public"]['Enums']["m2_motivo_revisao"] | null,"predio_id": string,"qtd_unidades": number,"quartos": number | null,"revisao_pendente": boolean,"selo": Database["public"]['Enums']["m2_selo_area"],"vagas_inclusas": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area_iptu_referencia": number,"area_privativa"?: number | null,"atualizado_em"?: string,"criado_em"?: string,"especial"?: boolean,"faixa_erro_pct"?: number | null,"fator"?: number | null,"fonte_area"?: Database["public"]['Enums']["m2_fonte_dado"] | null,"id"?: string,"motivo_revisao"?: Database["public"]['Enums']["m2_motivo_revisao"] | null,"predio_id": string,"qtd_unidades": number,"quartos"?: number | null,"revisao_pendente"?: boolean,"selo"?: Database["public"]['Enums']["m2_selo_area"],"vagas_inclusas"?: number | null
                  }
                  Update: {
                    "area_iptu_referencia"?: number,"area_privativa"?: number | null,"atualizado_em"?: string,"criado_em"?: string,"especial"?: boolean,"faixa_erro_pct"?: number | null,"fator"?: number | null,"fonte_area"?: Database["public"]['Enums']["m2_fonte_dado"] | null,"id"?: string,"motivo_revisao"?: Database["public"]['Enums']["m2_motivo_revisao"] | null,"predio_id"?: string,"qtd_unidades"?: number,"quartos"?: number | null,"revisao_pendente"?: boolean,"selo"?: Database["public"]['Enums']["m2_selo_area"],"vagas_inclusas"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_plantas_predio_id_fkey"
      columns: ["predio_id"]
isOneToOne: false
      referencedRelation: "m2_predios"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_predios": {
                  Row: {
                    "ano_construcao": number | null,"atualizado_em": string,"bairro_id": number,"cep": string,"chave_predio": string,"criado_em": string,"exercicio_iptu": number,"fator_predio": number | null,"id": string,"logradouro": string,"numero": number | null,"numero_condominio": string,"numeros_imovel": (number)[],"padrao_iptu": string | null,"prioridade_coleta": number,"qtd_pavimentos": number | null,"quadra": string,"setor": string,"total_unidades_residenciais": number,"ultima_coleta_em": string | null,"ultima_coleta_leilao_em": string | null,"vagas_cadastro_proprio": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "ano_construcao"?: number | null,"atualizado_em"?: string,"bairro_id": number,"cep": string,"chave_predio": string,"criado_em"?: string,"exercicio_iptu": number,"fator_predio"?: number | null,"id"?: string,"logradouro": string,"numero"?: number | null,"numero_condominio": string,"numeros_imovel"?: (number)[],"padrao_iptu"?: string | null,"prioridade_coleta"?: number,"qtd_pavimentos"?: number | null,"quadra": string,"setor": string,"total_unidades_residenciais"?: number,"ultima_coleta_em"?: string | null,"ultima_coleta_leilao_em"?: string | null,"vagas_cadastro_proprio"?: boolean
                  }
                  Update: {
                    "ano_construcao"?: number | null,"atualizado_em"?: string,"bairro_id"?: number,"cep"?: string,"chave_predio"?: string,"criado_em"?: string,"exercicio_iptu"?: number,"fator_predio"?: number | null,"id"?: string,"logradouro"?: string,"numero"?: number | null,"numero_condominio"?: string,"numeros_imovel"?: (number)[],"padrao_iptu"?: string | null,"prioridade_coleta"?: number,"qtd_pavimentos"?: number | null,"quadra"?: string,"setor"?: string,"total_unidades_residenciais"?: number,"ultima_coleta_em"?: string | null,"ultima_coleta_leilao_em"?: string | null,"vagas_cadastro_proprio"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_predios_bairro_id_fkey"
      columns: ["bairro_id"]
isOneToOne: false
      referencedRelation: "m2_bairros"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_tokens_mcp": {
                  Row: {
                    "cliente_id": string,"criado_em": string,"hash_token": string,"id": string,"oauth_cliente_id": string | null,"prefixo": string,"revogado_em": string | null,"ultimo_uso_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": string,"criado_em"?: string,"hash_token": string,"id"?: string,"oauth_cliente_id"?: string | null,"prefixo": string,"revogado_em"?: string | null,"ultimo_uso_em"?: string | null
                  }
                  Update: {
                    "cliente_id"?: string,"criado_em"?: string,"hash_token"?: string,"id"?: string,"oauth_cliente_id"?: string | null,"prefixo"?: string,"revogado_em"?: string | null,"ultimo_uso_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_tokens_mcp_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "m2_clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_tokens_mcp_oauth_cliente_id_fkey"
      columns: ["oauth_cliente_id"]
isOneToOne: false
      referencedRelation: "m2_oauth_clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_transacoes": {
                  Row: {
                    "area_construida_guia": number | null,"atualizado_em": string,"bairro_id": number,"base_calculo": number | null,"cartorio": string | null,"cep": string | null,"complemento": string | null,"criado_em": string,"data_transacao": string,"eh_compra_venda": boolean,"execucao_id": string,"fracao_ideal_guia": number | null,"hash_linha": string,"id": string,"logradouro": string,"matricula": string | null,"mes_referencia": string,"natureza": string,"numero": number | null,"origem_bairro": Database["public"]['Enums']["m2_origem_bairro"],"predio_id": string | null,"proporcao_transmitida": number | null,"sql": string,"tipo_financiamento": string | null,"unidade_id": string | null,"unidade_sem_cadastro_proprio": boolean,"uso_iptu_guia": string | null,"valor_declarado": number,"valor_financiado": number,"valor_venal_referencia": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area_construida_guia"?: number | null,"atualizado_em"?: string,"bairro_id": number,"base_calculo"?: number | null,"cartorio"?: string | null,"cep"?: string | null,"complemento"?: string | null,"criado_em"?: string,"data_transacao": string,"eh_compra_venda": boolean,"execucao_id": string,"fracao_ideal_guia"?: number | null,"hash_linha": string,"id"?: string,"logradouro": string,"matricula"?: string | null,"mes_referencia": string,"natureza": string,"numero"?: number | null,"origem_bairro": Database["public"]['Enums']["m2_origem_bairro"],"predio_id"?: string | null,"proporcao_transmitida"?: number | null,"sql": string,"tipo_financiamento"?: string | null,"unidade_id"?: string | null,"unidade_sem_cadastro_proprio"?: boolean,"uso_iptu_guia"?: string | null,"valor_declarado": number,"valor_financiado"?: number,"valor_venal_referencia"?: number | null
                  }
                  Update: {
                    "area_construida_guia"?: number | null,"atualizado_em"?: string,"bairro_id"?: number,"base_calculo"?: number | null,"cartorio"?: string | null,"cep"?: string | null,"complemento"?: string | null,"criado_em"?: string,"data_transacao"?: string,"eh_compra_venda"?: boolean,"execucao_id"?: string,"fracao_ideal_guia"?: number | null,"hash_linha"?: string,"id"?: string,"logradouro"?: string,"matricula"?: string | null,"mes_referencia"?: string,"natureza"?: string,"numero"?: number | null,"origem_bairro"?: Database["public"]['Enums']["m2_origem_bairro"],"predio_id"?: string | null,"proporcao_transmitida"?: number | null,"sql"?: string,"tipo_financiamento"?: string | null,"unidade_id"?: string | null,"unidade_sem_cadastro_proprio"?: boolean,"uso_iptu_guia"?: string | null,"valor_declarado"?: number,"valor_financiado"?: number,"valor_venal_referencia"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_transacoes_bairro_id_fkey"
      columns: ["bairro_id"]
isOneToOne: false
      referencedRelation: "m2_bairros"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_transacoes_execucao_id_fkey"
      columns: ["execucao_id"]
isOneToOne: false
      referencedRelation: "m2_execucoes_ingestao"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_transacoes_predio_id_fkey"
      columns: ["predio_id"]
isOneToOne: false
      referencedRelation: "m2_predios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_transacoes_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "m2_unidades"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_unidades": {
                  Row: {
                    "andar_inferido": number | null,"area_construida": number,"atualizado_em": string,"complemento": string | null,"criado_em": string,"fracao_ideal": number | null,"id": string,"planta_id": string | null,"predio_id": string,"sql": string,"tipo_unidade": Database["public"]['Enums']["m2_tipo_unidade"],"uso_iptu": string
                  }
                  ComputedFields: never
                  Insert: {
                    "andar_inferido"?: number | null,"area_construida": number,"atualizado_em"?: string,"complemento"?: string | null,"criado_em"?: string,"fracao_ideal"?: number | null,"id"?: string,"planta_id"?: string | null,"predio_id": string,"sql": string,"tipo_unidade": Database["public"]['Enums']["m2_tipo_unidade"],"uso_iptu": string
                  }
                  Update: {
                    "andar_inferido"?: number | null,"area_construida"?: number,"atualizado_em"?: string,"complemento"?: string | null,"criado_em"?: string,"fracao_ideal"?: number | null,"id"?: string,"planta_id"?: string | null,"predio_id"?: string,"sql"?: string,"tipo_unidade"?: Database["public"]['Enums']["m2_tipo_unidade"],"uso_iptu"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_unidades_planta_id_fkey"
      columns: ["planta_id"]
isOneToOne: false
      referencedRelation: "m2_plantas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_unidades_predio_id_fkey"
      columns: ["predio_id"]
isOneToOne: false
      referencedRelation: "m2_predios"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_uso_mcp": {
                  Row: {
                    "chamadas": number,"criado_em": string,"janela": string,"token_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chamadas"?: number,"criado_em"?: string,"janela": string,"token_id": string
                  }
                  Update: {
                    "chamadas"?: number,"criado_em"?: string,"janela"?: string,"token_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_uso_mcp_token_id_fkey"
      columns: ["token_id"]
isOneToOne: false
      referencedRelation: "m2_tokens_mcp"
      referencedColumns: ["id"]
    }
                  ]
                },"m2_vendas_consolidadas": {
                  Row: {
                    "area_privativa": number | null,"atualizado_em": string,"criado_em": string,"data_transacao": string,"fora_da_curva": boolean,"id": string,"m2_iptu": number,"m2_privativo": number | null,"marcado_manual": boolean,"planta_id": string | null,"predio_id": string,"qtd_vagas_separadas": number,"selo_area": Database["public"]['Enums']["m2_selo_area"],"transacao_apartamento_id": string,"transacoes_vagas_ids": (string)[],"unidade_id": string,"vagas_inclusas_area": number | null,"valor_apartamento": number,"valor_total": number,"valor_vagas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "area_privativa"?: number | null,"atualizado_em"?: string,"criado_em"?: string,"data_transacao": string,"fora_da_curva"?: boolean,"id"?: string,"m2_iptu": number,"m2_privativo"?: number | null,"marcado_manual"?: boolean,"planta_id"?: string | null,"predio_id": string,"qtd_vagas_separadas"?: number,"selo_area": Database["public"]['Enums']["m2_selo_area"],"transacao_apartamento_id": string,"transacoes_vagas_ids"?: (string)[],"unidade_id": string,"vagas_inclusas_area"?: number | null,"valor_apartamento": number,"valor_total": number,"valor_vagas"?: number
                  }
                  Update: {
                    "area_privativa"?: number | null,"atualizado_em"?: string,"criado_em"?: string,"data_transacao"?: string,"fora_da_curva"?: boolean,"id"?: string,"m2_iptu"?: number,"m2_privativo"?: number | null,"marcado_manual"?: boolean,"planta_id"?: string | null,"predio_id"?: string,"qtd_vagas_separadas"?: number,"selo_area"?: Database["public"]['Enums']["m2_selo_area"],"transacao_apartamento_id"?: string,"transacoes_vagas_ids"?: (string)[],"unidade_id"?: string,"vagas_inclusas_area"?: number | null,"valor_apartamento"?: number,"valor_total"?: number,"valor_vagas"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "m2_vendas_consolidadas_planta_id_fkey"
      columns: ["planta_id"]
isOneToOne: false
      referencedRelation: "m2_plantas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_vendas_consolidadas_predio_id_fkey"
      columns: ["predio_id"]
isOneToOne: false
      referencedRelation: "m2_predios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_vendas_consolidadas_transacao_apartamento_id_fkey"
      columns: ["transacao_apartamento_id"]
isOneToOne: true
      referencedRelation: "m2_transacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "m2_vendas_consolidadas_unidade_id_fkey"
      columns: ["unidade_id"]
isOneToOne: false
      referencedRelation: "m2_unidades"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "m2_aplicar_calibracao_plantas":
{ Args: { "historico": Json,"plantas": Json }; Returns: number
                           },
"m2_atualizar_fator_predio":
{ Args: { "fatores": (number)[],"ids": (string)[] }; Returns: number
                           },
"m2_atualizar_prioridades":
{ Args: { "ids": (string)[],"prioridades": (number)[] }; Returns: number
                           },
"m2_bloqueia_cliente":
{ Args: { "p_bloquear": boolean,"p_cliente_id": string }; Returns: undefined
                           },
"m2_buscar_predio_por_endereco":
{ Args: { "limiar_similaridade"?: number,"limite"?: number,"texto": string }; Returns: {
              "ano_construcao": number,"bairro": string,"bairro_slug": string,"endereco": string,"logradouro": string,"numero": number,"predio_id": string,"similaridade": number,"total_unidades": number
            }[]
                           },
"m2_casar_anuncio":
{ Args: { "anuncio_id": string,"planta_id": string,"predio_id": string }; Returns: {
              "andar": number | null,
"area_privativa": number | null,
"area_privativa_max": number | null,
"area_privativa_min": number | null,
"atualizado_em": string,
"casado_manual": boolean,
"coletado_em": string,
"confianca_casamento": number | null,
"criado_em": string,
"dominio": string,
"execucao_id": string,
"finalidade": Database["public"]['Enums']["m2_finalidade_anuncio"] | null,
"fonte": Database["public"]['Enums']["m2_fonte_dado"],
"id": string,
"logradouro_extraido": string | null,
"nome_condominio": string | null,
"numero_extraido": number | null,
"planta_id": string | null,
"preco_pedido": number | null,
"predio_id": string | null,
"quartos": number | null,
"status_casamento": Database["public"]['Enums']["m2_status_casamento"],
"url": string,
"vagas": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "m2_anuncios"
        isOneToOne: true
        isSetofReturn: false
      } },
"m2_casar_edital":
{ Args: { "edital_id": string,"predio_id": string,"unidade_id": string }; Returns: {
              "area_comum": number | null,
"area_privativa": number | null,
"area_total": number | null,
"atualizado_em": string,
"cartorio": string | null,
"casado_manual": boolean,
"coletado_em": string,
"complemento_extraido": string | null,
"criado_em": string,
"data_leilao": string | null,
"dominio": string,
"execucao_id": string,
"fracao_ideal": number | null,
"id": string,
"logradouro_extraido": string | null,
"matricula": string | null,
"numero_extraido": number | null,
"origem_documento": string,
"predio_id": string | null,
"status_casamento": Database["public"]['Enums']["m2_status_casamento_edital"],
"unidade_id": string | null,
"url": string,
"url_documento": string | null,
"vagas": number | null,
"vagas_vinculadas_area": boolean | null,
"valor_avaliacao": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "m2_editais_leilao"
        isOneToOne: true
        isSetofReturn: false
      } },
"m2_clientes_mcp":
{ Args: Record<PropertyKey, never>; Returns: {
              "bloqueado_em": string,"chamadas_24h": number,"criado_em": string,"email": string,"id": string,"tokens_ativos": number,"ultimo_uso_em": string
            }[]
                           },
"m2_cobertura_atual":
{ Args: Record<PropertyKey, never>; Returns: {
              "bairro_id": number,"bairro_nome": string,"calculado_em": string,"pct_cobertura": number,"vendas_24m": number,"vendas_calibrada": number,"vendas_confirmada": number,"vendas_estimada": number,"vendas_indicativa": number,"vendas_sem_dado": number
            }[]
                           },
"m2_confirmar_area_planta":
{ Args: { "area_privativa": number,"observacao": string,"planta_id": string,"vagas_inclusas": number }; Returns: {
              "area_iptu_referencia": number,
"area_privativa": number | null,
"atualizado_em": string,
"criado_em": string,
"especial": boolean,
"faixa_erro_pct": number | null,
"fator": number | null,
"fonte_area": Database["public"]['Enums']["m2_fonte_dado"] | null,
"id": string,
"motivo_revisao": Database["public"]['Enums']["m2_motivo_revisao"] | null,
"predio_id": string,
"qtd_unidades": number,
"quartos": number | null,
"revisao_pendente": boolean,
"selo": Database["public"]['Enums']["m2_selo_area"],
"vagas_inclusas": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "m2_plantas"
        isOneToOne: true
        isSetofReturn: false
      } },
"m2_cria_codigo_oauth":
{ Args: { "p_cliente_id": string,"p_code_challenge": string,"p_codigo_hash": string,"p_oauth_cliente_id": string,"p_redirect_uri": string,"p_validade_s": number }; Returns: undefined
                           },
"m2_eh_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"m2_entra_cliente":
{ Args: { "p_email": string,"p_limite_novos_dia": number,"p_sub": string }; Returns: {
              "cliente_id": string,"situacao": string
            }[]
                           },
"m2_fila_revisao":
{ Args: { "bairro": number,"deslocamento": number,"janela_meses": number,"limite": number,"motivo": Database["public"]['Enums']["m2_motivo_revisao"] }; Returns: {
              "area_iptu": number,"area_privativa": number,"areas_anuncios": (number)[],"areas_editais": (number)[],"bairro_nome": string,"data_venda": string,"fator": number,"fator_predio": number,"item_id": string,"logradouro": string,"m2_privativo": number,"motivo": Database["public"]['Enums']["m2_motivo_revisao"],"numero": number,"predio_id": string,"selo": Database["public"]['Enums']["m2_selo_area"],"tipo": string,"total_motivo": number,"unidade": string,"valor_total": number,"vendas_janela": number
            }[]
                           },
"m2_itbi_substituir_ano":
{ Args: { "ano": number,"execucao_id": string,"hashes": (string)[] }; Returns: number
                           },
"m2_ligar_transacoes_unidades":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"m2_listar_predios":
{ Args: { "bairro": number,"busca": string,"deslocamento": number,"janela_meses": number,"limite": number,"selo": Database["public"]['Enums']["m2_selo_area"],"so_revisao": boolean }; Returns: {
              "ano_construcao": number,"bairro_id": number,"bairro_nome": string,"id": string,"logradouro": string,"numero": number,"pior_selo": Database["public"]['Enums']["m2_selo_area"],"qtd_plantas": number,"revisao_pendente": boolean,"total": number,"total_unidades": number,"vendas_janela": number
            }[]
                           },
"m2_marcar_outlier":
{ Args: { "fora_da_curva": boolean,"venda_id": string }; Returns: {
              "area_privativa": number | null,
"atualizado_em": string,
"criado_em": string,
"data_transacao": string,
"fora_da_curva": boolean,
"id": string,
"m2_iptu": number,
"m2_privativo": number | null,
"marcado_manual": boolean,
"planta_id": string | null,
"predio_id": string,
"qtd_vagas_separadas": number,
"selo_area": Database["public"]['Enums']["m2_selo_area"],
"transacao_apartamento_id": string,
"transacoes_vagas_ids": (string)[],
"unidade_id": string,
"vagas_inclusas_area": number | null,
"valor_apartamento": number,
"valor_total": number,
"valor_vagas": number
            }
                          SetofOptions: {
        from: "*"
        to: "m2_vendas_consolidadas"
        isOneToOne: true
        isSetofReturn: false
      } },
"m2_marcar_planta_especial":
{ Args: { "especial": boolean,"planta_id": string }; Returns: {
              "area_iptu_referencia": number,
"area_privativa": number | null,
"atualizado_em": string,
"criado_em": string,
"especial": boolean,
"faixa_erro_pct": number | null,
"fator": number | null,
"fonte_area": Database["public"]['Enums']["m2_fonte_dado"] | null,
"id": string,
"motivo_revisao": Database["public"]['Enums']["m2_motivo_revisao"] | null,
"predio_id": string,
"qtd_unidades": number,
"quartos": number | null,
"revisao_pendente": boolean,
"selo": Database["public"]['Enums']["m2_selo_area"],
"vagas_inclusas": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "m2_plantas"
        isOneToOne: true
        isSetofReturn: false
      } },
"m2_mediana_bairro":
{ Args: { "bairro_slug": string,"janela_meses": number,"quartos": number }; Returns: {
              "bairro": string,"com_vagas_inclusas": number,"distribuicao_selos": Json,"mediana_m2_privativo": number,"n_vendas": number,"p25": number,"p75": number
            }[]
                           },
"m2_normalizar_endereco":
{ Args: { "texto": string }; Returns: string
                           },
"m2_substituir_fatores_referencia":
{ Args: { "linhas": Json }; Returns: number
                           },
"m2_troca_codigo_oauth":
{ Args: { "p_challenge_do_verifier": string,"p_codigo_hash": string,"p_oauth_cliente_id": string,"p_redirect_uri": string,"p_token_hash": string,"p_token_prefixo": string }; Returns: string
                           },
"m2_ultimas_execucoes":
{ Args: Record<PropertyKey, never>; Returns: {
              "concluida_em": string,"iniciada_em": string,"linhas_gravadas": number,"linhas_lidas": number,"mensagem_erro": string,"rotina": string,"status": Database["public"]['Enums']["m2_status_execucao"]
            }[]
                           },
"m2_unidades_por_sql":
{ Args: { "sqls": (string)[] }; Returns: {
              "bairro_id": number,"predio_id": string,"sql": string,"unidade_id": string
            }[]
                           },
"m2_usa_token_mcp":
{ Args: { "p_hash": string,"p_por_dia": number,"p_por_minuto": number }; Returns: {
              "espera_s": number,"permitido": boolean,"token_id": string
            }[]
                           },
"m2_vendas_remover_obsoletas":
{ Args: { "manter": (string)[] }; Returns: number
                           }
          }
          Enums: {
            "m2_finalidade_anuncio": "venda"|"aluguel","m2_fonte_dado": "itbi"|"iptu"|"anuncio"|"pagina_condominio"|"edital_leilao"|"revisao_manual"|"fator_referencia"|"calibracao","m2_motivo_revisao": "fator_incoerente"|"anuncios_divergentes"|"anuncio_ambiguo"|"planta_especial"|"venda_fora_da_curva"|"edital_divergente","m2_origem_bairro": "campo"|"cep"|"quadra"|"iptu","m2_papel_usuario": "admin","m2_selo_area": "confirmada"|"calibrada"|"indicativa"|"estimada"|"sem_dado","m2_status_casamento": "casado_planta"|"casado_predio"|"ambiguo"|"sem_predio"|"descartado","m2_status_casamento_edital": "casado_unidade"|"casado_predio"|"sem_predio"|"descartado","m2_status_execucao": "em_andamento"|"concluida"|"falhou"|"substituida","m2_tipo_unidade": "apartamento"|"vaga"|"outro"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "m2_finalidade_anuncio": ["venda", "aluguel"],"m2_fonte_dado": ["itbi", "iptu", "anuncio", "pagina_condominio", "edital_leilao", "revisao_manual", "fator_referencia", "calibracao"],"m2_motivo_revisao": ["fator_incoerente", "anuncios_divergentes", "anuncio_ambiguo", "planta_especial", "venda_fora_da_curva", "edital_divergente"],"m2_origem_bairro": ["campo", "cep", "quadra", "iptu"],"m2_papel_usuario": ["admin"],"m2_selo_area": ["confirmada", "calibrada", "indicativa", "estimada", "sem_dado"],"m2_status_casamento": ["casado_planta", "casado_predio", "ambiguo", "sem_predio", "descartado"],"m2_status_casamento_edital": ["casado_unidade", "casado_predio", "sem_predio", "descartado"],"m2_status_execucao": ["em_andamento", "concluida", "falhou", "substituida"],"m2_tipo_unidade": ["apartamento", "vaga", "outro"]
          }
        }
} as const

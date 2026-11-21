#!/bin/bash
# Garante a coleta mínima de anúncios e editais (princípio 4 e seção 20): nenhum campo pessoal ou de conteúdo, nenhum PDF gravado.
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')
case "$path" in
  */packages/ingestao/src/anuncios/*|*/packages/ingestao/src/leiloes/*) ;;
  *) exit 0 ;;
esac
# Ignora arquivos de teste, que podem citar os termos para provar que são filtrados.
case "$path" in *.test.ts) exit 0 ;; esac
if echo "$content" | grep -qiE '\b(foto|fotos|imagem|imagens|telefone|whatsapp|email|e-mail|corretor|creci|descricao|description|photos|phone|nome_proprietario|nome_devedor|cpf|cnpj|devedor|executado|proprietario|estado_civil)\b'; then
  echo "Bloqueado: a coleta só pode gravar os campos das tabelas anuncios e editais_leilao (seção 7.2, princípio 4 e seção 20). Remova campos de foto, contato, corretor, descrição ou dados de pessoas." >&2
  exit 2
fi
# PDF de leilão só em memória (seção 20).
if echo "$content" | grep -qE 'writeFile|createWriteStream|\.upload\('; then
  echo "Bloqueado: documentos de leilão não podem ser gravados em disco nem no Storage (seção 20). Processe o PDF em memória e descarte." >&2
  exit 2
fi
exit 0

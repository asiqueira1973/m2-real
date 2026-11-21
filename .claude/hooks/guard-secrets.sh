#!/bin/bash
# Bloqueia credencial privilegiada em código que roda no navegador (painel).
# Implementa as seções 6.3 e 20: service role, token do GitHub e chave do Firecrawl só no servidor.
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')

# Código de cliente do painel: telas e features. src/server/ e src/app/api/ são servidor e ficam liberados.
case "$path" in
  */apps/web/src/app/\(painel\)/*|*/apps/web/src/features/*|*/apps/web/src/components/*) ;;
  *) exit 0 ;;
esac

if echo "$content" | grep -qE 'SUPABASE_SERVICE_ROLE_KEY|service_role|GITHUB_TOKEN_DISPATCH|FIRECRAWL_API_KEY|ANTHROPIC_API_KEY'; then
  echo "Bloqueado: credencial privilegiada em código de cliente (seções 6.3 e 20). Mova a operação para apps/web/src/server/ ou para uma rota em src/app/api/ e chame-a do cliente." >&2
  exit 2
fi
# Arquivo de cliente marcado com 'use client' não pode importar o acesso de servidor.
if echo "$content" | grep -q "use client" && echo "$content" | grep -qE "from ['\"].*server/"; then
  echo "Bloqueado: componente 'use client' importando src/server/ (seção 20). Use uma rota de API ou server action." >&2
  exit 2
fi
exit 0

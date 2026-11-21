#!/bin/bash
# Depois de escrever uma migration, lembra de rodar os advisors do Supabase (seção 20).
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
case "$path" in
  */supabase/migrations/*)
    echo "Migration escrita. Depois de aplicá-la, rode get_advisors (security e performance), resolva alertas críticos e regenere o schema.sql (seções 18.5 e 20)." >&2
    exit 2 ;;
esac
exit 0
